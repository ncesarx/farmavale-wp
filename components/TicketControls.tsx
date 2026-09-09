"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type TicketStatus = "QUEUED" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type Tag = { id: string; name: string; color: string };

const STATUS_OPTIONS: Array<[TicketStatus, string]> = [
  ["QUEUED", "Na fila"],
  ["OPEN", "Em atendimento"],
  ["PENDING", "Aguardando"],
  ["RESOLVED", "Resolvido"],
  ["CLOSED", "Encerrado"],
];

const PRIORITY_OPTIONS: Array<[TicketPriority, string]> = [
  ["LOW", "Baixa"],
  ["NORMAL", "Normal"],
  ["HIGH", "Alta"],
  ["URGENT", "Urgente"],
];

export function TicketControls({
  conversationId,
  status,
  priority,
  category,
  tags,
  selectedTagIds,
  canCreateTags,
}: {
  conversationId: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string | null;
  tags: Tag[];
  selectedTagIds: string[];
  canCreateTags: boolean;
}) {
  const router = useRouter();
  const [selectedTags, setSelectedTags] = useState(selectedTagIds);
  const [categoryValue, setCategoryValue] = useState(category ?? "");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#FFC709");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function patch(data: Record<string, unknown>) {
    setError("");
    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      setError("Não foi possível atualizar o atendimento.");
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function toggleTag(tagId: string) {
    const next = selectedTags.includes(tagId)
      ? selectedTags.filter((id) => id !== tagId)
      : [...selectedTags, tagId];
    setSelectedTags(next);
    if (!(await patch({ tagIds: next }))) setSelectedTags(selectedTags);
  }

  async function createTag() {
    const name = newTagName.trim();
    if (!name) return;

    setError("");
    const response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: newTagColor }),
    });
    if (!response.ok) {
      setError(response.status === 409 ? "Essa etiqueta já existe." : "Não foi possível criar a etiqueta.");
      return;
    }

    const payload = (await response.json()) as { tag: Tag };
    const next = [...selectedTags, payload.tag.id];
    setSelectedTags(next);
    setNewTagName("");
    await patch({ tagIds: next });
  }

  return (
    <div className="ticketControls">
      <div className="controlRow">
        <label>
          Status
          <select
            defaultValue={status}
            disabled={isPending}
            onChange={(event) => patch({ status: event.target.value })}
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Prioridade
          <select
            defaultValue={priority}
            disabled={isPending}
            onChange={(event) => patch({ priority: event.target.value })}
          >
            {PRIORITY_OPTIONS.map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="categoryControl">
        Categoria
        <span>
          <input
            value={categoryValue}
            maxLength={80}
            placeholder="Ex.: Entrega"
            onChange={(event) => setCategoryValue(event.target.value)}
          />
          <button type="button" disabled={isPending} onClick={() => patch({ category: categoryValue })}>
            Salvar
          </button>
        </span>
      </label>

      <h4>Etiquetas</h4>
      <div className="tagPicker">
        {tags.map((tag) => (
          <button
            type="button"
            key={tag.id}
            disabled={isPending}
            className={selectedTags.includes(tag.id) ? "tagChoice selectedTag" : "tagChoice"}
            style={{ "--tag-color": tag.color } as React.CSSProperties}
            onClick={() => toggleTag(tag.id)}
          >
            {tag.name}
          </button>
        ))}
      </div>

      {canCreateTags ? (
        <div className="newTag">
          <input
            value={newTagName}
            maxLength={40}
            placeholder="Nova etiqueta"
            onChange={(event) => setNewTagName(event.target.value)}
          />
          <input
            type="color"
            aria-label="Cor da etiqueta"
            value={newTagColor}
            onChange={(event) => setNewTagColor(event.target.value)}
          />
          <button type="button" disabled={isPending || !newTagName.trim()} onClick={createTag}>
            Criar
          </button>
        </div>
      ) : null}

      {error ? <p className="ticketError">{error}</p> : null}
    </div>
  );
}
