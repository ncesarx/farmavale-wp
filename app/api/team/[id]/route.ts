import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { drainQueuedConversations } from "@/lib/conversation-assignment";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime";
import {
  canAssignRole,
  canManageTarget,
  canManageTeam,
} from "@/lib/team-policy";

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    role: z
      .enum(["OWNER", "ADMIN", "SUPERVISOR", "AGENT", "ANALYST"])
      .optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    maxOpenConversations: z.number().int().min(0).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canManageTeam(actor.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_update" }, { status: 400 });
  }

  const { id } = await context.params;
  const target = await prisma.user.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: { id: true, name: true, role: true, status: true },
  });
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!canManageTarget(actor.role, actor.id, target)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (parsed.data.role && !canAssignRole(actor.role, parsed.data.role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 403 });
  }
  if (
    target.id === actor.id &&
    ((parsed.data.status && parsed.data.status !== target.status) ||
      (parsed.data.role && parsed.data.role !== target.role))
  ) {
    return NextResponse.json({ error: "cannot_change_self_access" }, { status: 409 });
  }

  const removesOwner =
    target.role === "OWNER" &&
    (parsed.data.status === "SUSPENDED" ||
      (parsed.data.role && parsed.data.role !== "OWNER"));
  if (removesOwner) {
    const activeOwners = await prisma.user.count({
      where: {
        organizationId: actor.organizationId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    if (activeOwners <= 1) {
      return NextResponse.json({ error: "last_owner" }, { status: 409 });
    }
  }

  const suspending =
    target.status !== "SUSPENDED" && parsed.data.status === "SUSPENDED";

  const updated = await prisma.$transaction(async (tx) => {
    if (suspending) {
      await tx.conversationAssignment.updateMany({
        where: { agentId: target.id, endedAt: null },
        data: { endedAt: new Date() },
      });
      await tx.conversation.updateMany({
        where: {
          organizationId: actor.organizationId,
          assignedAgentId: target.id,
          status: { in: ["OPEN", "PENDING"] },
        },
        data: { assignedAgentId: null, status: "QUEUED" },
      });
      await tx.session.deleteMany({ where: { userId: target.id } });
    }

    const user = await tx.user.update({
      where: { id: target.id },
      data: {
        name: parsed.data.name,
        role: parsed.data.role,
        status: parsed.data.status,
        maxOpenConversations: parsed.data.maxOpenConversations,
        agentStatus: suspending ? "OFFLINE" : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        agentStatus: true,
        maxOpenConversations: true,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "USER_UPDATED",
        entityType: "User",
        entityId: target.id,
        metadata: {
          from: { role: target.role, status: target.status },
          to: { role: user.role, status: user.status },
          capacity: user.maxOpenConversations,
          sessionsRevoked: suspending,
        },
      },
    });
    return user;
  });

  if (suspending) {
    await drainQueuedConversations(actor.organizationId);
  }
  publishRealtimeEvent({
    organizationSlug: actor.organization.slug,
    type: "inbox.changed",
  });

  return NextResponse.json({ user: updated });
}
