import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime";
import {
  MetaApiError,
  getMetaMessageId,
  normalizeWhatsAppRecipient,
  sendWhatsAppText,
} from "@/lib/whatsapp";

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4096),
  clientRequestId: z.string().uuid(),
});

const privilegedRoles = new Set(["OWNER", "ADMIN", "SUPERVISOR"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_message" }, { status: 400 });
  }

  const { id } = await context.params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      contact: { select: { phoneE164: true } },
      channel: { select: { type: true, externalId: true, isActive: true } },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (
    conversation.assignedAgentId !== user.id &&
    !privilegedRoles.has(user.role)
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!["OPEN", "PENDING"].includes(conversation.status)) {
    return NextResponse.json(
      { error: "conversation_not_sendable" },
      { status: 409 },
    );
  }
  if (
    conversation.channel.type !== "WHATSAPP" ||
    !conversation.channel.isActive ||
    !conversation.channel.externalId
  ) {
    return NextResponse.json(
      { error: "whatsapp_not_configured" },
      { status: 409 },
    );
  }

  const duplicate = await prisma.message.findUnique({
    where: { clientRequestId: parsed.data.clientRequestId },
    select: { id: true, status: true },
  });
  if (duplicate) {
    return NextResponse.json({ message: duplicate, duplicate: true });
  }

  const queued = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: user.id,
      clientRequestId: parsed.data.clientRequestId,
      direction: "OUTBOUND",
      status: "QUEUED",
      body: parsed.data.body,
      rawPayload: { source: "agent_console" },
    },
    select: { id: true },
  });

  try {
    const metaResponse = await sendWhatsAppText(
      normalizeWhatsAppRecipient(conversation.contact.phoneE164),
      parsed.data.body,
      conversation.channel.externalId,
    );
    const externalId = getMetaMessageId(metaResponse);
    if (!externalId) throw new Error("Meta response did not include a message id");

    const now = new Date();
    const message = await prisma.$transaction(async (tx) => {
      const sent = await tx.message.update({
        where: { id: queued.id },
        data: {
          externalId,
          status: "SENT",
          sentAt: now,
          rawPayload: { provider: "meta", accepted: true },
        },
        select: { id: true, status: true, createdAt: true },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: now,
          firstResponseAt: conversation.firstResponseAt ?? now,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "WHATSAPP_MESSAGE_SENT",
          entityType: "Message",
          entityId: sent.id,
          metadata: { conversationId: conversation.id },
        },
      });
      return sent;
    });

    publishRealtimeEvent({
      organizationSlug: user.organization.slug,
      type: "inbox.changed",
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const providerStatus = error instanceof MetaApiError ? error.status : null;
    const providerCode = error instanceof MetaApiError ? error.code : null;

    await prisma.$transaction([
      prisma.message.update({
        where: { id: queued.id },
        data: {
          status: "FAILED",
          rawPayload: {
            provider: "meta",
            accepted: false,
            providerStatus,
            providerCode,
          },
        },
      }),
      prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "WHATSAPP_MESSAGE_FAILED",
          entityType: "Message",
          entityId: queued.id,
          metadata: {
            conversationId: conversation.id,
            providerStatus,
            providerCode,
          },
        },
      }),
    ]);

    publishRealtimeEvent({
      organizationSlug: user.organization.slug,
      type: "inbox.changed",
    });
    console.error("whatsapp_send_failed", {
      messageId: queued.id,
      providerStatus,
      providerCode,
    });
    return NextResponse.json({ error: "meta_rejected" }, { status: 502 });
  }
}
