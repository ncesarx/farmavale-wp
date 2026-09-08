import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
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
      if (existing) return "duplicate" as const;

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

      return "created" as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate" as const;
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
  };

  for (const message of events.messages) {
    const outcome = await persistInbound(message);
    result[outcome === "created" ? "created" : "duplicates"] += 1;
  }

  for (const status of events.statuses) {
    result.statusUpdates += await persistStatus(status);
  }

  return result;
}
