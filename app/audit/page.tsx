import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { auditActionLabel, canViewAudit, parseAuditDate, summarizeAuditMetadata } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { q?: string; action?: string; actor?: string; entity?: string; from?: string; to?: string; page?: string };
const PAGE_SIZE = 50;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(value);
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewAudit(user.role)) redirect("/");
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const q = params.q?.trim().slice(0, 120);
  const from = parseAuditDate(params.from);
  const to = parseAuditDate(params.to, true);
  const where: Prisma.AuditLogWhereInput = { organizationId: user.organizationId };
  if (params.action) where.action = params.action;
  if (params.actor) where.actorId = params.actor;
  if (params.entity) where.entityType = params.entity;
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (q) where.OR = [
    { action: { contains: q, mode: "insensitive" } },
    { entityType: { contains: q, mode: "insensitive" } },
    { entityId: { contains: q, mode: "insensitive" } },
    { actor: { name: { contains: q, mode: "insensitive" } } },
    { actor: { email: { contains: q, mode: "insensitive" } } },
  ];

  const [logs, total, actions, entities, actors, humanActions, systemActions, securityEvents] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where: { organizationId: user.organizationId }, distinct: ["action"], orderBy: { action: "asc" }, select: { action: true } }),
    prisma.auditLog.findMany({ where: { organizationId: user.organizationId }, distinct: ["entityType"], orderBy: { entityType: "asc" }, select: { entityType: true } }),
    prisma.user.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.auditLog.count({ where: { organizationId: user.organizationId, actorId: { not: null } } }),
    prisma.auditLog.count({ where: { organizationId: user.organizationId, actorId: null } }),
    prisma.auditLog.count({ where: { organizationId: user.organizationId, OR: [{ action: { contains: "LOGIN" } }, { action: { contains: "API_KEY" } }, { action: { contains: "USER_" } }] } }),
  ]);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value && key !== "page") query.set(key, value);
  const exportQuery = query.toString();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span>♥</span><div><strong>farmavale</strong><small>CENTRAL</small></div></div><nav>
      <Link href="/">▣ <span>Atendimentos</span></Link><Link href="/overview">◫ <span>Visão geral</span></Link><Link href="/clients">◎ <span>Clientes</span></Link><Link href="/reports">▤ <span>Relatórios</span></Link><p>GESTÃO</p><Link href="/integrations">⌁ <span>Integrações</span></Link><Link href="/team">◇ <span>Equipe e acesso</span></Link><Link className="active" href="/audit">⌕ <span>Auditoria</span></Link>
    </nav></aside>
    <section className="content auditContent"><header><div><small>SEGURANÇA OPERACIONAL</small><h1>Auditoria</h1></div><div className="live">{user.name} · {user.role}</div><LogoutButton /></header>
      <div className="auditHeading"><div><small>RASTREABILIDADE</small><h2>Histórico de atividades</h2><p>Ações registradas por usuário, recurso e data. Metadados sensíveis nunca são exibidos.</p></div><Link className="exportButton" href={`/api/audit/export${exportQuery ? `?${exportQuery}` : ""}`}>Exportar CSV</Link></div>
      <div className="auditMetrics"><article><span>Eventos filtrados</span><strong>{total}</strong><small>resultado da consulta</small></article><article><span>Ações humanas</span><strong>{humanActions}</strong><small>com usuário identificado</small></article><article><span>Automação</span><strong>{systemActions}</strong><small>ações do sistema</small></article><article><span>Segurança</span><strong>{securityEvents}</strong><small>acessos e permissões</small></article></div>
      <form className="auditFilters" method="get"><label>Busca<input name="q" defaultValue={params.q ?? ""} placeholder="Ação, entidade, ID ou usuário" /></label><label>Ação<select name="action" defaultValue={params.action ?? ""}><option value="">Todas</option>{actions.map(({ action }) => <option key={action} value={action}>{auditActionLabel(action)}</option>)}</select></label><label>Responsável<select name="actor" defaultValue={params.actor ?? ""}><option value="">Todos</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label><label>Recurso<select name="entity" defaultValue={params.entity ?? ""}><option value="">Todos</option>{entities.map(({ entityType }) => <option key={entityType} value={entityType}>{entityType}</option>)}</select></label><label>De<input type="date" name="from" defaultValue={params.from ?? ""} /></label><label>Até<input type="date" name="to" defaultValue={params.to ?? ""} /></label><button>Filtrar</button><Link href="/audit">Limpar</Link></form>
      <section className="auditTableCard"><div className="reportTableTitle"><h2>Eventos registrados</h2><span>{total} encontrados · página {page} de {pages}</span></div><div className="auditTableWrap"><table><thead><tr><th>Data e hora</th><th>Responsável</th><th>Ação</th><th>Recurso</th><th>Identificador</th><th>Detalhes seguros</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td><strong>{log.actor?.name ?? "Sistema"}</strong><small>{log.actor?.email ?? "Automação interna"}</small></td><td><span className="auditAction">{auditActionLabel(log.action)}</span><code>{log.action}</code></td><td>{log.entityType}</td><td><code>{log.entityId ?? "—"}</code></td><td className="auditMetadata">{summarizeAuditMetadata(log.metadata)}</td></tr>)}{!logs.length ? <tr><td className="emptyReport" colSpan={6}>Nenhum evento encontrado para os filtros selecionados.</td></tr> : null}</tbody></table></div>
      <div className="auditPagination">{page > 1 ? <Link href={`/audit?${new URLSearchParams([...query, ["page", String(page - 1)]]).toString()}`}>← Anterior</Link> : <span />}{page < pages ? <Link href={`/audit?${new URLSearchParams([...query, ["page", String(page + 1)]]).toString()}`}>Próxima →</Link> : null}</div></section>
    </section>
  </main>;
}
