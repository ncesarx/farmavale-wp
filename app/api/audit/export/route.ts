import type { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditActionLabel, canViewAudit, parseAuditDate, summarizeAuditMetadata } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/reporting";

function formatDate(value: Date) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(value); }

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewAudit(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const search = request.nextUrl.searchParams;
  const q = search.get("q")?.trim().slice(0, 120);
  const from = parseAuditDate(search.get("from") ?? undefined);
  const to = parseAuditDate(search.get("to") ?? undefined, true);
  const where: Prisma.AuditLogWhereInput = { organizationId: user.organizationId };
  if (search.get("action")) where.action = search.get("action")!;
  if (search.get("actor")) where.actorId = search.get("actor")!;
  if (search.get("entity")) where.entityType = search.get("entity")!;
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (q) where.OR = [{ action: { contains: q, mode: "insensitive" } }, { entityType: { contains: q, mode: "insensitive" } }, { entityId: { contains: q, mode: "insensitive" } }, { actor: { name: { contains: q, mode: "insensitive" } } }];
  const logs = await prisma.auditLog.findMany({ where, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 10_000 });
  const csv = toCsv(["Data e hora", "Responsável", "E-mail", "Ação", "Código", "Recurso", "Identificador", "Detalhes"], logs.map((log) => [formatDate(log.createdAt), log.actor?.name ?? "Sistema", log.actor?.email ?? "", auditActionLabel(log.action), log.action, log.entityType, log.entityId ?? "", summarizeAuditMetadata(log.metadata, 500)]));
  await prisma.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: "AUDIT_LOG_EXPORTED", entityType: "AuditLog", metadata: { rows: logs.length, truncated: logs.length === 10_000 } } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="farmavale-auditoria-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
