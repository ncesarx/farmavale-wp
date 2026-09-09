import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateApiToken } from "@/lib/api-credentials";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(3).max(80),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_credential" }, { status: 400 });

  const generated = generateApiToken();
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
    : null;

  const credential = await prisma.$transaction(async (tx) => {
    const created = await tx.apiCredential.create({
      data: {
        organizationId: user.organizationId,
        name: parsed.data.name,
        prefix: generated.prefix,
        tokenHash: generated.tokenHash,
        scopes: ["contacts:write"],
        expiresAt,
      },
      select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true, createdAt: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "API_CREDENTIAL_CREATED",
        entityType: "ApiCredential",
        entityId: created.id,
        metadata: { name: created.name, prefix: created.prefix, expiresAt },
      },
    });
    return created;
  });

  return NextResponse.json({ credential, token: generated.token }, { status: 201 });
}
