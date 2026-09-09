import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

type MetaSendResponse = {
  messages?: Array<{ id?: string }>;
  error?: { code?: number; message?: string };
};

export class MetaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number | null,
  ) {
    super("Meta rejected the WhatsApp message");
    this.name = "MetaApiError";
  }
}

export function normalizeWhatsAppRecipient(value: string) {
  return value.replace(/\D/g, "");
}

export function getMetaMessageId(response: unknown) {
  if (!response || typeof response !== "object") return null;
  const messages = (response as MetaSendResponse).messages;
  const id = messages?.[0]?.id;
  return typeof id === "string" && id ? id : null;
}

export function verifyMetaSignature(rawBody: string, signature: string | null) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", getEnv().META_APP_SECRET)
    .update(rawBody)
    .digest("hex");
  const received = signature.slice(7);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export async function sendWhatsAppText(
  to: string,
  body: string,
  phoneNumberId?: string,
) {
  const env = getEnv();
  const senderId = phoneNumberId || env.META_PHONE_NUMBER_ID;
  if (!env.META_ACCESS_TOKEN || !senderId) {
    throw new Error("WhatsApp credentials are not configured");
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${senderId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  const payload = (await response.json().catch(() => ({}))) as MetaSendResponse;
  if (!response.ok) {
    throw new MetaApiError(
      response.status,
      typeof payload.error?.code === "number" ? payload.error.code : null,
    );
  }
  return payload;
}
