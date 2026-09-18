import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import { normalizeShortcut } from "@/lib/quick-reply";

const schema = z.object({ title: z.string().trim().min(2).max(80).optional(), shortcut: z.string().trim().min(1).max(40).optional(), body: z.string().trim().min(1).max(4096).optional(), category: z.string().trim().max(80).nullable().optional(), isActive: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);

async function authorize() {
  const user = await getCurrentUser();
  return user && ["OWNER", "ADMIN", "SUPERVISOR"].includes(user.role) ? user : null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await authorize();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_reply" }, { status: 400 });
  const { id } = await context.params;
  const current = await prisma.quickReply.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const shortcut = parsed.data.shortcut === undefined ? undefined : normalizeShortcut(parsed.data.shortcut);
  const reply = await prisma.quickReply.update({ where: { id }, data: { ...parsed.data, shortcut, category: parsed.data.category || null } });
  await prisma.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: "QUICK_REPLY_UPDATED", entityType: "QuickReply", entityId: id } });
  return NextResponse.json({ reply });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await authorize();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await context.params;
  const updated = await prisma.quickReply.updateMany({ where: { id, organizationId: user.organizationId }, data: { isActive: false } });
  if (!updated.count) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: "QUICK_REPLY_DISABLED", entityType: "QuickReply", entityId: id } });
  return NextResponse.json({ disabled: true });
}
