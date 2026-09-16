import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  newMessages: z.boolean().optional(), assignments: z.boolean().optional(),
  slaWarnings: z.boolean().optional(), pushEnabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_preferences" }, { status: 400 });
  const preference = await prisma.notificationPreference.upsert({
    where: { userId: user.id }, update: parsed.data, create: { userId: user.id, ...parsed.data },
  });
  return NextResponse.json({ preference });
}
