"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Agent = { id: string; name: string; agentStatus: string; openConversations: number; maxOpenConversations: number };

export function ConversationCollaboration({
  conversationId,
  currentAgentId,
  agents,
  canCollaborate,
}: {
  conversationId: string;
  currentAgentId: string | null;
  agents: Agent[];
  canCollaborate: boolean;
}) {
  const router = useRouter();
  const [agentId, setAgentId] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  async function transfer() {
    if (!agentId) return;
    setFeedback("");
    const response = await fetch(`/api/conversations/${conversationId}/assignment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    if (!response.ok) {
      setFeedback(response.status === 409 ? "O atendente não possui capacidade disponível." : "Não foi possível transferir.");
      return;
    }
    setFeedback("Atendimento transferido.");
    startTransition(() => router.refresh());
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = note.trim();
    if (!body) return;
    setFeedback("");
    const response = await fetch(`/api/conversations/${conversationId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) return setFeedback("Não foi possível adicionar a nota.");
    setNote("");
    setFeedback("Nota interna adicionada.");
    startTransition(() => router.refresh());
  }

  if (!canCollaborate) return null;
  return (
    <div className="collaborationControls">
      <h4>Colaboração</h4>
      <label>
        Transferir atendimento
        <span>
          <select value={agentId} disabled={isPending} onChange={(event) => setAgentId(event.target.value)}>
            <option value="">Selecione o atendente</option>
            {agents.filter((agent) => agent.id !== currentAgentId).map((agent) => (
              <option value={agent.id} key={agent.id}>
                {agent.name} · {agent.openConversations}/{agent.maxOpenConversations}
              </option>
            ))}
          </select>
          <button type="button" disabled={isPending || !agentId} onClick={transfer}>Transferir</button>
        </span>
      </label>
      <form onSubmit={addNote}>
        <label>
          Nota interna
          <textarea value={note} maxLength={2000} placeholder="Visível somente para a equipe" onChange={(event) => setNote(event.target.value)} />
        </label>
        <button type="submit" disabled={isPending || !note.trim()}>Adicionar nota</button>
      </form>
      {feedback ? <p className="collaborationFeedback">{feedback}</p> : null}
    </div>
  );
}
