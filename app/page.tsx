import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { PresenceControl } from "@/components/PresenceControl";
import { TicketControls } from "@/components/TicketControls";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL = {
  QUEUED: "Na fila",
  OPEN: "Em atendimento",
  PENDING: "Aguardando",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado",
} as const;

const PRIORITY_LABEL = {
  LOW: "Baixa",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
} as const;

type SearchParams = {
  conversation?: string;
  q?: string;
  status?: string;
  priority?: string;
  category?: string;
  scope?: string;
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "FV";
}

function formatTime(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function maskedPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `•••••• ${digits.slice(-4)}` : "Não informado";
}

function filterHref(params: SearchParams, changes: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, conversation: undefined, ...changes })) {
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/?${query}` : "/";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const organizationId = user.organizationId;
  const where: Prisma.ConversationWhereInput = { organizationId };
  const query = params.q?.trim().slice(0, 80);

  if (params.status && params.status in STATUS_LABEL) {
    where.status = params.status as keyof typeof STATUS_LABEL;
  }
  if (params.priority && params.priority in PRIORITY_LABEL) {
    where.priority = params.priority as keyof typeof PRIORITY_LABEL;
  }
  if (params.category?.trim()) {
    where.category = { contains: params.category.trim().slice(0, 80), mode: "insensitive" };
  }
  if (params.scope === "mine") {
    where.assignedAgentId = user.id;
  } else if (params.scope === "queue") {
    where.status = "QUEUED";
    where.assignedAgentId = null;
  }
  if (query) {
    const phoneQuery = query.replace(/\D/g, "");
    where.OR = [
      { protocol: { contains: query, mode: "insensitive" } },
      { contact: { name: { contains: query, mode: "insensitive" } } },
      ...(phoneQuery
        ? [{ contact: { phoneE164: { contains: phoneQuery } } } satisfies Prisma.ConversationWhereInput]
        : []),
    ];
  }

  const [
    openCount,
    queuedCount,
    mineCount,
    resolvedMonth,
    channel,
    conversations,
    availableTags,
  ] = await Promise.all([
    prisma.conversation.count({ where: { organizationId, status: "OPEN" } }),
    prisma.conversation.count({ where: { organizationId, status: "QUEUED" } }),
    prisma.conversation.count({
      where: {
        organizationId,
        assignedAgentId: user.id,
        status: { in: ["OPEN", "PENDING"] },
      },
    }),
    prisma.conversation.count({
      where: {
        organizationId,
        status: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { gte: monthStart },
      },
    }),
    prisma.channel.findFirst({
      where: { organizationId, type: "WHATSAPP", isActive: true },
      select: { name: true },
    }),
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 40,
      include: {
        contact: true,
        assignedAgent: { select: { name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, mediaType: true },
        },
        tags: { include: { tag: true } },
      },
    }),
    prisma.tag.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const selected =
    conversations.find((conversation) => conversation.id === params.conversation) ??
    conversations[0] ??
    null;
  const selectedMessages = selected
    ? (
        await prisma.message.findMany({
          where: { conversationId: selected.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            direction: true,
            body: true,
            mediaType: true,
            createdAt: true,
          },
        })
      ).reverse()
    : [];

  const metrics = [
    ["Em atendimento", String(openCount), "Conversas abertas"],
    ["Na fila", String(queuedCount), queuedCount ? "Aguardando distribuição" : "Fila sob controle"],
    ["Meus atendimentos", String(mineCount), `Limite: ${user.maxOpenConversations}`],
    ["Resolvidos no mês", String(resolvedMonth), "Histórico operacional"],
  ];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span>♥</span>
          <div><strong>farmavale</strong><small>CENTRAL</small></div>
        </div>
        <nav>
          <a className="active">▣ <span>Atendimentos</span><b>{conversations.length}</b></a>
          <a>◫ <span>Visão geral</span></a>
          <a>◎ <span>Clientes</span></a>
          <a>▤ <span>Relatórios</span></a>
          <p>GESTÃO</p>
          <a>⌁ <span>Integrações</span></a>
          <a>◇ <span>Equipe e acesso</span></a>
        </nav>
        <div className={channel ? "connection connected" : "connection"}>
          <i /> {channel ? "WhatsApp conectado" : "WhatsApp não configurado"}
          <small>{channel?.name ?? "Nenhum canal ativo"}</small>
        </div>
      </aside>

      <section className="content">
        <header>
          <div>
            <small>CENTRAL DE ATENDIMENTO</small>
            <h1>Atendimentos</h1>
          </div>
          <PresenceControl initialStatus={user.agentStatus} />
          <div className="live">{user.name} · {user.role}</div>
          <LogoutButton />
        </header>

        <div className="metrics">
          {metrics.map((metric) => (
            <article key={metric[0]}>
              <span>{metric[0]}</span>
              <strong>{metric[1]}</strong>
              <small className={metric[0] === "Na fila" && queuedCount ? "yellow" : "green"}>
                {metric[2]}
              </small>
            </article>
          ))}
        </div>

        <div className="workspace">
          <section className="queue">
            <div className="sectionTitle">
              <h2>Conversas <small>{conversations.length}</small></h2>
              <Link className="clearFilters" href="/">Limpar</Link>
            </div>
            <form className="queueFilters" method="get">
              <input
                name="q"
                defaultValue={params.q}
                aria-label="Buscar conversas"
                placeholder="Cliente, telefone ou protocolo"
              />
              <div>
                <select name="status" defaultValue={params.status ?? ""} aria-label="Filtrar por status">
                  <option value="">Todos os status</option>
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select name="priority" defaultValue={params.priority ?? ""} aria-label="Filtrar por prioridade">
                  <option value="">Prioridade</option>
                  {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button type="submit">Filtrar</button>
              </div>
            </form>
            <div className="tabs">
              <Link className={!params.scope ? "activeTab" : ""} href={filterHref(params, { scope: undefined })}>
                Todos
              </Link>
              <Link className={params.scope === "queue" ? "activeTab" : ""} href={filterHref(params, { scope: "queue" })}>
                Na fila {queuedCount}
              </Link>
              <Link className={params.scope === "mine" ? "activeTab" : ""} href={filterHref(params, { scope: "mine" })}>
                Meus {mineCount}
              </Link>
            </div>

            <div className="conversationList">
              {conversations.map((conversation) => {
                const preview =
                  conversation.messages[0]?.body ??
                  (conversation.messages[0]?.mediaType
                    ? `[${conversation.messages[0].mediaType}]`
                    : "Conversa sem mensagens");
                return (
                  <Link
                    href={filterHref(params, { conversation: conversation.id })}
                    className={selected?.id === conversation.id ? "conversation selected" : "conversation"}
                    key={conversation.id}
                  >
                    <div className="avatar">{initials(conversation.contact.name)}</div>
                    <div>
                      <strong>{conversation.contact.name}</strong>
                      <p>{preview}</p>
                      <small className={["HIGH", "URGENT"].includes(conversation.priority) ? "urgent" : ""}>
                        {PRIORITY_LABEL[conversation.priority]} · {STATUS_LABEL[conversation.status]}
                      </small>
                    </div>
                    <time>{formatTime(conversation.lastMessageAt)}</time>
                  </Link>
                );
              })}
              {!conversations.length ? (
                <div className="emptyState">
                  <strong>Nenhum atendimento encontrado</strong>
                  <span>Ajuste os filtros ou aguarde novas mensagens.</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="chat">
            {selected ? (
              <>
                <div className="chatHeader">
                  <div className="avatar">{initials(selected.contact.name)}</div>
                  <div>
                    <strong>{selected.contact.name}</strong>
                    <small>{selected.protocol} · WhatsApp</small>
                  </div>
                  <span>{selected.assignedAgent?.name ?? "Aguardando atendente"}</span>
                </div>
                <div className="messages">
                  <div className="system">
                    {STATUS_LABEL[selected.status]} · última atualização {formatTime(selected.updatedAt)}
                  </div>
                  {selectedMessages.map((message) => (
                    <div
                      className={message.direction === "OUTBOUND" ? "bubble out" : "bubble in"}
                      key={message.id}
                    >
                      {message.body ?? (message.mediaType ? `[${message.mediaType}]` : "[mensagem]")}
                      <time>{formatTime(message.createdAt)}</time>
                    </div>
                  ))}
                </div>
                <form className="composer">
                  <textarea
                    aria-label="Mensagem"
                    placeholder="Envio será habilitado com o número comercial"
                    disabled
                  />
                  <button type="button" disabled>Enviar ➤</button>
                </form>
              </>
            ) : (
              <div className="emptyChat">
                <div className="brandEmpty">♥</div>
                <h2>Nenhum atendimento selecionado</h2>
                <p>Escolha uma conversa ou ajuste os filtros da fila.</p>
              </div>
            )}
          </section>

          <aside className="customer">
            {selected ? (
              <>
                <div className="avatar large">{initials(selected.contact.name)}</div>
                <h3>{selected.contact.name}</h3>
                <p>{selected.assignedAgent ? `Atendente: ${selected.assignedAgent.name}` : "Na fila de distribuição"}</p>
                <hr />
                <h4>Informações do cliente</h4>
                <dl>
                  <dt>Telefone</dt><dd>{maskedPhone(selected.contact.phoneE164)}</dd>
                  <dt>E-mail</dt><dd>{selected.contact.email ?? "Não informado"}</dd>
                  <dt>Protocolo</dt><dd>{selected.protocol}</dd>
                  <dt>Status</dt><dd>{STATUS_LABEL[selected.status]}</dd>
                </dl>
                <hr />
                <TicketControls
                  conversationId={selected.id}
                  status={selected.status}
                  priority={selected.priority}
                  category={selected.category}
                  tags={availableTags}
                  selectedTagIds={selected.tags.map(({ tagId }) => tagId)}
                  canCreateTags={["OWNER", "ADMIN", "SUPERVISOR"].includes(user.role)}
                />
              </>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
}
