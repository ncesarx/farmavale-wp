import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { autoAssignConversation } from "@/lib/conversation-assignment";
import { adeEligible, adeMessageIsRecent, decideAdeWelcome, isAdeActive, type AdeStage } from "@/lib/ade-welcome-policy";
import { getMetaMessageId, normalizeWhatsAppRecipient, sendWhatsAppText } from "@/lib/whatsapp";
import { publishRealtimeEvent } from "@/lib/realtime";

const SOURCE = "ade_welcome";
function eligible(phoneNumberId: string, phone: string) {
  return adeEligible({
    enabled: process.env.ADE_WELCOME_ENABLED, channelId: phoneNumberId,
    configuredChannelId: process.env.ADE_WELCOME_PHONE_NUMBER_ID,
    phone, allowlist: process.env.ADE_WELCOME_ALLOWLIST,
  });
}
function payload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
// Shares the organization lock with automatic assignment and human takeover.
export async function lockAdeOrganization(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT TRUE AS locked FROM pg_advisory_xact_lock(hashtext(${organizationId}))`;
}
export async function stopAdeWelcome(tx: Prisma.TransactionClient, conversationId: string) {
  const current = await tx.conversation.findUniqueOrThrow({
    where: { id: conversationId }, select: { welcomeName: true, welcomeReason: true },
  });
  const stopped = await tx.conversation.updateMany({
    where: { id: conversationId, welcomeStage: { in: ["NAME", "REASON"] } },
    data: { welcomeStage: "HUMAN", welcomeUpdatedAt: new Date() },
  });
  if (stopped.count) {
    await tx.message.create({
      data: { conversationId, direction: "INTERNAL", status: "RECEIVED",
        body: "Acolhimento Ade encerrado para continuidade humana. Nome preferido: " + (current.welcomeName ?? "Não informado") + ". Motivo informado: " + (current.welcomeReason ?? "Ainda não informado") + ". Confira o histórico antes de responder.",
        rawPayload: { source: SOURCE, handoff: true } },
    });
  }
  await tx.message.updateMany({
    where: { conversationId, status: "QUEUED", rawPayload: { path: ["dispatch"], equals: "pending" }, senderId: null, clientRequestId: { startsWith: "ade:" } },
    data: { status: "FAILED", rawPayload: { source: SOURCE, dispatch: "cancelled" } },
  });
}
export async function advanceAdeWelcome(
  tx: Prisma.TransactionClient,
  input: { conversationId: string; organizationId: string; phoneNumberId: string; phone: string; externalId: string; body: string | null; mediaType: string | null; timestamp: Date; isNew: boolean },
) {
  const conversation = await tx.conversation.findUniqueOrThrow({
    where: { id: input.conversationId },
    select: { welcomeStage: true, welcomeName: true, welcomeTurns: true, welcomeLastInboundAt: true, assignedAgentId: true, status: true },
  });
  if (!eligible(input.phoneNumberId, input.phone)) {
    if (isAdeActive(conversation.welcomeStage)) await stopAdeWelcome(tx, input.conversationId);
    return false;
  }
  if ((!input.isNew && !isAdeActive(conversation.welcomeStage)) || conversation.assignedAgentId || conversation.status !== "QUEUED") return false;
  if (!adeMessageIsRecent(input.timestamp)) {
    await stopAdeWelcome(tx, input.conversationId);
    return false;
  }
  if (conversation.welcomeLastInboundAt && input.timestamp < conversation.welcomeLastInboundAt) return isAdeActive(conversation.welcomeStage);
  const decision = decideAdeWelcome({
    stage: input.isNew ? "OFF" : conversation.welcomeStage as AdeStage,
    name: conversation.welcomeName, body: input.body, mediaType: input.mediaType, turns: conversation.welcomeTurns,
  });
  await tx.conversation.update({
    where: { id: input.conversationId },
    data: {
      welcomeStage: decision.stage, welcomeName: decision.name,
      welcomeReason: decision.reason, welcomeTurns: { increment: 1 }, welcomeUpdatedAt: new Date(), welcomeLastInboundAt: input.timestamp,
    },
  });
  // Cancel unsent earlier questions if the client supplied the information in a second message.
  await tx.message.updateMany({
    where: { conversationId: input.conversationId, status: "QUEUED", senderId: null, clientRequestId: { startsWith: "ade:" }, rawPayload: { path: ["dispatch"], equals: "pending" } },
    data: { status: "FAILED", rawPayload: { source: SOURCE, dispatch: "superseded" } },
  });
  await tx.message.create({
    data: {
      conversationId: input.conversationId, direction: "OUTBOUND", status: "QUEUED",
      clientRequestId: "ade:" + input.externalId, body: decision.reply,
      rawPayload: { source: SOURCE, dispatch: "pending", terminal: decision.stage === "HUMAN", inboundAt: input.timestamp.toISOString() },
    },
  });
  if (decision.stage === "HUMAN") {
    await tx.message.create({
      data: {
        conversationId: input.conversationId, direction: "INTERNAL", status: "RECEIVED",
        body: "Acolhimento Ade\nNome preferido: " + (decision.name ?? "Não informado") + "\nMotivo informado: " + (decision.reason ?? "Não informado") + "\nContinuidade: equipe humana. Não foram feitas orientações clínicas nem confirmações comerciais.",
        rawPayload: { source: SOURCE, handoff: true },
      },
    });
  }
  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId, action: decision.stage === "HUMAN" ? "ADE_HANDOFF_REQUESTED" : "ADE_WELCOME_ADVANCED",
      entityType: "Conversation", entityId: input.conversationId,
      metadata: { stage: decision.stage, messageExternalId: input.externalId },
    },
  });
  return decision.stage !== "HUMAN";
}

async function releaseToHuman(tx: Prisma.TransactionClient, conversationId: string, organizationId: string, reason: string) {
  await stopAdeWelcome(tx, conversationId);
  const assignment = await autoAssignConversation(tx, organizationId, conversationId);
  await tx.auditLog.create({
    data: { organizationId, action: "ADE_RELEASED_TO_HUMAN", entityType: "Conversation", entityId: conversationId, metadata: { reason } },
  });
  const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { assignedAgentId: true, protocol: true } });
  if (assignment === "assigned" && current.assignedAgentId) {
    await tx.notification.create({
      data: { organizationId, userId: current.assignedAgentId, type: "ASSIGNMENT", title: "Atendimento disponível após acolhimento", body: current.protocol, href: "/?conversation=" + conversationId },
    });
  }
}
// Pending messages are durable. An attempted delivery is never automatically retried:
// a timeout may mean Meta accepted it, so retrying could duplicate a customer message.
export async function processAdeWelcomeQueue(limit = 20, send: typeof sendWhatsAppText = sendWhatsAppText) {
  const pending = await prisma.message.findMany({
    where: {
      direction: "OUTBOUND", status: "QUEUED", senderId: null,
      clientRequestId: { startsWith: "ade:" },
      rawPayload: { path: ["dispatch"], equals: "pending" },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit,
    select: { id: true, conversationId: true, conversation: { select: { organizationId: true } } },
  });
  for (const candidate of pending) {
    const claimed = await prisma.$transaction(async tx => {
      await lockAdeOrganization(tx, candidate.conversation.organizationId);
      const message = await tx.message.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { conversation: { include: { channel: true, contact: true, organization: { select: { slug: true } } } } },
      });
      const meta = payload(message.rawPayload);
      if (message.status !== "QUEUED" || meta.dispatch !== "pending") return null;
      const conversation = message.conversation;
      const busy = await tx.message.count({
        where: { conversationId: conversation.id, status: "QUEUED", senderId: null, clientRequestId: { startsWith: "ade:" }, rawPayload: { path: ["dispatch"], equals: "attempted" } },
      });
      if (busy) return null;
      const recent = typeof meta.inboundAt === "string" && adeMessageIsRecent(new Date(meta.inboundAt));
      const allowed = eligible(conversation.channel.externalId, conversation.contact.phoneE164) &&
        ["QUEUED", "OPEN"].includes(conversation.status) && conversation.channel.isActive &&
        (meta.terminal === true || (isAdeActive(conversation.welcomeStage) && !conversation.assignedAgentId));
      if (!recent || !allowed || !message.body) {
        await tx.message.update({ where: { id: message.id }, data: { status: "FAILED", rawPayload: { source: SOURCE, dispatch: "cancelled" } } });
        if (isAdeActive(conversation.welcomeStage)) await releaseToHuman(tx, conversation.id, conversation.organizationId, "cancelled");
        return null;
      }
      await tx.message.update({
        where: { id: message.id }, data: { rawPayload: { source: SOURCE, dispatch: "attempted", attemptedAt: new Date().toISOString() } },
      });
      return { id: message.id, body: message.body, conversationId: conversation.id, organizationId: conversation.organizationId, slug: conversation.organization.slug, phone: conversation.contact.phoneE164, channelId: conversation.channel.externalId };
    });
    if (!claimed) continue;
    try {
      const result = await send(normalizeWhatsAppRecipient(claimed.phone), claimed.body, claimed.channelId);
      const externalId = getMetaMessageId(result);
      if (!externalId) throw new Error("missing_message_id");
      await prisma.message.update({
        where: { id: claimed.id },
        data: { externalId, status: "SENT", sentAt: new Date(), rawPayload: { source: SOURCE, dispatch: "accepted" } },
      });
      // Deliberately does not set firstResponseAt: that measures the first HUMAN response.
    } catch {
      await prisma.$transaction(async tx => {
        await lockAdeOrganization(tx, claimed.organizationId);
        await tx.message.updateMany({
          where: { id: claimed.id, status: "QUEUED" },
          data: { status: "FAILED", rawPayload: { source: SOURCE, dispatch: "failed_or_unknown" } },
        });
        await releaseToHuman(tx, claimed.conversationId, claimed.organizationId, "delivery_failed_or_unknown");
      });
    }
    publishRealtimeEvent({ organizationSlug: claimed.slug, type: "inbox.changed" });
  }
}

// Recovery for process crashes, expired pending questions, inactivity and delivery failures.
export async function recoverAdeWelcome() {
  const rejected = await prisma.message.findMany({
    where: { status: "FAILED", rawPayload: { path: ["dispatch"], equals: "accepted" }, clientRequestId: { startsWith: "ade:" }, conversation: { welcomeStage: { in: ["NAME", "REASON"] } } },
    take: 50, select: { conversationId: true, conversation: { select: { organizationId: true } } },
  });
  for (const item of rejected) {
    await prisma.$transaction(async tx => {
      await lockAdeOrganization(tx, item.conversation.organizationId);
      const current = await tx.conversation.findUniqueOrThrow({ where: { id: item.conversationId }, select: { welcomeStage: true } });
      if (isAdeActive(current.welcomeStage)) await releaseToHuman(tx, item.conversationId, item.conversation.organizationId, "delivery_rejected");
    });
  }
  const stale = await prisma.conversation.findMany({
    where: { welcomeStage: { in: ["NAME", "REASON"] }, welcomeUpdatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    take: 50, select: { id: true, organizationId: true },
  });
  for (const conversation of stale) {
    await prisma.$transaction(async tx => {
      await lockAdeOrganization(tx, conversation.organizationId);
      const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversation.id }, select: { welcomeStage: true, welcomeUpdatedAt: true } });
      if (isAdeActive(current.welcomeStage) && current.welcomeUpdatedAt && current.welcomeUpdatedAt.getTime() < Date.now() - 10 * 60_000) {
        await releaseToHuman(tx, conversation.id, conversation.organizationId, "inactivity");
      }
    });
  }
  const uncertain = await prisma.message.findMany({
    where: { status: "QUEUED", clientRequestId: { startsWith: "ade:" }, rawPayload: { path: ["dispatch"], equals: "attempted" }, createdAt: { lt: new Date(Date.now() - 2 * 60_000) } },
    take: 50, select: { id: true, conversationId: true, conversation: { select: { organizationId: true } } },
  });
  for (const message of uncertain) {
    await prisma.$transaction(async tx => {
      await lockAdeOrganization(tx, message.conversation.organizationId);
      const current = await tx.message.findUniqueOrThrow({ where: { id: message.id }, select: { status: true, rawPayload: true } });
      const meta = payload(current.rawPayload);
      if (current.status !== "QUEUED" || meta.dispatch !== "attempted" || typeof meta.attemptedAt !== "string" || Date.parse(meta.attemptedAt) > Date.now() - 2 * 60_000) return;
      await tx.message.updateMany({ where: { id: message.id, status: "QUEUED" }, data: { status: "FAILED", rawPayload: { source: SOURCE, dispatch: "unknown_after_restart" } } });
      await releaseToHuman(tx, message.conversationId, message.conversation.organizationId, "delivery_unknown_after_restart");
    });
  }
}
