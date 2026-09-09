import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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

async function acquireAssignmentLock(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  await tx.$queryRaw<Array<{ locked: boolean }>>`
    SELECT TRUE AS locked
    FROM pg_advisory_xact_lock(hashtext(${organizationId}))
  `;
}

async function assignConversationWithLock(
  tx: Prisma.TransactionClient,
  organizationId: string,
  conversationId: string,
): Promise<AutoAssignmentResult> {
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

export async function autoAssignConversation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  conversationId: string,
): Promise<AutoAssignmentResult> {
  await acquireAssignmentLock(tx, organizationId);
  return assignConversationWithLock(tx, organizationId, conversationId);
}

export async function drainQueuedConversations(
  organizationId: string,
  limit = 50,
) {
  let assigned = 0;

  for (let attempt = 0; attempt < limit; attempt += 1) {
    const outcome = await prisma.$transaction(async (tx) => {
      await acquireAssignmentLock(tx, organizationId);

      const conversation = await tx.conversation.findFirst({
        where: {
          organizationId,
          assignedAgentId: null,
          status: "QUEUED",
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });

      if (!conversation) return "empty" as const;
      return assignConversationWithLock(tx, organizationId, conversation.id);
    });

    if (outcome === "assigned") {
      assigned += 1;
      continue;
    }

    if (outcome === "already_assigned") continue;
    break;
  }

  return assigned;
}
