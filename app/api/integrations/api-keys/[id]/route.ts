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
  const credential = await prisma.apiCredential.findFirst({
    where: { id, organizationId: user.organizationId, revokedAt: null },
    select: { id: true, name: true, prefix: true },
  });
  if (!credential) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.$transaction([
    prisma.apiCredential.update({ where: { id }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "API_CREDENTIAL_REVOKED",
        entityType: "ApiCredential",
        entityId: id,
        metadata: { name: credential.name, prefix: credential.prefix },
      },
    }),
  ]);
  return NextResponse.json({ revoked: true });
}
