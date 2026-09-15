import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import { WEBHOOK_EVENTS } from "@/lib/outbound-webhooks";
import { encryptWebhookSecret, parseSafeWebhookUrl } from "@/lib/webhook-security";

const schema = z.object({
  name: z.string().trim().min(3).max(80),
  url: z.string().trim().url().max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
});

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parseSafeWebhookUrl(parsed.data.url)) {
    return NextResponse.json({ error: "invalid_webhook" }, { status: 400 });
  }

  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const endpoint = await prisma.$transaction(async (tx) => {
    const created = await tx.webhookEndpoint.create({
      data: {
        organizationId: user.organizationId,
        name: parsed.data.name,
        url: parsed.data.url,
        events: [...new Set(parsed.data.events)],
        secretEncrypted: encryptWebhookSecret(secret, getEnv().AUTH_SECRET),
      },
      select: { id: true, name: true, url: true, events: true, isActive: true, createdAt: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "WEBHOOK_ENDPOINT_CREATED",
        entityType: "WebhookEndpoint",
        entityId: created.id,
        metadata: { name: created.name, url: created.url, events: created.events },
      },
    });
    return created;
  });

  return NextResponse.json({ endpoint, secret }, { status: 201 });
}
