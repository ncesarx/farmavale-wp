import { createHash } from "node:crypto";
import { autoAssignConversation } from "@/lib/conversation-assignment";
import { applyInboundAutomationRules } from "@/lib/automation-rules";
import { prisma } from "@/lib/prisma";
import { createUserNotification } from "@/lib/notifications";
import { calculateSlaDueAt, DEFAULT_SLA_POLICIES } from "@/lib/sla-policy";
import {
  MetaInboundMessage,
  MetaMessageStatus,
  parseMetaWebhook,
} from "@/lib/meta-webhook";

const ORGANIZATION_SLUG = "farmavale";
const ACTIVE_STATUSES = ["QUEUED", "OPEN", "PENDING"] as const;

export type MetaProcessingResult = {
  received: number;
  created: number;
  duplicates: number;
  statusUpdates: number;
  autoAssigned: number;
  leftQueued: number;
};

function phoneE164(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) throw new Error("Meta webhook contains an invalid sender phone");
  return `+${digits}`;
}

function protocolFor(message: MetaInboundMessage) {
  const day = message.timestamp.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = createHash("sha256").update(message.id).digest("hex").slice(0, 12).toUpperCase();
  return `FV-${day}-${suffix}`;
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function persistInbound(message: MetaInboundMessage) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.message.findUnique({
        where: { externalId: message.id },
        select: { id: true },
      });
      if (existing) {
        return { outcome: "duplicate", assignment: null, notification: null } as const;
      }

      const organization = await tx.organization.findUnique({
        where: { slug: ORGANIZATION_SLUG },
        select: { id: true },
      });
      if (!organization) throw new Error("Farmavale organization is not configured");

      const channel = await tx.channel.upsert({
        where: {
          organizationId_type_externalId: {
            organizationId: organization.id,
            type: "WHATSAPP",
            externalId: message.phoneNumberId,
          },
        },
        update: {
          isActive: true,
          name: message.displayPhoneNumber
            ? `WhatsApp ${message.displayPhoneNumber}`
            : "WhatsApp Farmavale",
        },
        create: {
          organizationId: organization.id,
          type: "WHATSAPP",
          externalId: message.phoneNumberId,
          name: message.displayPhoneNumber
            ? `WhatsApp ${message.displayPhoneNumber}`
            : "WhatsApp Farmavale",
        },
      });

      const phone = phoneE164(message.from);
      const contact = await tx.contact.upsert({
        where: {
          organizationId_phoneE164: {
            organizationId: organization.id,
            phoneE164: phone,
          },
        },
        update: message.contactName ? { name: message.contactName } : {},
        create: {
          organizationId: organization.id,
          phoneE164: phone,
          name: message.contactName ?? `WhatsApp ${phone.slice(-4)}`,
          metadata: { source: "whatsapp_cloud_api" },
        },
      });

      const normalPolicy = await tx.slaPolicy.findUnique({
        where: { organizationId_priority: { organizationId: organization.id, priority: "NORMAL" } },
        select: { responseMinutes: true, isActive: true },
      });
      const responseMinutes = normalPolicy?.isActive === false
        ? null
        : normalPolicy?.responseMinutes ?? DEFAULT_SLA_POLICIES.NORMAL.responseMinutes;

      let conversation = await tx.conversation.findFirst({
        where: {
          organizationId: organization.id,
          contactId: contact.id,
          channelId: channel.id,
          status: { in: [...ACTIVE_STATUSES] },
        },
        orderBy: { lastMessageAt: "desc" },
        select: { id: true, status: true, assignedAgentId: true },
      });

      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            organizationId: organization.id,
            contactId: contact.id,
            channelId: channel.id,
            protocol: protocolFor(message),
            status: "QUEUED",
            lastMessageAt: message.timestamp,
            slaDueAt: responseMinutes ? calculateSlaDueAt(message.timestamp, responseMinutes) : null,
          },
          select: { id: true, status: true, assignedAgentId: true },
        });
      }

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          externalId: message.id,
          direction: "INBOUND",
          status: "RECEIVED",
          body: message.body,
          mediaType: message.type === "text" ? null : message.type,
          rawPayload: jsonValue({
            id: message.id,
            timestamp: message.timestamp.toISOString(),
            type: message.type,
            mediaId: message.mediaId,
            mediaMimeType: message.mediaMimeType,
          }),
          sentAt: message.timestamp,
        },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: message.timestamp,
          status:
            conversation.status === "PENDING"
              ? conversation.assignedAgentId
                ? "OPEN"
                : "QUEUED"
              : conversation.status,
          slaDueAt:
            conversation.status === "PENDING" && responseMinutes
              ? calculateSlaDueAt(message.timestamp, responseMinutes)
              : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          action: "WHATSAPP_MESSAGE_RECEIVED",
          entityType: "Conversation",
          entityId: conversation.id,
          metadata: {
            messageExternalId: message.id,
            messageType: message.type,
            channelId: channel.id,
          },
        },
      });

      const automated = await applyInboundAutomationRules(tx, organization.id, conversation.id, message.body);
      const assignment = automated.assigned
        ? "assigned" as const
        : await autoAssignConversation(tx, organization.id, conversation.id);
      const updated = await tx.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        select: { id: true, protocol: true, assignedAgentId: true },
      });
      return {
        outcome: "created", assignment,
        notification: updated.assignedAgentId ? {
          organizationId: organization.id,
          userId: updated.assignedAgentId,
          conversationId: updated.id,
          protocol: updated.protocol,
          contactName: contact.name,
        } : null,
      } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { outcome: "duplicate", assignment: null, notification: null } as const;
    }
    throw error;
  }
}

const STATUS_MAP = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
} as const;

async function persistStatus(event: MetaMessageStatus) {
  const timestamps =
    event.status === "sent"
      ? { sentAt: event.timestamp }
      : event.status === "delivered"
        ? { deliveredAt: event.timestamp }
        : event.status === "read"
          ? { readAt: event.timestamp }
          : {};

  const result = await prisma.message.updateMany({
    where: { externalId: event.id },
    data: {
      status: STATUS_MAP[event.status],
      ...timestamps,
    },
  });

  return result.count;
}

export async function processMetaWebhook(payload: unknown): Promise<MetaProcessingResult> {
  const events = parseMetaWebhook(payload);
  const result: MetaProcessingResult = {
    received: events.messages.length,
    created: 0,
    duplicates: 0,
    statusUpdates: 0,
    autoAssigned: 0,
    leftQueued: 0,
  };

  for (const message of events.messages) {
    const persisted = await persistInbound(message);
    result[persisted.outcome === "created" ? "created" : "duplicates"] += 1;
    if (persisted.assignment === "assigned") result.autoAssigned += 1;
    if (persisted.assignment === "queued") result.leftQueued += 1;
    if (persisted.outcome === "created" && persisted.notification) {
      const target = persisted.notification;
      try {
        await createUserNotification({
          organizationId: target.organizationId,
          userId: target.userId,
          type: persisted.assignment === "assigned" ? "ASSIGNMENT" : "NEW_MESSAGE",
          title: persisted.assignment === "assigned" ? "Novo atendimento atribuído" : "Nova mensagem recebida",
          body: `${target.contactName} · ${target.protocol}`,
          href: `/?conversation=${target.conversationId}`,
          metadata: { conversationId: target.conversationId, messageExternalId: message.id },
          dedupKey: `message:${message.id}:${target.userId}`,
        });
      } catch (error) {
        console.error("notification_creation_failed", {
          error: error instanceof Error ? error.name : "UnknownError",
          conversationId: target.conversationId,
        });
      }
    }
  }

  for (const status of events.statuses) {
    result.statusUpdates += await persistStatus(status);
  }

  return result;
}
