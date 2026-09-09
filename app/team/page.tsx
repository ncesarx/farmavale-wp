import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { RealtimeUpdates } from "@/components/RealtimeUpdates";
import { TeamManagement } from "@/components/TeamManagement";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/team-policy";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageTeam(user.role)) redirect("/");

  const users = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
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
  });

  const active = users.filter((member) => member.status === "ACTIVE").length;
  const available = users.filter((member) => member.agentStatus === "AVAILABLE").length;
  const capacity = users.reduce((total, member) => total + member.maxOpenConversations, 0);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>♥</span><div><strong>farmavale</strong><small>CENTRAL</small></div></div>
        <nav>
          <Link href="/">▣ <span>Atendimentos</span></Link>
          <a>◫ <span>Visão geral</span></a>
          <a>◎ <span>Clientes</span></a>
          <a>▤ <span>Relatórios</span></a>
          <p>GESTÃO</p>
          <a>⌁ <span>Integrações</span></a>
          <Link className="active" href="/team">◇ <span>Equipe e acesso</span></Link>
        </nav>
      </aside>

      <section className="content teamContent">
        <header>
          <div><small>GESTÃO DE SEGURANÇA</small><h1>Equipe e acesso</h1></div>
          <RealtimeUpdates />
          <div className="live">{user.name} · {user.role}</div>
          <LogoutButton />
        </header>

        <div className="metrics teamMetrics">
          <article><span>Usuários ativos</span><strong>{active}</strong><small className="green">Acesso liberado</small></article>
          <article><span>Disponíveis agora</span><strong>{available}</strong><small className="green">Distribuição automática</small></article>
          <article><span>Capacidade total</span><strong>{capacity}</strong><small>Conversas simultâneas</small></article>
          <article><span>Perfis cadastrados</span><strong>{users.length}</strong><small>Dentro da organização</small></article>
        </div>

        <div className="teamWorkspace">
          <TeamManagement
            users={users.map((member) => ({
              ...member,
              openConversations: member._count.assignedConversations,
            }))}
            currentUserId={user.id}
            currentUserRole={user.role}
          />
        </div>
      </section>
    </main>
  );
}
