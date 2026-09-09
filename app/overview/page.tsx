import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { RealtimeUpdates } from "@/components/RealtimeUpdates";
import { getCurrentUser } from "@/lib/auth";
import {
  buildDailyVolume,
  calculateOverviewMetrics,
  formatDuration,
} from "@/lib/overview-metrics";
import { prisma } from "@/lib/prisma";

const REPORTING_ROLES = ["OWNER", "ADMIN", "SUPERVISOR", "ANALYST"];
const STATUS_LABEL = {
  QUEUED: "Na fila",
  OPEN: "Em atendimento",
  PENDING: "Aguardando",
  RESOLVED: "Resolvidos",
  CLOSED: "Encerrados",
} as const;
const PERIODS = [7, 30, 90] as const;

function percent(value: number) {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!REPORTING_ROLES.includes(user.role)) redirect("/");

  const params = await searchParams;
  const parsedPeriod = Number(params.period);
  const period = PERIODS.includes(parsedPeriod as (typeof PERIODS)[number])
    ? parsedPeriod
    : 30;
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - period + 1);
  start.setUTCHours(0, 0, 0, 0);
  const organizationId = user.organizationId;

  const [conversations, backlog, users, assignments, inboundMessages, outboundMessages, failedMessages] =
    await Promise.all([
      prisma.conversation.findMany({
        where: { organizationId, createdAt: { gte: start } },
        select: {
          id: true,
          createdAt: true,
          firstResponseAt: true,
          resolvedAt: true,
        },
      }),
      prisma.conversation.groupBy({
        by: ["status"],
        where: {
          organizationId,
          status: { in: ["QUEUED", "OPEN", "PENDING"] },
        },
        _count: { _all: true },
      }),
      prisma.user.findMany({
        where: { organizationId, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          agentStatus: true,
          maxOpenConversations: true,
          _count: {
            select: {
              assignedConversations: {
                where: { status: { in: ["OPEN", "PENDING"] } },
              },
            },
          },
        },
      }),
      prisma.conversationAssignment.findMany({
        where: {
          assignedAt: { gte: start },
          conversation: { organizationId },
        },
        select: {
          agentId: true,
          conversation: {
            select: { resolvedAt: true, firstResponseAt: true },
          },
        },
      }),
      prisma.message.count({
        where: {
          direction: "INBOUND",
          createdAt: { gte: start },
          conversation: { organizationId },
        },
      }),
      prisma.message.count({
        where: {
          direction: "OUTBOUND",
          createdAt: { gte: start },
          conversation: { organizationId },
        },
      }),
      prisma.message.count({
        where: {
          direction: "OUTBOUND",
          status: "FAILED",
          createdAt: { gte: start },
          conversation: { organizationId },
        },
      }),
    ]);

  const metrics = calculateOverviewMetrics(conversations, now);
  const series = buildDailyVolume(conversations, period, now);
  const maxVolume = Math.max(1, ...series.map((item) => item.count));
  const backlogByStatus = new Map(
    backlog.map((item) => [item.status, item._count._all]),
  );
  const queueCount = backlogByStatus.get("QUEUED") ?? 0;
  const pendingCount = backlogByStatus.get("PENDING") ?? 0;
  const availableAgents = users.filter(
    (member) => member.agentStatus === "AVAILABLE",
  ).length;

  const agentRows = users
    .filter((member) =>
      ["OWNER", "ADMIN", "SUPERVISOR", "AGENT"].includes(member.role),
    )
    .map((member) => {
      const periodAssignments = assignments.filter(
        (assignment) => assignment.agentId === member.id,
      );
      return {
        ...member,
        assigned: periodAssignments.length,
        resolved: periodAssignments.filter(
          (assignment) => assignment.conversation.resolvedAt,
        ).length,
      };
    })
    .sort(
      (left, right) =>
        right.resolved - left.resolved ||
        right.assigned - left.assigned ||
        left.name.localeCompare(right.name),
    );

  const alerts = [
    queueCount > 0
      ? {
          level: queueCount >= availableAgents + 3 ? "critical" : "warning",
          title: `${queueCount} atendimento(s) aguardando distribuição`,
          detail:
            availableAgents > 0
              ? `${availableAgents} agente(s) disponível(is) no momento.`
              : "Nenhum agente está disponível.",
        }
      : null,
    metrics.slaBreaches > 0
      ? {
          level: metrics.slaRate < 80 ? "critical" : "warning",
          title: `${metrics.slaBreaches} violação(ões) de SLA no período`,
          detail: "Meta operacional: primeira resposta em até 5 minutos.",
        }
      : null,
    failedMessages > 0
      ? {
          level: "warning",
          title: `${failedMessages} falha(s) no envio pelo WhatsApp`,
          detail: "Revise as restrições e credenciais da conta Meta.",
        }
      : null,
  ].filter(Boolean) as Array<{
    level: string;
    title: string;
    detail: string;
  }>;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>♥</span><div><strong>farmavale</strong><small>CENTRAL</small></div></div>
        <nav>
          <Link href="/">▣ <span>Atendimentos</span></Link>
          <Link className="active" href="/overview">◫ <span>Visão geral</span></Link>
          <Link href="/clients">◎ <span>Clientes</span></Link>
          <Link href="/reports">▤ <span>Relatórios</span></Link>
          <p>GESTÃO</p>
          <Link href="/integrations">⌁ <span>Integrações</span></Link>
          {["OWNER", "ADMIN"].includes(user.role) ? <Link href="/team">◇ <span>Equipe e acesso</span></Link> : null}
        </nav>
      </aside>

      <section className="content overviewContent">
        <header>
          <div><small>INTELIGÊNCIA OPERACIONAL</small><h1>Visão geral</h1></div>
          <RealtimeUpdates />
          <div className="live">{user.name} · {user.role}</div>
          <LogoutButton />
        </header>

        <div className="overviewToolbar">
          <div><strong>Desempenho da operação</strong><small>Atualizado em tempo real · SLA de primeira resposta: 5 minutos</small></div>
          <div className="periodPicker">
            {PERIODS.map((days) => (
              <Link className={period === days ? "selectedPeriod" : ""} href={`/overview?period=${days}`} key={days}>
                {days} dias
              </Link>
            ))}
          </div>
        </div>

        <div className="overviewMetrics">
          <article><span>Novos atendimentos</span><strong>{metrics.total}</strong><small>{inboundMessages} mensagens recebidas</small></article>
          <article><span>SLA cumprido</span><strong className={metrics.slaRate < 80 ? "metricRisk" : "metricSuccess"}>{percent(metrics.slaRate)}</strong><small>{metrics.slaBreaches} fora da meta</small></article>
          <article><span>Primeira resposta</span><strong>{formatDuration(metrics.averageResponseSeconds)}</strong><small>Tempo médio no período</small></article>
          <article><span>Tempo de resolução</span><strong>{formatDuration(metrics.averageResolutionMinutes === null ? null : metrics.averageResolutionMinutes * 60)}</strong><small>{metrics.resolved} resolvidos</small></article>
          <article><span>Mensagens enviadas</span><strong>{outboundMessages}</strong><small>{failedMessages} falhas registradas</small></article>
        </div>

        <div className="overviewGrid">
          <section className="dashboardCard volumeCard">
            <div className="cardHeading"><div><small>VOLUME</small><h2>Atendimentos iniciados</h2></div><span>Últimos {period} dias</span></div>
            <div className="volumeChart">
              {series.map((item, index) => (
                <div className="volumeColumn" key={item.key} title={`${item.label}: ${item.count}`}>
                  <span>{item.count || ""}</span>
                  <i style={{ height: `${Math.max(3, (item.count / maxVolume) * 100)}%` }} />
                  {(period <= 7 || index % Math.ceil(period / 8) === 0 || index === period - 1) ? <small>{item.label}</small> : <small />}
                </div>
              ))}
            </div>
          </section>

          <section className="dashboardCard alertCard">
            <div className="cardHeading"><div><small>ALERTAS</small><h2>Desvios operacionais</h2></div><span>{alerts.length}</span></div>
            <div className="alertList">
              {alerts.length ? alerts.map((alert) => (
                <article className={`operationalAlert ${alert.level}`} key={alert.title}>
                  <i /><div><strong>{alert.title}</strong><small>{alert.detail}</small></div>
                </article>
              )) : (
                <div className="healthyOperation"><span>✓</span><strong>Operação dentro dos parâmetros</strong><small>Nenhum desvio crítico detectado.</small></div>
              )}
            </div>
          </section>

          <section className="dashboardCard backlogCard">
            <div className="cardHeading"><div><small>BACKLOG</small><h2>Fila atual</h2></div><span>{queueCount + pendingCount + (backlogByStatus.get("OPEN") ?? 0)}</span></div>
            <div className="statusBreakdown">
              {(["QUEUED", "OPEN", "PENDING"] as const).map((status) => {
                const count = backlogByStatus.get(status) ?? 0;
                const total = Math.max(1, queueCount + pendingCount + (backlogByStatus.get("OPEN") ?? 0));
                return <div key={status}><span><b>{STATUS_LABEL[status]}</b><strong>{count}</strong></span><i><em style={{ width: `${(count / total) * 100}%` }} /></i></div>;
              })}
            </div>
          </section>

          <section className="dashboardCard agentsCard">
            <div className="cardHeading"><div><small>EQUIPE</small><h2>Desempenho por agente</h2></div><span>{availableAgents} disponíveis</span></div>
            <div className="agentPerformance">
              <div className="agentTableHeader"><span>Agente</span><span>Presença</span><span>Recebidos</span><span>Resolvidos</span><span>Carga atual</span></div>
              {agentRows.map((member) => (
                <div className="agentMetricRow" key={member.id}>
                  <strong>{member.name}<small>{member.role}</small></strong>
                  <span><i className={`agentDot agent-${member.agentStatus.toLowerCase()}`} />{member.agentStatus}</span>
                  <b>{member.assigned}</b>
                  <b>{member.resolved}</b>
                  <b>{member._count.assignedConversations}/{member.maxOpenConversations}</b>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
