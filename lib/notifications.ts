import type { NotificationType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isNotificationEnabled } from "@/lib/notification-policy";
import { publishRealtimeEvent } from "@/lib/realtime";
import { sendWebPush } from "@/lib/web-push";

type CreateNotificationInput = {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
  metadata?: Prisma.InputJsonValue;
  dedupKey?: string;
};

export async function createUserNotification(input: CreateNotificationInput) {
  const preference = await prisma.notificationPreference.upsert({
    where: { userId: input.userId }, update: {}, create: { userId: input.userId },
  });
  if (!isNotificationEnabled(input.type, preference)) return null;

  let notification;
  try {
    notification = await prisma.notification.create({
      data: {
        organizationId: input.organizationId, userId: input.userId,
        type: input.type, title: input.title, body: input.body,
        href: input.href, metadata: input.metadata, dedupKey: input.dedupKey,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return null;
    throw error;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId }, select: { slug: true },
  });
  if (organization) publishRealtimeEvent({ organizationSlug: organization.slug, type: "notification.created" });

  if (preference.pushEnabled) {
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: input.userId } });
    await Promise.allSettled(subscriptions.map(async (subscription) => {
      try {
        const result = await sendWebPush(subscription, {
          title: notification.title, body: notification.body, href: notification.href,
          notificationId: notification.id, type: notification.type,
        });
        if (result.status === 404 || result.status === 410) {
          await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
        }
      } catch (error) {
        console.warn("push_delivery_failed", {
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }));
  }
  return notification;
}
