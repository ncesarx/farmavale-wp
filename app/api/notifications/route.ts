import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPushConfiguration } from "@/lib/web-push";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [notifications, unread, preference, subscriptions] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notificationPreference.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } }),
    prisma.pushSubscription.count({ where: { userId: user.id } }),
  ]);
  return NextResponse.json({
    notifications, unread,
    preference: {
      newMessages: preference.newMessages, assignments: preference.assignments,
      slaWarnings: preference.slaWarnings, pushEnabled: preference.pushEnabled,
    },
    push: { configured: getPushConfiguration().configured, subscribed: subscriptions > 0 },
  });
}
