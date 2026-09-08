import type { Prisma } from "@/generated/prisma/client";

export type AssignmentCandidate = {
  id: string;
  maxOpenConversations: number;
  openConversations: number;
};

export function selectAssignmentCandidate(candidates: AssignmentCandidate[]) {
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.maxOpenConversations > 0 &&
          candidate.openConversations < candidate.maxOpenConversations,
      )
      .toSorted(
        (left, right) =>
          left.openConversations - right.openConversations ||
          left.id.localeCompare(right.id),
      )[0] ?? null
  );
}

export type AutoAssignmentResult = "assigned" | "already_assigned" | "queued";

export async function autoAssignConversation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  conversationId: string,
): Promise<AutoAssignmentResult> {
  await tx.$queryRaw<Array<{ locked: boolean }>>`
    SELECT TRUE AS locked
    FROM pg_advisory_xact_lock(hashtext(${organizationId}))
  `;

  const conversation = await tx.conversation.findUnique({
    where: { id: conversationId },
    select: { assignedAgentId: true },
  });
  if (!conversation) throw new Error("Conversation not found during auto assignment");
  if (conversation.assignedAgentId) return "already_assigned";

  const agents = await tx.user.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      agentStatus: "AVAILABLE",
      role: { in: ["OWNER", "ADMIN", "SUPERVISOR", "AGENT"] },
      maxOpenConversations: { gt: 0 },
    },
    select: {
      id: true,
      maxOpenConversations: true,
      _count: {
        select: {
          assignedConversations: {
            where: { status: { in: ["OPEN", "PENDING"] } },
          },
        },
      },
    },
  });

  const candidate = selectAssignmentCandidate(
    agents.map((agent) => ({
      id: agent.id,
      maxOpenConversations: agent.maxOpenConversations,
      openConversations: agent._count.assignedConversations,
    })),
  );
  if (!candidate) return "queued";

  const claimed = await tx.conversation.updateMany({
    where: {
      id: conversationId,
      organizationId,
      assignedAgentId: null,
    },
    data: {
      assignedAgentId: candidate.id,
      status: "OPEN",
    },
  });
  if (claimed.count === 0) return "already_assigned";

  await tx.conversationAssignment.create({
    data: {
      conversationId,
      agentId: candidate.id,
      reason: "AUTO",
    },
  });

  await tx.auditLog.create({
    data: {
      organizationId,
      actorId: candidate.id,
      action: "CONVERSATION_AUTO_ASSIGNED",
      entityType: "Conversation",
      entityId: conversationId,
      metadata: {
        reason: "least_open_conversations",
        openConversationsBeforeAssignment: candidate.openConversations,
        capacity: candidate.maxOpenConversations,
      },
    },
  });

  return "assigned";
}
