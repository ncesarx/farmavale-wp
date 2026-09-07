import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createUserSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const inputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Credenciais inválidas." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email, status: "ACTIVE" },
  });

  const fallbackHash = user?.passwordHash ?? await hash("invalid-login-placeholder", 12);
  const valid = await compare(parsed.data.password, fallbackHash);
  if (!user || !user.passwordHash || !valid) {
    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  await createUserSession(user.id);
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      action: "USER_LOGIN",
      entityType: "Session",
      metadata: { method: "password" },
    },
  });

  return NextResponse.json({ authenticated: true });
}
