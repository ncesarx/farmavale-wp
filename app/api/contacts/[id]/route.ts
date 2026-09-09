import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { canEditCustomers } from "@/lib/customer-policy";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime";

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.union([z.string().trim().email().max(180), z.literal("")]).optional(),
    externalCrmId: z.union([z.string().trim().max(120), z.literal("")]).optional(),
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
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditCustomers(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_customer" }, { status: 400 });
  }

  const { id } = await context.params;
  const current = await prisma.contact.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, name: true, email: true, externalCrmId: true },
  });
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const requestedTagIds = [...new Set(parsed.data.tagIds ?? [])];
  if (parsed.data.tagIds) {
    const validTags = await prisma.tag.count({
      where: { organizationId: user.organizationId, id: { in: requestedTagIds } },
    });
    if (validTags !== requestedTagIds.length) {
      return NextResponse.json({ error: "invalid_tags" }, { status: 400 });
    }
  }

  const contact = await prisma.$transaction(async (tx) => {
    if (parsed.data.tagIds) {
      await tx.contactTag.deleteMany({ where: { contactId: id } });
      if (requestedTagIds.length) {
        await tx.contactTag.createMany({
          data: requestedTagIds.map((tagId) => ({ contactId: id, tagId })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await tx.contact.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email === undefined ? undefined : parsed.data.email || null,
        externalCrmId:
          parsed.data.externalCrmId === undefined
            ? undefined
            : parsed.data.externalCrmId || null,
      },
      select: { id: true, name: true, email: true, externalCrmId: true },
    });

    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "CONTACT_UPDATED",
        entityType: "Contact",
        entityId: id,
        metadata: {
          changedFields: Object.keys(parsed.data),
          tagsUpdated: parsed.data.tagIds !== undefined,
        },
      },
    });
    return updated;
  });

  publishRealtimeEvent({
    organizationSlug: user.organization.slug,
    type: "contact.updated",
  });

  return NextResponse.json({ contact });
}
