import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { normalizeCrmPhone } from "@/lib/api-credentials";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(30),
  email: z.union([z.string().trim().email().max(180), z.literal("")]).optional(),
  externalCrmId: z.string().trim().min(1).max(120),
});

export async function POST(request: NextRequest) {
  const credential = await authenticateApiRequest(
    request.headers.get("authorization"),
    "contacts:write",
  );
  if (!credential) {
    return NextResponse.json({ error: "invalid_api_credential" }, { status: 401 });
  }

  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_contact", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const phoneE164 = normalizeCrmPhone(parsed.data.phone);
  if (!phoneE164) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });

  const run = await prisma.integrationRun.create({
    data: {
      organizationId: credential.organizationId,
      resource: "contacts",
      direction: "INBOUND",
      metadata: { credentialId: credential.id, credentialName: credential.name },
    },
    select: { id: true },
  });

  try {
    const existing = await prisma.contact.findUnique({
      where: {
        organizationId_phoneE164: {
          organizationId: credential.organizationId,
          phoneE164,
        },
      },
      select: { id: true },
    });

    const contact = await prisma.$transaction(async (tx) => {
      const saved = await tx.contact.upsert({
        where: {
          organizationId_phoneE164: {
            organizationId: credential.organizationId,
            phoneE164,
          },
        },
        create: {
          organizationId: credential.organizationId,
          name: parsed.data.name,
          phoneE164,
          email: parsed.data.email || null,
          externalCrmId: parsed.data.externalCrmId,
          metadata: { source: "crm_api" },
        },
        update: {
          name: parsed.data.name,
          email: parsed.data.email === undefined ? undefined : parsed.data.email || null,
          externalCrmId: parsed.data.externalCrmId,
        },
        select: { id: true, name: true, phoneE164: true, email: true, externalCrmId: true, updatedAt: true },
      });

      await tx.integrationRun.update({
        where: { id: run.id },
        data: { status: "SUCCEEDED", processed: 1, finishedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          organizationId: credential.organizationId,
          action: existing ? "CRM_CONTACT_UPDATED" : "CRM_CONTACT_CREATED",
          entityType: "Contact",
          entityId: saved.id,
          metadata: { integrationRunId: run.id, externalCrmId: saved.externalCrmId },
        },
      });
      return saved;
    });

    const organization = await prisma.organization.findUnique({
      where: { id: credential.organizationId },
      select: { slug: true },
    });
    if (organization) publishRealtimeEvent({ organizationSlug: organization.slug, type: "inbox.changed" });

    return NextResponse.json({ contact, created: !existing, runId: run.id }, { status: existing ? 200 : 201 });
  } catch (error) {
    await prisma.integrationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        failed: 1,
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.name : "UnknownError",
      },
    });
    console.error("crm_contact_sync_failed", { runId: run.id, error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "sync_failed", runId: run.id }, { status: 500 });
  }
}
