import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await context.params;
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id, organizationId: user.organizationId, isActive: true },
    select: { id: true, name: true, url: true },
  });
  if (!endpoint) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.$transaction([
    prisma.webhookEndpoint.update({ where: { id }, data: { isActive: false } }),
    prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "WEBHOOK_ENDPOINT_DISABLED",
        entityType: "WebhookEndpoint",
        entityId: id,
        metadata: { name: endpoint.name, url: endpoint.url },
      },
    }),
  ]);
  return NextResponse.json({ disabled: true });
}
