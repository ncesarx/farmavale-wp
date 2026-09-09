import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canViewReports,
  parseReportMonth,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
  toCsv,
} from "@/lib/reporting";

const STATUS_LABEL = { QUEUED: "Na fila", OPEN: "Em atendimento", PENDING: "Aguardando", RESOLVED: "Resolvido", CLOSED: "Encerrado" } as const;
const PRIORITY_LABEL = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente" } as const;

function formatDate(value: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo",
  }).format(value);
}

function durationMinutes(start: Date, end: Date | null) {
  return end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)) : "";
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewReports(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const search = request.nextUrl.searchParams;
  const range = parseReportMonth(search.get("month") ?? undefined);
  const status = search.get("status");
  const priority = search.get("priority");
  const agentId = search.get("agent");

  const where: Prisma.ConversationWhereInput = {
    organizationId: user.organizationId,
    createdAt: { gte: range.start, lt: range.end },
  };
  if (status && REPORT_STATUSES.includes(status as (typeof REPORT_STATUSES)[number])) where.status = status as (typeof REPORT_STATUSES)[number];
  if (priority && REPORT_PRIORITIES.includes(priority as (typeof REPORT_PRIORITIES)[number])) where.priority = priority as (typeof REPORT_PRIORITIES)[number];
  if (agentId) where.assignments = { some: { agentId } };

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 10_000,
    include: {
      contact: { select: { name: true, phoneE164: true } },
      messages: { select: { id: true, direction: true, status: true } },
      assignments: {
        orderBy: { assignedAt: "desc" },
        take: 1,
        select: { agent: { select: { name: true } } },
      },
      tags: { include: { tag: { select: { name: true } } } },
    },
  });

  const csv = toCsv(
    ["Protocolo", "Cliente", "Telefone", "Status", "Prioridade", "Categoria", "Atendente", "Criado em", "Primeira resposta em", "Minutos até primeira resposta", "Resolvido em", "Minutos até resolução", "Mensagens recebidas", "Mensagens enviadas", "Falhas de envio", "Etiquetas"],
    conversations.map((conversation) => [
      conversation.protocol,
      conversation.contact.name,
      conversation.contact.phoneE164,
      STATUS_LABEL[conversation.status],
      PRIORITY_LABEL[conversation.priority],
      conversation.category,
      conversation.assignments[0]?.agent.name ?? "",
      formatDate(conversation.createdAt),
      formatDate(conversation.firstResponseAt),
      durationMinutes(conversation.createdAt, conversation.firstResponseAt),
      formatDate(conversation.resolvedAt),
      durationMinutes(conversation.createdAt, conversation.resolvedAt),
      conversation.messages.filter((message) => message.direction === "INBOUND").length,
      conversation.messages.filter((message) => message.direction === "OUTBOUND").length,
      conversation.messages.filter((message) => message.direction === "OUTBOUND" && message.status === "FAILED").length,
      conversation.tags.map(({ tag }) => tag.name).join(", "),
    ]),
  );

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      action: "MONTHLY_REPORT_EXPORTED",
      entityType: "Report",
      metadata: {
        month: range.month,
        status: status || null,
        priority: priority || null,
        agentId: agentId || null,
        rows: conversations.length,
        truncated: conversations.length === 10_000,
      },
    },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="farmavale-relatorio-${range.month}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
