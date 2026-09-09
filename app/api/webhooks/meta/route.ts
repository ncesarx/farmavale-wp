import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { processMetaWebhook } from "@/lib/meta-webhook-handler";
import { publishRealtimeEvent } from "@/lib/realtime";
import { verifyMetaSignature } from "@/lib/whatsapp";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === getEnv().META_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "verification_failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature)) {
    console.warn("meta_webhook_rejected", { reason: "invalid_signature" });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("meta_webhook_rejected", { reason: "invalid_json" });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await processMetaWebhook(payload);
    console.info("meta_webhook_processed", {
      ...result,
      durationMs: Date.now() - startedAt,
    });

    if (result.created > 0) {
      publishRealtimeEvent({
        organizationSlug: "farmavale",
        type: "message.received",
      });
    } else if (result.statusUpdates > 0) {
      publishRealtimeEvent({
        organizationSlug: "farmavale",
        type: "inbox.changed",
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("meta_webhook_processing_failed", {
      error: error instanceof Error ? error.name : "UnknownError",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
