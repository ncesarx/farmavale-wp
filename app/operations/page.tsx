import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { RealtimeUpdates } from "@/components/RealtimeUpdates";
import { SlaPolicyManager } from "@/components/SlaPolicyManager";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SLA_POLICIES, type SlaPriority } from "@/lib/sla-policy";

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export default async function OperationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["OWNER", "ADMIN", "SUPERVISOR"].includes(user.role)) redirect("/");
  const stored = await prisma.slaPolicy.findMany({ where: { organizationId: user.organizationId } });
  const policies = PRIORITIES.map((priority) => {
    const policy = stored.find((item) => item.priority === priority);
    const fallback = DEFAULT_SLA_POLICIES[priority as SlaPriority];
    return {
      priority, responseMinutes: policy?.responseMinutes ?? fallback.responseMinutes,
      warningMinutes: policy?.warningMinutes ?? fallback.warningMinutes,
      escalateAfterMinutes: policy?.escalateAfterMinutes ?? fallback.escalateAfterMinutes,
      notifySupervisors: policy?.notifySupervisors ?? true, isActive: policy?.isActive ?? true,
    };
  });
  const now = new Date();
  const warningAt = new Date(now);
  warningAt.setMinutes(warningAt.getMinutes() + 15);
  const [open, warning, overdue, queued] = await Promise.all([
    prisma.conversation.count({ where: { organizationId: user.organizationId, status: { in: ["OPEN", "PENDING"] } } }),
    prisma.conversation.count({ where: { organizationId: user.organizationId, status: { in: ["OPEN", "PENDING"] }, slaDueAt: { gt: now, lte: warningAt } } }),
    prisma.conversation.count({ where: { organizationId: user.organizationId, status: { in: ["OPEN", "PENDING"] }, slaDueAt: { lte: now } } }),
    prisma.conversation.count({ where: { organizationId: user.organizationId, status: "QUEUED" } }),
  ]);
  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span aria-hidden="true" /><div><strong>farmavale</strong><small>CENTRAL</small></div></div><nav>
      <Link href="/">▣ <span>Atendimentos</span></Link><Link href="/overview">◫ <span>Visão geral</span></Link><Link href="/clients">◎ <span>Clientes</span></Link><Link href="/reports">▤ <span>Relatórios</span></Link><p>GESTÃO</p><Link href="/integrations">⌁ <span>Integrações</span></Link><Link href="/team">◇ <span>Equipe e acesso</span></Link><a className="active">◷ <span>SLA e filas</span></a>
    </nav></aside>
    <section className="content operationsContent"><header><div><small>OPERAÇÃO E QUALIDADE</small><h1>SLA, filas e escalonamentos</h1></div><RealtimeUpdates /><span className="userPill">{user.name} · {user.role}</span><LogoutButton /></header>
      <div className="operationMetrics"><article><span>Ativos</span><strong>{open}</strong><small>Em atendimento</small></article><article><span>Em alerta</span><strong>{warning}</strong><small>Próximos do prazo</small></article><article><span>Vencidos</span><strong>{overdue}</strong><small>Exigem ação</small></article><article><span>Na fila</span><strong>{queued}</strong><small>Aguardando agente</small></article></div>
      <section className="operationBody"><div className="operationIntro"><small>POLÍTICAS OPERACIONAIS</small><h2>Prazos por prioridade</h2><p>O prazo é aplicado automaticamente quando uma conversa entra na Central. Alertas antecipados chegam ao atendente; vencimentos podem ser escalonados à supervisão.</p></div><SlaPolicyManager initialPolicies={policies} /></section>
    </section>
  </main>;
}