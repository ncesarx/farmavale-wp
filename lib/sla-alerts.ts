import { prisma } from "@/lib/prisma";
import { createUserNotification } from "@/lib/notifications";

export async function scanSlaAlerts(now = new Date()) {
  const warningLimit = new Date(now.getTime() + 15 * 60 * 1000);
  const conversations = await prisma.conversation.findMany({
    where: { status: { in: ["OPEN", "PENDING"] }, assignedAgentId: { not: null }, slaDueAt: { lte: warningLimit } },
    select: {
      id: true, organizationId: true, assignedAgentId: true, protocol: true, slaDueAt: true,
      contact: { select: { name: true } },
    },
  });
  let created = 0;
  for (const conversation of conversations) {
    if (!conversation.assignedAgentId || !conversation.slaDueAt) continue;
    const notification = await createUserNotification({
      organizationId: conversation.organizationId,
      userId: conversation.assignedAgentId,
      type: "SLA_WARNING",
      title: conversation.slaDueAt <= now ? "SLA vencido" : "SLA próximo do limite",
      body: `${conversation.contact.name} · ${conversation.protocol}`,
      href: `/?conversation=${conversation.id}`,
      metadata: { conversationId: conversation.id, slaDueAt: conversation.slaDueAt.toISOString() },
      dedupKey: `sla:${conversation.id}:${conversation.slaDueAt.toISOString()}`,
    });
    if (notification) created += 1;
  }
  return { checked: conversations.length, created };
}
