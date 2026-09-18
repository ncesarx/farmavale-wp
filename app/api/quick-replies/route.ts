import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import { normalizeShortcut } from "@/lib/quick-reply";

const schema = z.object({ title: z.string().trim().min(2).max(80), shortcut: z.string().trim().min(1).max(40), body: z.string().trim().min(1).max(4096), category: z.string().trim().max(80).optional() });

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["OWNER", "ADMIN", "SUPERVISOR"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const shortcut = parsed.success ? normalizeShortcut(parsed.data.shortcut) : "";
  if (!parsed.success || !shortcut) return NextResponse.json({ error: "invalid_reply" }, { status: 400 });
  try {
    const reply = await prisma.$transaction(async (tx) => {
      const created = await tx.quickReply.create({ data: { organizationId: user.organizationId, ...parsed.data, shortcut, category: parsed.data.category || null } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: "QUICK_REPLY_CREATED", entityType: "QuickReply", entityId: created.id, metadata: { title: created.title, shortcut } } });
      return created;
    });
    return NextResponse.json({ reply }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return NextResponse.json({ error: "shortcut_in_use" }, { status: 409 });
    throw error;
  }
}
