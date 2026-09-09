import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(2).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!["OWNER", "ADMIN", "SUPERVISOR"].includes(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_tag" }, { status: 400 });
  }

  try {
    const tag = await prisma.$transaction(async (tx) => {
      const created = await tx.tag.create({
        data: {
          organizationId: user.organizationId,
          name: parsed.data.name,
          color: parsed.data.color.toUpperCase(),
        },
        select: { id: true, name: true, color: true },
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "TAG_CREATED",
          entityType: "Tag",
          entityId: created.id,
          metadata: { name: created.name, color: created.color },
        },
      });

      return created;
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "tag_already_exists" }, { status: 409 });
    }
    throw error;
  }
}
