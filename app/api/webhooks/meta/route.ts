import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
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
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const payload: unknown = JSON.parse(rawBody);
  // Sprint 2: persist inbound messages idempotently and enqueue distribution.
  console.info("meta_webhook_received", { receivedAt: new Date().toISOString(), payload });
  return NextResponse.json({ received: true });
}
