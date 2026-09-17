import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048), expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(20).max(256), auth: z.string().min(8).max(128) }),
});
const deleteSchema = z.object({ endpoint: z.string().url().max(2048) });

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  const data = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint: data.endpoint },
    update: { userId: user.id, p256dh: data.keys.p256dh, auth: data.keys.auth, userAgent: request.headers.get("user-agent"), expiresAt: data.expirationTime ? new Date(data.expirationTime) : null },
    create: { userId: user.id, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth, userAgent: request.headers.get("user-agent"), expiresAt: data.expirationTime ? new Date(data.expirationTime) : null },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: user.id } });
  return NextResponse.json({ ok: true });
}
