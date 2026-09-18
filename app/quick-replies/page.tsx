import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { QuickReplyManager } from "@/components/QuickReplyManager";
import { RealtimeUpdates } from "@/components/RealtimeUpdates";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function QuickRepliesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["OWNER", "ADMIN", "SUPERVISOR"].includes(user.role)) redirect("/");
  const replies = await prisma.quickReply.findMany({ where: { organizationId: user.organizationId, isActive: true }, orderBy: [{ usageCount: "desc" }, { title: "asc" }], select: { id: true, title: true, shortcut: true, body: true, category: true, usageCount: true } });
  return <main className="shell"><aside className="sidebar"><div className="brand"><span>♥</span><div><strong>farmavale</strong><small>CENTRAL</small></div></div><nav>
    <Link href="/">▣ <span>Atendimentos</span></Link><Link href="/overview">◫ <span>Visão geral</span></Link><Link href="/clients">◎ <span>Clientes</span></Link><Link href="/reports">▤ <span>Relatórios</span></Link><p>GESTÃO</p><Link href="/integrations">⌁ <span>Integrações</span></Link><Link href="/team">◇ <span>Equipe e acesso</span></Link><Link href="/operations">◷ <span>SLA e filas</span></Link><a className="active">⌘ <span>Respostas rápidas</span></a>
  </nav></aside><section className="content quickRepliesContent"><header><div><small>PADRONIZAÇÃO DO ATENDIMENTO</small><h1>Respostas rápidas</h1></div><RealtimeUpdates /><span className="userPill">{user.name} · {user.role}</span><LogoutButton /></header>
    <section className="quickRepliesBody"><div className="operationIntro"><small>BASE OPERACIONAL</small><h2>Mensagens reutilizáveis pela equipe</h2><p>Cadastre textos consistentes com atalhos e variáveis preenchidas automaticamente durante o atendimento.</p></div><QuickReplyManager replies={replies} /></section>
  </section></main>;
}
