import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { Prisma } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { decryptWebhookSecret, isPrivateAddress, parseSafeWebhookUrl } from "@/lib/webhook-security";

export const WEBHOOK_EVENTS = ["contact.updated", "conversation.updated"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

async function assertPublicDestination(url: URL) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("private_destination");
  }
}

function pause(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function deliverWebhook(deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || !delivery.endpoint.isActive) return;

  const url = parseSafeWebhookUrl(delivery.endpoint.url);
  if (!url) throw new Error("unsafe_webhook_url");
  await assertPublicDestination(url);

  const body = JSON.stringify(delivery.payload);
  const secret = decryptWebhookSecret(delivery.endpoint.secretEncrypted, getEnv().AUTH_SECRET);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  let lastError = "delivery_failed";
  let responseCode: number | null = null;
  const previousAttempts = delivery.attempts;

  for (let localAttempt = 1; localAttempt <= 3; localAttempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Farmavale-Webhook/1.0",
          "X-Farmavale-Delivery": delivery.eventId,
          "X-Farmavale-Event": delivery.eventType,
          "X-Farmavale-Signature-256": `sha256=${signature}`,
        },
        body,
      });
      responseCode = response.status;
      if (response.ok) {
        await prisma.$transaction([
          prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "DELIVERED",
              attempts: previousAttempts + localAttempt,
              responseCode,
              lastError: null,
              nextAttemptAt: null,
              deliveredAt: new Date(),
            },
          }),
          prisma.webhookEndpoint.update({
            where: { id: delivery.endpointId },
            data: { lastSuccessAt: new Date() },
          }),
        ]);
        return;
      }
      lastError = `http_${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.name : "network_error";
    } finally {
      clearTimeout(timeout);
    }
    if (localAttempt < 3) await pause(localAttempt * 250);
  }

  await prisma.$transaction([
    prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attempts: previousAttempts + 3,
        responseCode,
        lastError,
        nextAttemptAt: null,
      },
    }),
    prisma.webhookEndpoint.update({
      where: { id: delivery.endpointId },
      data: { lastFailureAt: new Date() },
    }),
  ]);
}

export async function dispatchWebhookEvent(
  organizationId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>,
) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { organizationId, isActive: true, events: { has: eventType } },
    select: { id: true },
  });
  if (!endpoints.length) return;

  const eventId = randomUUID();
  const payload = {
    id: eventId,
    type: eventType,
    occurredAt: new Date().toISOString(),
    data,
  } as Prisma.InputJsonValue;

  const deliveries = await Promise.all(
    endpoints.map((endpoint) =>
      prisma.webhookDelivery.create({
        data: { endpointId: endpoint.id, eventId, eventType, payload },
        select: { id: true },
      }),
    ),
  );

  await Promise.allSettled(deliveries.map(({ id }) => deliverWebhook(id)));
}
