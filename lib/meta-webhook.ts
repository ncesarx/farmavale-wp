export type MetaInboundMessage = {
  id: string;
  from: string;
  timestamp: Date;
  type: string;
  body: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  raw: Record<string, unknown>;
  contactName: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
};

export type MetaMessageStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  raw: Record<string, unknown>;
};

export type MetaWebhookEvents = {
  messages: MetaInboundMessage[];
  statuses: MetaMessageStatus[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function eventDate(value: unknown): Date {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
}

function messageBody(message: UnknownRecord, type: string): string | null {
  const nestedText = (field: string, key: string) => {
    const value = message[field];
    return isRecord(value) ? asString(value[key]) : null;
  };

  if (type === "text") return nestedText("text", "body");
  if (type === "button") return nestedText("button", "text");

  if (type === "interactive" && isRecord(message.interactive)) {
    const interactive = message.interactive;
    if (isRecord(interactive.button_reply)) return asString(interactive.button_reply.title);
    if (isRecord(interactive.list_reply)) return asString(interactive.list_reply.title);
  }

  for (const field of ["image", "video", "document"]) {
    const caption = nestedText(field, "caption");
    if (caption) return caption;
  }

  if (type === "location" && isRecord(message.location)) {
    return asString(message.location.name) ?? asString(message.location.address);
  }

  return null;
}

function mediaDetails(message: UnknownRecord, type: string) {
  if (!["audio", "document", "image", "sticker", "video"].includes(type)) {
    return { mediaId: null, mediaMimeType: null };
  }

  const media = message[type];
  if (!isRecord(media)) return { mediaId: null, mediaMimeType: null };

  return {
    mediaId: asString(media.id),
    mediaMimeType: asString(media.mime_type),
  };
}

export function parseMetaWebhook(payload: unknown): MetaWebhookEvents {
  const events: MetaWebhookEvents = { messages: [], statuses: [] };
  if (!isRecord(payload)) return events;

  for (const entry of asRecords(payload.entry)) {
    for (const change of asRecords(entry.changes)) {
      if (change.field !== "messages" || !isRecord(change.value)) continue;

      const value = change.value;
      const metadata = isRecord(value.metadata) ? value.metadata : {};
      const phoneNumberId = asString(metadata.phone_number_id);
      const displayPhoneNumber = asString(metadata.display_phone_number);
      const contacts = new Map<string, string>();

      for (const contact of asRecords(value.contacts)) {
        const waId = asString(contact.wa_id);
        const profile = isRecord(contact.profile) ? contact.profile : {};
        const name = asString(profile.name);
        if (waId && name) contacts.set(waId, name);
      }

      if (phoneNumberId) {
        for (const message of asRecords(value.messages)) {
          const id = asString(message.id);
          const from = asString(message.from);
          const type = asString(message.type) ?? "unknown";
          if (!id || !from) continue;

          const media = mediaDetails(message, type);
          events.messages.push({
            id,
            from,
            timestamp: eventDate(message.timestamp),
            type,
            body: messageBody(message, type),
            mediaId: media.mediaId,
            mediaMimeType: media.mediaMimeType,
            raw: message,
            contactName: contacts.get(from) ?? null,
            phoneNumberId,
            displayPhoneNumber,
          });
        }
      }

      for (const status of asRecords(value.statuses)) {
        const id = asString(status.id);
        const state = asString(status.status);
        if (!id || !["sent", "delivered", "read", "failed"].includes(state ?? "")) continue;
        events.statuses.push({
          id,
          status: state as MetaMessageStatus["status"],
          timestamp: eventDate(status.timestamp),
          raw: status,
        });
      }
    }
  }

  return events;
}
