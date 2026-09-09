import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { drainQueuedConversations } from "@/lib/conversation-assignment";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  status: z.enum(["AVAILABLE", "BUSY", "AWAY", "OFFLINE"]),
});

function hasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin === new URL(getEnv().APP_BASE_URL).origin;
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const previousStatus = user.agentStatus;
  const updated = await prisma.$transaction(async (tx) => {
    const agent = await tx.user.update({
      where: { id: user.id },
      data: {
        agentStatus: parsed.data.status,
        lastSeenAt: new Date(),
      },
      select: { agentStatus: true },
    });

    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "AGENT_STATUS_CHANGED",
        entityType: "User",
        entityId: user.id,
        metadata: {
          from: previousStatus,
          to: parsed.data.status,
        },
      },
    });

    return agent;
  });

  const assignedFromQueue =
    updated.agentStatus === "AVAILABLE"
      ? await drainQueuedConversations(user.organizationId)
      : 0;

  return NextResponse.json({
    status: updated.agentStatus,
    assignedFromQueue,
  });
}
