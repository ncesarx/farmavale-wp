import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

export function verifyMetaSignature(rawBody: string, signature: string | null) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", getEnv().META_APP_SECRET)
    .update(rawBody)
    .digest("hex");
  const received = signature.slice(7);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export async function sendWhatsAppText(to: string, body: string) {
  const env = getEnv();
  if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID) {
    throw new Error("WhatsApp test credentials are not configured");
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${env.META_PHONE_NUMBER_ID}/messages`,
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
    },
  );

  if (!response.ok) throw new Error(`Meta API error: ${response.status}`);
  return response.json();
}
