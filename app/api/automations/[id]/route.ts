import { NextRequest, NextResponse } from "next/server";
import { canManageAutomations } from "@/lib/automation-rules";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManageAutomations(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const result = await prisma.$transaction(async (tx) => {
    const disabled = await tx.automationRule.updateMany({ where: { id, organizationId: user.organizationId }, data: { isActive: false } });
    if (disabled.count) await tx.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: "AUTOMATION_RULE_DISABLED", entityType: "AutomationRule", entityId: id } });
    return disabled.count;
  });
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ disabled: true });
}
