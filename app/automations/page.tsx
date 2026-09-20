import Link from "next/link";
import { redirect } from "next/navigation";
import { AutomationRuleManager } from "@/components/AutomationRuleManager";
import { LogoutButton } from "@/components/LogoutButton";
import { RealtimeUpdates } from "@/components/RealtimeUpdates";
import { canManageAutomations } from "@/lib/automation-rules";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AutomationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageAutomations(user.role)) redirect("/");
  const [rules, tags, agents, totalMatches] = await Promise.all([
    prisma.automationRule.findMany({ where: { organizationId: user.organizationId, isActive: true }, orderBy: { createdAt: "asc" }, include: { tag: { select: { name: true, color: true } }, assignee: { select: { name: true } } } }),
    prisma.tag.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.user.findMany({ where: { organizationId: user.organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SUPERVISOR", "AGENT"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.automationRule.aggregate({ where: { organizationId: user.organizationId }, _sum: { matchCount: true } }),
  ]);
  return <main className="shell"><aside className="sidebar"><div className="brand"><span aria-hidden="true" /><div><strong>farmavale</strong><small>CENTRAL</small></div></div><nav><Link href="/">▣ <span>Atendimentos</span></Link><Link href="/overview">◫ <span>Visão geral</span></Link><Link href="/clients">◎ <span>Clientes</span></Link><Link href="/reports">▤ <span>Relatórios</span></Link><p>GESTÃO</p><Link href="/integrations">⌁ <span>Integrações</span></Link><Link href="/team">◇ <span>Equipe e acesso</span></Link><Link href="/operations">◷ <span>SLA e filas</span></Link><Link href="/quick-replies">⌘ <span>Respostas rápidas</span></Link><a className="active">⚙ <span>Automações</span></a><Link href="/audit">⌕ <span>Auditoria</span></Link></nav></aside><section className="content automationsContent"><header><div><small>ORQUESTRAÇÃO OPERACIONAL</small><h1>Automações</h1></div><RealtimeUpdates /><span className="userPill">{user.name} · {user.role}</span><LogoutButton /></header><div className="automationMetrics"><article><span>Regras ativas</span><strong>{rules.length}</strong><small>monitorando mensagens</small></article><article><span>Execuções</span><strong>{totalMatches._sum.matchCount ?? 0}</strong><small>ações realizadas</small></article><article><span>Etiquetas disponíveis</span><strong>{tags.length}</strong><small>para classificação</small></article><article><span>Destinos</span><strong>{agents.length}</strong><small>atendentes elegíveis</small></article></div><section className="automationsBody"><div className="operationIntro"><small>MOTOR DE REGRAS</small><h2>Transforme mensagens em ações automáticas</h2><p>A primeira regra compatível é aplicada antes da distribuição automática. Um atendente específico só recebe a conversa quando estiver disponível e dentro da capacidade.</p></div><AutomationRuleManager initialRules={rules} tags={tags} agents={agents} /></section></section></main>;
}
