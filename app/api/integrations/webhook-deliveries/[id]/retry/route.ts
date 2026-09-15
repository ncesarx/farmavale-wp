import { after, NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { deliverWebhook } from "@/lib/outbound-webhooks";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await context.params;
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id, endpoint: { organizationId: user.organizationId, isActive: true } },
    select: { id: true, endpointId: true },
  });
  if (!delivery) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.webhookDelivery.update({
    where: { id },
    data: { status: "PENDING", responseCode: null, lastError: null, nextAttemptAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      action: "WEBHOOK_DELIVERY_RETRIED",
      entityType: "WebhookDelivery",
      entityId: id,
      metadata: { endpointId: delivery.endpointId },
    },
  });
  after(async () => { await deliverWebhook(id); });
  return NextResponse.json({ queued: true });
}
