import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiCredentialManager } from "@/components/ApiCredentialManager";
import { LogoutButton } from "@/components/LogoutButton";
import { RealtimeUpdates } from "@/components/RealtimeUpdates";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL = {
  RUNNING: "Em execução",
  SUCCEEDED: "Concluída",
  PARTIAL: "Parcial",
  FAILED: "Falhou",
} as const;

function formatDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["OWNER", "ADMIN", "SUPERVISOR", "ANALYST"].includes(user.role)) redirect("/");

  const [credentials, runs, integrations, contactCount] = await Promise.all([
    prisma.apiCredential.findMany({
      where: { organizationId: user.organizationId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    }),
    prisma.integrationRun.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { startedAt: "desc" },
      take: 30,
      select: { id: true, resource: true, direction: true, status: true, processed: true, failed: true, startedAt: true, finishedAt: true, errorMessage: true },
    }),
    prisma.integration.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { provider: "asc" },
      select: { id: true, provider: true, status: true, externalAccountId: true, lastSyncAt: true },
    }),
    prisma.contact.count({ where: { organizationId: user.organizationId, externalCrmId: { not: null } } }),
  ]);

  const succeeded = runs.filter((run) => run.status === "SUCCEEDED").length;
  const failed = runs.filter((run) => run.status === "FAILED").length;
  const canManage = ["OWNER", "ADMIN"].includes(user.role);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>♥</span><div><strong>farmavale</strong><small>CENTRAL</small></div></div>
        <nav>
          <Link href="/">▣ <span>Atendimentos</span></Link>
          <Link href="/overview">◫ <span>Visão geral</span></Link>
          <Link href="/clients">◎ <span>Clientes</span></Link>
          <Link href="/reports">▤ <span>Relatórios</span></Link>
          <p>GESTÃO</p>
          <Link className="active" href="/integrations">⌁ <span>Integrações</span></Link>
          {["OWNER", "ADMIN"].includes(user.role) ? <Link href="/team">◇ <span>Equipe e acesso</span></Link> : null}
        </nav>
      </aside>

      <section className="content integrationsContent">
        <header>
          <div><small>ECOSSISTEMA E AUTOMAÇÃO</small><h1>Integrações</h1></div>
          <RealtimeUpdates />
          <div className="live">{user.name} · {user.role}</div>
          <LogoutButton />
        </header>

        <div className="integrationMetrics">
          <article><span>Conectores</span><strong>{integrations.length}</strong><small>Configurações cadastradas</small></article>
          <article><span>Chaves ativas</span><strong>{credentials.length}</strong><small>Acesso controlado</small></article>
          <article><span>Clientes sincronizados</span><strong>{contactCount}</strong><small>Com ID externo</small></article>
          <article><span>Execuções concluídas</span><strong>{succeeded}</strong><small>{failed} falhas recentes</small></article>
        </div>

        <div className="integrationsGrid">
          <section className="integrationCard apiDocumentation">
            <div className="integrationTitle"><div><small>API REST V1</small><h2>Sincronização de clientes</h2></div><span className="integrationOnline">Disponível</span></div>
            <p>Crie ou atualize clientes do CRM pela combinação organização + telefone. Toda chamada é autenticada, auditada e idempotente.</p>
            <dl>
              <dt>Endpoint</dt><dd><code>POST /api/v1/crm/contacts</code></dd>
              <dt>Autorização</dt><dd><code>Authorization: Bearer fv_live_...</code></dd>
              <dt>Content-Type</dt><dd><code>application/json</code></dd>
            </dl>
            <pre>{`{
  "name": "Cliente Farmavale",
  "phone": "+55 12 99999-1234",
  "email": "cliente@exemplo.com",
  "externalCrmId": "CRM-12345"
}`}</pre>
          </section>

          {canManage ? (
            <ApiCredentialManager credentials={credentials.map((credential) => ({
              ...credential,
              lastUsedAt: formatDate(credential.lastUsedAt),
              expiresAt: formatDate(credential.expiresAt),
              createdAt: formatDate(credential.createdAt) ?? "",
            }))} />
          ) : (
            <section className="integrationCard"><div className="integrationTitle"><div><small>ACESSO PROGRAMÁTICO</small><h2>Chaves da API</h2></div></div><p>Somente proprietários e administradores podem gerar ou revogar credenciais.</p></section>
          )}

          <section className="integrationCard integrationRuns">
            <div className="integrationTitle"><div><small>OBSERVABILIDADE</small><h2>Execuções recentes</h2></div><span>{runs.length} registros</span></div>
            <div className="runTable">
              <div className="runHeader"><span>Início</span><span>Recurso</span><span>Direção</span><span>Resultado</span><span>Processados</span></div>
              {runs.map((run) => <div className="runRow" key={run.id}><span>{formatDate(run.startedAt)}</span><strong>{run.resource}</strong><span>{run.direction === "INBOUND" ? "CRM → Farmavale" : "Farmavale → CRM"}</span><span className={`run-${run.status.toLowerCase()}`}>{STATUS_LABEL[run.status]}</span><span>{run.processed}{run.failed ? ` · ${run.failed} falha(s)` : ""}</span></div>)}
              {!runs.length ? <div className="emptyIntegration">Nenhuma sincronização executada até agora.</div> : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
