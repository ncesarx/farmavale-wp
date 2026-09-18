import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";

const policySchema = z.object({
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  responseMinutes: z.number().int().min(1).max(10080),
  warningMinutes: z.number().int().min(1).max(1440),
  escalateAfterMinutes: z.number().int().min(0).max(10080),
  notifySupervisors: z.boolean(),
  isActive: z.boolean(),
}).refine((value) => value.warningMinutes <= value.responseMinutes, {
  message: "warning_must_be_before_deadline",
});

export async function PUT(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["OWNER", "ADMIN", "SUPERVISOR"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = policySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_policy" }, { status: 400 });

  const policy = await prisma.$transaction(async (tx) => {
    const saved = await tx.slaPolicy.upsert({
      where: { organizationId_priority: { organizationId: user.organizationId, priority: parsed.data.priority } },
      update: parsed.data,
      create: { organizationId: user.organizationId, ...parsed.data },
    });
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId, actorId: user.id,
        action: "SLA_POLICY_UPDATED", entityType: "SlaPolicy", entityId: saved.id,
        metadata: parsed.data,
      },
    });
    return saved;
  });
  return NextResponse.json({ policy });
}
