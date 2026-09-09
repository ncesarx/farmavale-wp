"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tag = { id: string; name: string; color: string };

export function CustomerProfileEditor({
  contact,
  tags,
  selectedTagIds,
  canEdit,
}: {
  contact: { id: string; name: string; email: string | null; externalCrmId: string | null };
  tags: Tag[];
  selectedTagIds: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [externalCrmId, setExternalCrmId] = useState(contact.externalCrmId ?? "");
  const [chosenTags, setChosenTags] = useState(selectedTagIds);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function toggleTag(id: string) {
    if (!canEdit) return;
    setChosenTags((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id],
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    const response = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, externalCrmId, tagIds: chosenTags }),
    });
    if (!response.ok) {
      setState("error");
      return;
    }
    setState("saved");
    router.refresh();
  }

  return (
    <form className="customerEditor" onSubmit={save}>
      <div className="customerFields">
        <label>Nome<input disabled={!canEdit} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>E-mail<input disabled={!canEdit} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Não informado" /></label>
        <label>ID externo do CRM<input disabled={!canEdit} value={externalCrmId} onChange={(event) => setExternalCrmId(event.target.value)} placeholder="Ainda não vinculado" /></label>
      </div>
      <div>
        <h4>Etiquetas do cliente</h4>
        <div className="customerTags">
          {tags.map((tag) => (
            <button
              className={chosenTags.includes(tag.id) ? "customerTag selectedCustomerTag" : "customerTag"}
              disabled={!canEdit}
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              style={{ "--customer-tag": tag.color } as React.CSSProperties}
              type="button"
            >
              {tag.name}
            </button>
          ))}
          {!tags.length ? <small>Nenhuma etiqueta cadastrada.</small> : null}
        </div>
      </div>
      {canEdit ? <button disabled={state === "saving"} type="submit">{state === "saving" ? "Salvando…" : "Salvar perfil"}</button> : null}
      {state === "saved" ? <small className="customerSaved">Perfil atualizado.</small> : null}
      {state === "error" ? <small className="customerError">Não foi possível salvar. Revise os dados.</small> : null}
      {!canEdit ? <small>Perfil disponível somente para consulta.</small> : null}
    </form>
  );
}
