import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerProfileEditor } from "@/components/CustomerProfileEditor";
import { LogoutButton } from "@/components/LogoutButton";
import { RealtimeUpdates } from "@/components/RealtimeUpdates";
import { getCurrentUser } from "@/lib/auth";
import { canEditCustomers, canViewCustomers } from "@/lib/customer-policy";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL = {
  QUEUED: "Na fila",
  OPEN: "Em atendimento",
  PENDING: "Aguardando",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado",
} as const;

type Params = { q?: string; contact?: string; tag?: string; activity?: string };

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FV";
}

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function contactHref(params: Params, contactId: string) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.tag) search.set("tag", params.tag);
  if (params.activity) search.set("activity", params.activity);
  search.set("contact", contactId);
  return `/clients?${search.toString()}`;
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewCustomers(user.role)) redirect("/");

  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100);
  const where: Prisma.ContactWhereInput = { organizationId: user.organizationId };

  if (query) {
    const digits = query.replace(/\D/g, "");
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { externalCrmId: { contains: query, mode: "insensitive" } },
      ...(digits ? [{ phoneE164: { contains: digits } } satisfies Prisma.ContactWhereInput] : []),
      { conversations: { some: { protocol: { contains: query, mode: "insensitive" } } } },
    ];
  }
  if (params.tag) where.tags = { some: { tagId: params.tag } };
  if (params.activity === "active") {
    where.conversations = { some: { status: { in: ["QUEUED", "OPEN", "PENDING"] } } };
  } else if (params.activity === "crm") {
    where.externalCrmId = { not: null };
  }

  const [contacts, tags, totalCustomers, activeCustomers, crmCustomers, taggedCustomers] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 80,
      include: {
        tags: { include: { tag: true } },
        conversations: {
          orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { lastMessageAt: true, status: true, protocol: true },
        },
        _count: { select: { conversations: true } },
      },
    }),
    prisma.tag.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.contact.count({ where: { organizationId: user.organizationId } }),
    prisma.contact.count({
      where: {
        organizationId: user.organizationId,
        conversations: { some: { status: { in: ["QUEUED", "OPEN", "PENDING"] } } },
      },
    }),
    prisma.contact.count({
      where: { organizationId: user.organizationId, externalCrmId: { not: null } },
    }),
    prisma.contact.count({
      where: { organizationId: user.organizationId, tags: { some: {} } },
    }),
  ]);

  const selectedSummary =
    contacts.find((contact) => contact.id === params.contact) ?? contacts[0] ?? null;

  const selected = selectedSummary
    ? await prisma.contact.findFirst({
        where: { id: selectedSummary.id, organizationId: user.organizationId },
        include: {
          tags: { include: { tag: true } },
          conversations: {
            orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
            take: 50,
            include: {
              assignedAgent: { select: { name: true } },
              tags: { include: { tag: true } },
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { body: true, mediaType: true, direction: true, createdAt: true },
              },
              _count: { select: { messages: true } },
            },
          },
        },
      })
    : null;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>♥</span><div><strong>farmavale</strong><small>CENTRAL</small></div></div>
        <nav>
          <Link href="/">▣ <span>Atendimentos</span></Link>
          <Link href="/overview">◫ <span>Visão geral</span></Link>
          <Link className="active" href="/clients">◎ <span>Clientes</span></Link>
          <Link href="/reports">▤ <span>Relatórios</span></Link>
          <p>GESTÃO</p>
          <a>⌁ <span>Integrações</span></a>
          {["OWNER", "ADMIN"].includes(user.role) ? <Link href="/team">◇ <span>Equipe e acesso</span></Link> : null}
        </nav>
      </aside>

      <section className="content clientsContent">
        <header>
          <div><small>RELACIONAMENTO E HISTÓRICO</small><h1>Clientes</h1></div>
          <RealtimeUpdates />
          <div className="live">{user.name} · {user.role}</div>
          <LogoutButton />
        </header>

        <div className="clientMetrics">
          <article><span>Clientes cadastrados</span><strong>{totalCustomers}</strong><small>Base consolidada</small></article>
          <article><span>Em atendimento</span><strong>{activeCustomers}</strong><small>Com conversa ativa</small></article>
          <article><span>Vinculados ao CRM</span><strong>{crmCustomers}</strong><small>Identificador externo</small></article>
          <article><span>Com etiquetas</span><strong>{taggedCustomers}</strong><small>Segmentação ativa</small></article>
        </div>

        <div className="clientsWorkspace">
          <section className="clientsList">
            <div className="clientListTitle"><h2>Base de clientes</h2><span>{contacts.length} exibidos</span></div>
            <form className="clientFilters" method="get">
              <input name="q" defaultValue={params.q} placeholder="Nome, telefone, e-mail, CRM ou protocolo" />
              <select name="tag" defaultValue={params.tag ?? ""}>
                <option value="">Todas as etiquetas</option>
                {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
              <select name="activity" defaultValue={params.activity ?? ""}>
                <option value="">Toda a base</option>
                <option value="active">Em atendimento</option>
                <option value="crm">Vinculados ao CRM</option>
              </select>
              <button type="submit">Buscar</button>
              <Link href="/clients">Limpar</Link>
            </form>
            <div className="clientRows">
              {contacts.map((contact) => (
                <Link className={selected?.id === contact.id ? "clientRow selectedClient" : "clientRow"} href={contactHref(params, contact.id)} key={contact.id}>
                  <span className="clientAvatar">{initials(contact.name)}</span>
                  <span><strong>{contact.name}</strong><small>{contact.phoneE164} · {contact._count.conversations} atendimento(s)</small></span>
                  <span>{contact.conversations[0] ? STATUS_LABEL[contact.conversations[0].status] : "Sem atendimento"}<small>{formatDate(contact.conversations[0]?.lastMessageAt ?? null)}</small></span>
                </Link>
              ))}
              {!contacts.length ? <div className="emptyState"><strong>Nenhum cliente encontrado</strong><span>Ajuste os filtros de busca.</span></div> : null}
            </div>
          </section>

          <section className="customerProfile">
            {selected ? (
              <>
                <div className="customerProfileHeader">
                  <span className="clientAvatar largeClientAvatar">{initials(selected.name)}</span>
                  <div><small>PERFIL 360º</small><h2>{selected.name}</h2><p>{selected.phoneE164} · cliente desde {formatDate(selected.createdAt)}</p></div>
                </div>
                <CustomerProfileEditor
                  contact={{ id: selected.id, name: selected.name, email: selected.email, externalCrmId: selected.externalCrmId }}
                  tags={tags}
                  selectedTagIds={selected.tags.map(({ tagId }) => tagId)}
                  canEdit={canEditCustomers(user.role)}
                />
                <div className="customerHistoryTitle"><div><small>LINHA DO TEMPO</small><h2>Histórico de atendimentos</h2></div><span>{selected.conversations.length} registros recentes</span></div>
                <div className="customerTimeline">
                  {selected.conversations.map((conversation) => {
                    const lastMessage = conversation.messages[0];
                    return (
                      <article key={conversation.id}>
                        <i />
                        <div className="timelineCard">
                          <div>
                            <Link href={`/?conversation=${conversation.id}`}>{conversation.protocol}</Link>
                            <span className={`reportBadge status-${conversation.status.toLowerCase()}`}>{STATUS_LABEL[conversation.status]}</span>
                          </div>
                          <p>{lastMessage?.body ?? (lastMessage?.mediaType ? `[${lastMessage.mediaType}]` : "Atendimento sem mensagens")}</p>
                          <footer>
                            <span>{conversation.assignedAgent?.name ?? "Não atribuído"}</span>
                            <span>{conversation._count.messages} mensagens</span>
                            <time>{formatDate(conversation.lastMessageAt ?? conversation.createdAt)}</time>
                          </footer>
                          {conversation.tags.length ? <div className="timelineTags">{conversation.tags.map(({ tag }) => <small key={tag.id} style={{ borderColor: tag.color }}>{tag.name}</small>)}</div> : null}
                        </div>
                      </article>
                    );
                  })}
                  {!selected.conversations.length ? <div className="emptyState"><strong>Sem histórico</strong><span>Este cliente ainda não possui atendimentos.</span></div> : null}
                </div>
              </>
            ) : <div className="emptyChat"><div className="brandEmpty">♥</div><h2>Nenhum cliente selecionado</h2><p>Escolha um cliente na lista para consultar o perfil completo.</p></div>}
          </section>
        </div>
      </section>
    </main>
  );
}
