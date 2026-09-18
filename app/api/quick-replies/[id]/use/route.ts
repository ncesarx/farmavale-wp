import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const updated = await prisma.quickReply.updateMany({ where: { id, organizationId: user.organizationId, isActive: true }, data: { usageCount: { increment: 1 } } });
  if (!updated.count) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ used: true });
}
