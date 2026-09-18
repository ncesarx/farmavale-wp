import type { Prisma } from "@/generated/prisma/client";

export const AUTOMATION_ROLES = ["OWNER", "ADMIN", "SUPERVISOR"] as const;
export const AUTOMATION_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export function canManageAutomations(role: string) {
  return AUTOMATION_ROLES.includes(role as (typeof AUTOMATION_ROLES)[number]);
}

export function normalizeKeyword(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

export function messageMatchesKeyword(message: string | null, keyword: string) {
  if (!message) return false;
  return message.toLocaleLowerCase("pt-BR").includes(normalizeKeyword(keyword));
}

export async function applyInboundAutomationRules(
  tx: Prisma.TransactionClient,
  organizationId: string,
  conversationId: string,
  body: string | null,
) {
  const rules = await tx.automationRule.findMany({
    where: { organizationId, isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { assignee: { select: { id: true, status: true, agentStatus: true, maxOpenConversations: true, _count: { select: { assignedConversations: { where: { status: { in: ["OPEN", "PENDING"] } } } } } } } },
  });
  const matched = rules.find((rule) => messageMatchesKeyword(body, rule.keyword));
  if (!matched) return { matched: false, assigned: false } as const;

  const assignee = matched.assignee;
  const mayAssign = assignee && assignee.status === "ACTIVE" && assignee.agentStatus === "AVAILABLE" && assignee._count.assignedConversations < assignee.maxOpenConversations;
  await tx.conversation.update({
    where: { id: conversationId },
    data: {
      ...(matched.priority ? { priority: matched.priority } : {}),
      ...(mayAssign ? { assignedAgentId: assignee.id, status: "OPEN" } : {}),
      ...(matched.tagId ? { tags: { connectOrCreate: { where: { conversationId_tagId: { conversationId, tagId: matched.tagId } }, create: { tagId: matched.tagId } } } } : {}),
    },
  });
  if (mayAssign) await tx.conversationAssignment.create({ data: { conversationId, agentId: assignee.id, reason: "AUTO" } });
  await tx.automationRule.update({ where: { id: matched.id }, data: { matchCount: { increment: 1 }, lastMatchedAt: new Date() } });
  await tx.auditLog.create({ data: { organizationId, action: "AUTOMATION_RULE_MATCHED", entityType: "Conversation", entityId: conversationId, metadata: { ruleId: matched.id, ruleName: matched.name, priority: matched.priority, tagId: matched.tagId, assigneeId: mayAssign ? assignee.id : null } } });
  return { matched: true, assigned: Boolean(mayAssign) } as const;
}
