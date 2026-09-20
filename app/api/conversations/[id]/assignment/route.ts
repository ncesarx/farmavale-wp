import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  canCollaborateOnConversation,
  isEligibleTransferTarget,
} from "@/lib/conversation-collaboration";
import { hasTrustedOrigin } from "@/lib/http-security";
import { createUserNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime";

const schema = z.object({ agentId: z.string().min(1) });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_assignment" }, { status: 400 });

  const { id } = await context.params;
  const [conversation, target] = await Promise.all([
    prisma.conversation.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, protocol: true, status: true, assignedAgentId: true },
    }),
    prisma.user.findFirst({
      where: { id: parsed.data.agentId, organizationId: user.organizationId },
      select: {
        id: true, name: true, role: true, status: true, maxOpenConversations: true,
        _count: { select: { assignedConversations: { where: { status: { in: ["OPEN", "PENDING"] } } } } },
      },
    }),
  ]);
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canCollaborateOnConversation(user.role, user.id, conversation.assignedAgentId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!["QUEUED", "OPEN", "PENDING"].includes(conversation.status)) {
    return NextResponse.json({ error: "conversation_not_transferable" }, { status: 409 });
  }
  if (!target || !isEligibleTransferTarget({
    role: target.role,
    status: target.status,
    maxOpenConversations: target.maxOpenConversations,
    openConversations: target._count.assignedConversations,
  })) return NextResponse.json({ error: "agent_unavailable" }, { status: 409 });
  if (conversation.assignedAgentId === target.id) {
    return NextResponse.json({ error: "already_assigned" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.conversationAssignment.updateMany({
      where: { conversationId: id, endedAt: null },
      data: { endedAt: new Date() },
    });
    await tx.conversation.update({
      where: { id },
      data: { assignedAgentId: target.id, status: "OPEN" },
    });
    await tx.conversationAssignment.create({
      data: { conversationId: id, agentId: target.id, reason: conversation.assignedAgentId ? "TRANSFER" : "MANUAL" },
    });
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: conversation.assignedAgentId ? "CONVERSATION_TRANSFERRED" : "CONVERSATION_MANUALLY_ASSIGNED",
        entityType: "Conversation",
        entityId: id,
        metadata: { fromAgentId: conversation.assignedAgentId, toAgentId: target.id },
      },
    });
  });

  await createUserNotification({
    organizationId: user.organizationId,
    userId: target.id,
    type: "ASSIGNMENT",
    title: "Atendimento transferido",
    body: `${user.name} encaminhou o protocolo ${conversation.protocol} para você.`,
    href: `/?conversation=${conversation.id}`,
    metadata: { conversationId: conversation.id, actorId: user.id },
  });
  publishRealtimeEvent({ organizationSlug: user.organization.slug, type: "conversation.assigned" });
  return NextResponse.json({ assigned: true, agent: { id: target.id, name: target.name } });
}
