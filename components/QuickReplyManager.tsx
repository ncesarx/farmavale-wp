"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Reply = { id: string; title: string; shortcut: string; body: string; category: string | null; usageCount: number };

export function QuickReplyManager({ replies }: { replies: Reply[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(""); const [shortcut, setShortcut] = useState("");
  const [category, setCategory] = useState(""); const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState(""); const [saving, setSaving] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setFeedback("");
    const response = await fetch("/api/quick-replies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, shortcut, category, body }) });
    setSaving(false);
    if (!response.ok) { setFeedback(response.status === 409 ? "Esse atalho já está em uso." : "Não foi possível criar a resposta."); return; }
    setTitle(""); setShortcut(""); setCategory(""); setBody(""); setFeedback("Resposta rápida criada."); router.refresh();
  }
  async function disable(id: string) {
    const response = await fetch(`/api/quick-replies/${id}`, { method: "DELETE" });
    if (response.ok) router.refresh(); else setFeedback("Não foi possível desativar a resposta.");
  }

  return <div className="quickReplyManager">
    <form className="quickReplyForm" onSubmit={create}>
      <div><label>Nome<input required minLength={2} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Pedido recebido" /></label><label>Atalho<input required value={shortcut} onChange={(event) => setShortcut(event.target.value)} placeholder="/pedido" /></label><label>Categoria<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Pedidos" /></label></div>
      <label>Mensagem<textarea required maxLength={4096} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Olá {{cliente}}, recebemos sua solicitação. Protocolo: {{protocolo}}." /></label>
      <small>Variáveis disponíveis: {"{{cliente}}"}, {"{{atendente}}"} e {"{{protocolo}}"}.</small>
      <button disabled={saving} type="submit">{saving ? "Criando…" : "Criar resposta"}</button>{feedback ? <em>{feedback}</em> : null}
    </form>
    <section className="quickReplyList">
      {replies.map((reply) => <article key={reply.id}><header><div><strong>{reply.title}</strong><code>{reply.shortcut}</code></div><button type="button" onClick={() => disable(reply.id)}>Desativar</button></header><p>{reply.body}</p><footer><span>{reply.category ?? "Sem categoria"}</span><small>{reply.usageCount} usos</small></footer></article>)}
      {!replies.length ? <p className="emptyIntegration">Nenhuma resposta rápida cadastrada.</p> : null}
    </section>
  </div>;
}
