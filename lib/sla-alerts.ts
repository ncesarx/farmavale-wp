import { prisma } from "@/lib/prisma";
import { createUserNotification } from "@/lib/notifications";
import { DEFAULT_SLA_POLICIES, slaState, type SlaPriority } from "@/lib/sla-policy";

export async function scanSlaAlerts(now = new Date()) {
  const conversations = await prisma.conversation.findMany({
    where: { status: { in: ["OPEN", "PENDING"] }, assignedAgentId: { not: null }, slaDueAt: { not: null } },
    select: {
      id: true, organizationId: true, assignedAgentId: true, protocol: true,
      priority: true, slaDueAt: true, contact: { select: { name: true } },
    },
  });
  const organizationIds = [...new Set(conversations.map((item) => item.organizationId))];
  const [policies, supervisors] = await Promise.all([
    prisma.slaPolicy.findMany({ where: { organizationId: { in: organizationIds }, isActive: true } }),
    prisma.user.findMany({
      where: { organizationId: { in: organizationIds }, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SUPERVISOR"] } },
      select: { id: true, organizationId: true },
    }),
  ]);
  let created = 0;
  let escalated = 0;

  for (const conversation of conversations) {
    if (!conversation.assignedAgentId || !conversation.slaDueAt) continue;
    const stored = policies.find((policy) => policy.organizationId === conversation.organizationId && policy.priority === conversation.priority);
    const fallback = DEFAULT_SLA_POLICIES[conversation.priority as SlaPriority];
    const warningMinutes = stored?.warningMinutes ?? fallback.warningMinutes;
    const state = slaState(conversation.slaDueAt, now, warningMinutes);
    if (state === "ON_TRACK") continue;
    const suffix = conversation.slaDueAt.toISOString();
    const notice = await createUserNotification({
      organizationId: conversation.organizationId, userId: conversation.assignedAgentId,
      type: "SLA_WARNING", title: state === "OVERDUE" ? "SLA vencido" : "SLA próximo do limite",
      body: `${conversation.contact.name} · ${conversation.protocol}`,
      href: `/?conversation=${conversation.id}`,
      metadata: { conversationId: conversation.id, slaDueAt: suffix, state },
      dedupKey: `sla:${state}:${conversation.id}:${suffix}`,
    });
    if (notice) created += 1;

    const escalationMinutes = stored?.escalateAfterMinutes ?? fallback.escalateAfterMinutes;
    const shouldEscalate = state === "OVERDUE" && (stored?.notifySupervisors ?? true)
      && now.getTime() >= conversation.slaDueAt.getTime() + escalationMinutes * 60_000;
    if (!shouldEscalate) continue;
    for (const supervisor of supervisors.filter((item) => item.organizationId === conversation.organizationId && item.id !== conversation.assignedAgentId)) {
      const escalation = await createUserNotification({
        organizationId: conversation.organizationId, userId: supervisor.id,
        type: "SLA_WARNING", title: "Atendimento escalonado",
        body: `${conversation.contact.name} · ${conversation.protocol}`,
        href: `/?conversation=${conversation.id}`,
        metadata: { conversationId: conversation.id, slaDueAt: suffix, escalated: true },
        dedupKey: `sla:escalated:${conversation.id}:${suffix}:${supervisor.id}`,
      });
      if (escalation) escalated += 1;
    }
  }
  return { checked: conversations.length, created, escalated };
}
