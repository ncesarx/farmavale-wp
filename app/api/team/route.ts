import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import { canAssignRole, canManageTeam } from "@/lib/team-policy";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(12).max(200),
  role: z.enum(["OWNER", "ADMIN", "SUPERVISOR", "AGENT", "ANALYST"]),
  maxOpenConversations: z.number().int().min(0).max(100),
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

  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canManageTeam(actor.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_user" }, { status: 400 });
  }
  if (!canAssignRole(actor.role, parsed.data.role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 403 });
  }

  try {
    const passwordHash = await hash(parsed.data.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          name: parsed.data.name,
          email: parsed.data.email,
          passwordHash,
          role: parsed.data.role,
          status: "ACTIVE",
          agentStatus: "OFFLINE",
          maxOpenConversations: parsed.data.maxOpenConversations,
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
          action: "USER_CREATED",
          entityType: "User",
          entityId: created.id,
          metadata: {
            role: created.role,
            maxOpenConversations: created.maxOpenConversations,
          },
        },
      });
      return created;
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "email_exists" }, { status: 409 });
    }
    console.error("team_user_creation_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "creation_failed" }, { status: 500 });
  }
}
