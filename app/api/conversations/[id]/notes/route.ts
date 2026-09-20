import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { canCollaborateOnConversation } from "@/lib/conversation-collaboration";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime";

const schema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_note" }, { status: 400 });

  const { id } = await context.params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, assignedAgentId: true },
  });
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canCollaborateOnConversation(user.role, user.id, conversation.assignedAgentId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: id,
        senderId: user.id,
        direction: "INTERNAL",
        status: "SENT",
        body: parsed.data.body,
        rawPayload: { source: "internal_note" },
      },
      select: { id: true, body: true, createdAt: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "CONVERSATION_NOTE_ADDED",
        entityType: "Conversation",
        entityId: id,
        metadata: { messageId: created.id },
      },
    });
    return created;
  });
  publishRealtimeEvent({ organizationSlug: user.organization.slug, type: "inbox.changed" });
  return NextResponse.json({ note }, { status: 201 });
}
