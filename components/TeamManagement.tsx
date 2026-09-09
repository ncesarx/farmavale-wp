"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Role = "OWNER" | "ADMIN" | "SUPERVISOR" | "AGENT" | "ANALYST";
type UserStatus = "INVITED" | "ACTIVE" | "SUSPENDED";
type AgentStatus = "OFFLINE" | "AVAILABLE" | "BUSY" | "AWAY";

type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  agentStatus: AgentStatus;
  maxOpenConversations: number;
  openConversations: number;
};

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  AGENT: "Atendente",
  ANALYST: "Analista",
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  AVAILABLE: "Disponível",
  BUSY: "Ocupado",
  AWAY: "Ausente",
  OFFLINE: "Offline",
};

function errorMessage(code?: string) {
  const messages: Record<string, string> = {
    email_exists: "Este e-mail já pertence a um usuário.",
    invalid_user: "Revise os dados. A senha deve ter pelo menos 12 caracteres.",
    invalid_role: "Seu perfil não pode atribuir esse papel.",
    cannot_change_self_access: "Você não pode alterar seu próprio papel ou acesso.",
    last_owner: "A organização precisa manter ao menos um proprietário ativo.",
    forbidden: "Você não possui permissão para esta alteração.",
  };
  return messages[code ?? ""] ?? "Não foi possível concluir a operação.";
}

function UserEditor({
  member,
  currentUserId,
  currentUserRole,
}: {
  member: TeamUser;
  currentUserId: string;
  currentUserRole: Role;
}) {
  const router = useRouter();
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState(member.status);
  const [capacity, setCapacity] = useState(member.maxOpenConversations);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const isSelf = member.id === currentUserId;
  const cannotManageOwner = currentUserRole === "ADMIN" && member.role === "OWNER";

  async function save() {
    setFeedback("");
    const response = await fetch(`/api/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        role,
        status,
        maxOpenConversations: capacity,
      }),
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setFeedback(errorMessage(result?.error));
      return;
    }
    setFeedback("Alterações salvas.");
    startTransition(() => router.refresh());
  }

  return (
    <article className="teamMember">
      <div className="memberIdentity">
        <span>{member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
        <div><strong>{member.name}</strong><small>{member.email}</small></div>
      </div>
      <div className="memberPresence">
        <i className={`agentDot agent-${member.agentStatus.toLowerCase()}`} />
        {STATUS_LABEL[member.agentStatus]}
        <small>{member.openConversations} em atendimento</small>
      </div>
      <label>Nome
        <input value={name} maxLength={80} disabled={pending || cannotManageOwner} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>Papel
        <select value={role} disabled={pending || isSelf || cannotManageOwner} onChange={(event) => setRole(event.target.value as Role)}>
          {Object.entries(ROLE_LABEL).map(([value, label]) =>
            currentUserRole === "ADMIN" && value === "OWNER" ? null : <option key={value} value={value}>{label}</option>
          )}
        </select>
      </label>
      <label>Acesso
        <select value={status} disabled={pending || isSelf || cannotManageOwner} onChange={(event) => setStatus(event.target.value as UserStatus)}>
          <option value="INVITED">Convidado</option>
          <option value="ACTIVE">Ativo</option>
          <option value="SUSPENDED">Suspenso</option>
        </select>
      </label>
      <label>Limite
        <input type="number" min={0} max={100} value={capacity} disabled={pending || cannotManageOwner} onChange={(event) => setCapacity(Number(event.target.value))} />
      </label>
      <button type="button" disabled={pending || cannotManageOwner || !name.trim()} onClick={save}>
        {pending ? "Salvando…" : "Salvar"}
      </button>
      <small className={feedback === "Alterações salvas." ? "teamSuccess" : "teamError"}>{feedback}</small>
    </article>
  );
}

export function TeamManagement({
  users,
  currentUserId,
  currentUserRole,
}: {
  users: TeamUser[];
  currentUserId: string;
  currentUserRole: Role;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setFeedback("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        role: form.get("role"),
        maxOpenConversations: Number(form.get("capacity")),
      }),
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setFeedback(errorMessage(result?.error));
      setCreating(false);
      return;
    }
    formElement.reset();
    setFeedback("Usuário criado. Ele já pode acessar a Central.");
    setCreating(false);
    router.refresh();
  }

  return (
    <>
      <section className="createMemberCard">
        <div><small>NOVO ACESSO</small><h2>Adicionar integrante</h2><p>Defina uma senha temporária segura com pelo menos 12 caracteres.</p></div>
        <form onSubmit={createMember}>
          <input name="name" required minLength={2} maxLength={80} placeholder="Nome completo" />
          <input name="email" required type="email" maxLength={160} placeholder="E-mail corporativo" />
          <input name="password" required type="password" minLength={12} maxLength={200} placeholder="Senha temporária" />
          <select name="role" defaultValue="AGENT">
            {Object.entries(ROLE_LABEL).map(([value, label]) =>
              currentUserRole === "ADMIN" && value === "OWNER" ? null : <option key={value} value={value}>{label}</option>
            )}
          </select>
          <input name="capacity" required type="number" min={0} max={100} defaultValue={5} aria-label="Limite de atendimentos" />
          <button disabled={creating} type="submit">{creating ? "Criando…" : "Criar acesso"}</button>
        </form>
        {feedback ? <p className={feedback.startsWith("Usuário criado") ? "teamSuccess" : "teamError"}>{feedback}</p> : null}
      </section>

      <section className="teamList">
        <div className="teamListTitle"><h2>Integrantes</h2><span>{users.length} usuários</span></div>
        {users.map((member) => (
          <UserEditor
            key={member.id}
            member={member}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
          />
        ))}
      </section>
    </>
  );
}
