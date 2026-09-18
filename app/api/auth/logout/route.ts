import { NextResponse } from "next/server";
import { destroyCurrentSession, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await getCurrentUser();
  await destroyCurrentSession();
  if (user) await prisma.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: "USER_LOGOUT", entityType: "Session" } });
  return NextResponse.json({ authenticated: false });
}
