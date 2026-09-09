import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { PresenceControl } from "@/components/PresenceControl";
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const organizationId = user.organizationId;
  const [openCount, queuedCount, mineCount, resolvedMonth, channel, conversations] =
    await Promise.all([
      prisma.conversation.count({
        where: { organizationId, status: "OPEN" },
      }),
      prisma.conversation.count({
        where: { organizationId, status: "QUEUED" },
      }),
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
        where: { organizationId },
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
              <button type="button">Filtros</button>
            </div>
            <input aria-label="Buscar conversas" placeholder="Buscar cliente, telefone ou protocolo" />
            <div className="tabs">
              <b>Todos {conversations.length}</b>
              <span>Na fila {queuedCount}</span>
              <span>Meus {mineCount}</span>
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
                    href={`/?conversation=${conversation.id}`}
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
                  <strong>Nenhum atendimento</strong>
                  <span>As novas mensagens do WhatsApp aparecerão aqui.</span>
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
                <h2>Central pronta para atender</h2>
                <p>Quando uma mensagem chegar, a conversa será criada e distribuída automaticamente.</p>
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
                <h4>Etiquetas</h4>
                <div className="tags">
                  {selected.tags.map(({ tag }) => (
                    <span key={tag.id}>{tag.name}</span>
                  ))}
                  {!selected.tags.length ? <span>Sem etiquetas</span> : null}
                </div>
              </>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
}
