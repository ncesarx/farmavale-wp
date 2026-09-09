import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { drainQueuedConversations } from "@/lib/conversation-assignment";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";

const updateSchema = z
  .object({
    status: z.enum(["QUEUED", "OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
    category: z.string().trim().max(80).optional(),
    tagIds: z.array(z.string().min(1)).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_update" }, { status: 400 });
  }

  const { id } = await context.params;
  const current = await prisma.conversation.findFirst({
    where: { id, organizationId: user.organizationId },
    select: {
      id: true,
      status: true,
      priority: true,
      category: true,
      assignedAgentId: true,
    },
  });
  if (!current) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const requestedTagIds = [...new Set(parsed.data.tagIds ?? [])];
  if (parsed.data.tagIds) {
    const validTags = await prisma.tag.count({
      where: {
        organizationIÓNId: user.organizationId,
        id: { in: requestedTagIds },
      },
    });
    if (validTags !== requestedTagIds.length) {
      return NextResponse.json({ error: "invalid_tags" }, { status: 400 });
    }
  }

  let nextStatus = parsed.data.status ?? current.status;
  let nextAssignedAgentId = current.assignedAgentId;
  let shouldEndAssignment = false;
  let resolvedAt: Date | null | undefined;

  if (["RESOLVED", "CLOSED", "QUEUED"].includes(nextStatus)) {
    nextAssignedAgentId = null;
    shouldEndAssignment = Boolean(current.assignedAgentId);
  }

  if (["RESOLVED", "CLOSED"].includes(nextStatus)) {
    resolvedAt = new Date();
  } else if (nextStatus === "OPEN" && !current.assignedAgentId) {
    nextStatus = "QUEUED";
    resolvedAt = null;
  } else if (nextStatus === "PENDING" && !current.assignedAgentId) {
    nextStatus = "QUEUED";
  } else if (current.status === "RESOLVED" || current.status === "CLOSED") {
    resolvedAt = null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (shouldEndAssignment) {
      await tx.conversationAssignment.updateMany({
        where: { conversationId: id, endedAt: null },
        data: { endedAt: new Date() },
      });
    }

    if (parsed.data.tagIds) {
      await tx.conversationTag.deleteMany({ where: { conversationId: id } });
      if (requestedTagIds.length) {
        await tx.conversationTag.createMany({
          data: requestedTagIds.map((tagId) => ({ conversationId: id, tagId })),
          skipDuplicates: true,
        });
      }
    }

    const conversation = await tx.conversation.update({
      where: { id },
      data: {
        status: nextStatus,
        assignedAgentId: nextAssignedAgentId,
        priority: parsed.data.priority,
        category:
          parsed.data.category === undefined
            ? undefined
            : parsed.data.category || null,
        resolvedAt,
      },
      select: {
        id: true,
        status: true,
        priority: true,
        category: true,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "CONVERSATION_UPDATED",
        entityType: "Conversation",
        entityId: id,
        metadata: {
          from: {
            status: current.status,
            priority: current.priority,
            category: current.category,
          },
          to: {
            status: conversation.status,
            priority: conversation.priority,
            category: conversation.category,
          },
          tagsUpdated: parsed.data.tagIds !== undefined,
        },
      },
    });

    return conversation;
  });

  const assignedFromQueue =
    updated.status === "QUEUED"
      ? await drainQueuedConversations(user.organizationId)
      : 0;

  return NextResponse.json({ conversation: updated, assignedFromQueue });
}
