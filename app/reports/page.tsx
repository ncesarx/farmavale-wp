import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/auth";
import { calculateOverviewMetrics, formatDuration } from "@/lib/overview-metrics";
import { prisma } from "@/lib/prisma";
import { canViewReports, parseReportMonth, REPORT_PRIORITIES, REPORT_STATUSES } from "@/lib/reporting";

const STATUS_LABEL = { QUEUED: "Na fila", OPEN: "Em atendimento", PENDING: "Aguardando", RESOLVED: "Resolvido", CLOSED: "Encerrado" } as const;
const PRIORITY_LABEL = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente" } as const;
type Params = { month?: string; agent?: string; status?: string; priority?: string };

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(value);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewReports(user.role)) redirect("/");

  const params = await searchParams;
  const range = parseReportMonth(params.month);
  const where: Prisma.ConversationWhereInput = {
    organizationId: user.organizationId,
    createdAt: { gte: range.start, lt: range.end },
  };
  if (params.status && REPORT_STATUSES.includes(params.status as (typeof REPORT_STATUSES)[number])) where.status = params.status as (typeof REPORT_STATUSES)[number];
  if (params.priority && REPORT_PRIORITIES.includes(params.priority as (typeof REPORT_PRIORITIES)[number])) where.priority = params.priority as (typeof REPORT_PRIORITIES)[number];
  if (params.agent) where.assignments = { some: { agentId: params.agent } };

  const [metricSource, conversations, agents, inbound, outbound, failures] = await Promise.all([
    prisma.conversation.findMany({
      where,
      select: { createdAt: true, firstResponseAt: true, resolvedAt: true },
    }),
    prisma.conversation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 250,
      include: {
        contact: { select: { name: true } },
        assignments: {
          orderBy: { assignedAt: "desc" },
          take: 1,
          select: { agent: { select: { name: true } } },
        },
        _count: { select: { messages: true } },
      },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, role: { in: ["OWNER", "ADMIN", "SUPERVISOR", "AGENT"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.message.count({
      where: {
        direction: "INBOUND",
        createdAt: { gte: range.start, lt: range.end },
        conversation: where,
      },
    }),
    prisma.message.count({
      where: {
        direction: "OUTBOUND",
        createdAt: { gte: range.start, lt: range.end },
        conversation: where,
      },
    }),
    prisma.message.count({
      where: {
        direction: "OUTBOUND", status: "FAILED",
        createdAt: { gte: range.start, lt: range.end },
        conversation: where,
      },
    }),
  ]);

  const metrics = calculateOverviewMetrics(metricSource);
  const exportParams = new URLSearchParams();
  exportParams.set("month", range.month);
  if (params.agent) exportParams.set("agent", params.agent);
  if (params.status) exportParams.set("status", params.status);
  if (params.priority) exportParams.set("priority", params.priority);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>♥</span><div><strong>farmavale</strong><small>CENTRAL</small></div></div>
        <nav>
          <Link href="/">▣ <span>Atendimentos</span></Link>
          <Link href="/overview">◫ <span>Visão geral</span></Link>
          <Link href="/clients">◎ <span>Clientes</span></Link>
          <Link className="active" href="/reports">▤ <span>Relatórios</span></Link>
          <p>GESTÃO</p>
          <Link href="/integrations">⌁ <span>Integrações</span></Link>
          {["OWNER", "ADMIN"].includes(user.role) ? <Link href="/team">◇ <span>Equipe e acesso</span></Link> : null}
        </nav>
      </aside>

      <section className="content reportsContent">
        <header>
          <div><small>ANÁLISE E EXPORTAÇÃO</small><h1>Relatórios</h1></div>
          <div className="live">{user.name} · {user.role}</div>
          <LogoutButton />
        </header>

        <div className="reportHeading">
          <div><small>RELATÓRIO MENSAL</small><h2>{range.label}</h2><p>Até 250 registros são exibidos na tela; o CSV exporta até 10.000.</p></div>
          <Link className="exportButton" href={`/api/reports/export?${exportParams.toString()}`}>Exportar CSV</Link>
        </div>

        <form className="reportFilters" method="get">
          <label>Mês<input type="month" name="month" defaultValue={range.month} /></label>
          <label>Atendente<select name="agent" defaultValue={params.agent ?? ""}><option value="">Todos</option>{agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></label>
          <label>Status<select name="status" defaultValue={params.status ?? ""}><option value="">Todos</option>{REPORT_STATUSES.map((status) => <option value={status} key={status}>{STATUS_LABEL[status]}</option>)}</select></label>
          <label>Prioridade<select name="priority" defaultValue={params.priority ?? ""}><option value="">Todas</option>{REPORT_PRIORITIES.map((priority) => <option value={priority} key={priority}>{PRIORITY_LABEL[priority]}</option>)}</select></label>
          <button type="submit">Aplicar filtros</button>
          <Link href="/reports">Limpar</Link>
        </form>

        <div className="reportMetrics">
          <article><span>Atendimentos</span><strong>{metrics.total}</strong><small>{metrics.resolved} resolvidos</small></article>
          <article><span>SLA cumprido</span><strong>{metrics.slaRate.toFixed(1)}%</strong><small>{metrics.slaBreaches} violações</small></article>
          <article><span>Resposta média</span><strong>{formatDuration(metrics.averageResponseSeconds)}</strong><small>Primeiro retorno</small></article>
          <article><span>Mensagens</span><strong>{inbound + outbound}</strong><small>{inbound} recebidas · {outbound} enviadas</small></article>
          <article><span>Falhas</span><strong>{failures}</strong><small>Envios não concluídos</small></article>
        </div>

        <section className="reportTableCard">
          <div className="reportTableTitle"><h2>Detalhamento dos atendimentos</h2><span>{conversations.length} registros exibidos</span></div>
          <div className="reportTableWrap">
            <table>
              <thead><tr><th>Protocolo</th><th>Cliente</th><th>Status</th><th>Prioridade</th><th>Atendente</th><th>Início</th><th>Primeira resposta</th><th>Resolução</th><th>Mensagens</th></tr></thead>
              <tbody>
                {conversations.map((conversation) => (
                  <tr key={conversation.id}>
                    <td><Link href={`/?conversation=${conversation.id}`}>{conversation.protocol}</Link></td>
                    <td>{conversation.contact.name}</td>
                    <td><span className={`reportBadge status-${conversation.status.toLowerCase()}`}>{STATUS_LABEL[conversation.status]}</span></td>
                    <td>{PRIORITY_LABEL[conversation.priority]}</td>
                    <td>{conversation.assignments[0]?.agent.name ?? "Não atribuído"}</td>
                    <td>{formatDate(conversation.createdAt)}</td>
                    <td>{formatDate(conversation.firstResponseAt)}</td>
                    <td>{formatDate(conversation.resolvedAt)}</td>
                    <td>{conversation._count.messages}</td>
                  </tr>
                ))}
                {!conversations.length ? <tr><td colSpan={9} className="emptyReport">Nenhum atendimento encontrado para os filtros selecionados.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
