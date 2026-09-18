import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTOMATION_PRIORITIES, canManageAutomations, normalizeKeyword } from "@/lib/automation-rules";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(3).max(80),
  keyword: z.string().trim().min(2).max(100),
  priority: z.enum(AUTOMATION_PRIORITIES).nullable().optional(),
  tagId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
}).refine((value) => value.priority || value.tagId || value.assigneeId, { message: "action_required" });

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManageAutomations(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_rule" }, { status: 400 });

  const [tag, assignee] = await Promise.all([
    parsed.data.tagId ? prisma.tag.findFirst({ where: { id: parsed.data.tagId, organizationId: user.organizationId }, select: { id: true } }) : null,
    parsed.data.assigneeId ? prisma.user.findFirst({ where: { id: parsed.data.assigneeId, organizationId: user.organizationId, status: "ACTIVE" }, select: { id: true } }) : null,
  ]);
  if (parsed.data.tagId && !tag) return NextResponse.json({ error: "invalid_tag" }, { status: 400 });
  if (parsed.data.assigneeId && !assignee) return NextResponse.json({ error: "invalid_assignee" }, { status: 400 });

  const rule = await prisma.$transaction(async (tx) => {
    const created = await tx.automationRule.create({ data: { organizationId: user.organizationId, name: parsed.data.name, keyword: normalizeKeyword(parsed.data.keyword), priority: parsed.data.priority || null, tagId: tag?.id, assigneeId: assignee?.id }, include: { tag: true, assignee: { select: { name: true } } } });
    await tx.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: "AUTOMATION_RULE_CREATED", entityType: "AutomationRule", entityId: created.id, metadata: { name: created.name, keyword: created.keyword } } });
    return created;
  });
  return NextResponse.json({ rule }, { status: 201 });
}
