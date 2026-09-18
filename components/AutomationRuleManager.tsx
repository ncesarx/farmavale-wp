"use client";

import { FormEvent, useState } from "react";

type Rule = { id: string; name: string; keyword: string; priority: string | null; matchCount: number; lastMatchedAt: string | Date | null; tag: { name: string; color: string } | null; assignee: { name: string } | null };
type Option = { id: string; name: string };

export function AutomationRuleManager({ initialRules, tags, agents }: { initialRules: Rule[]; tags: (Option & { color: string })[]; agents: Option[] }) {
  const [rules, setRules] = useState(initialRules);
  const [feedback, setFeedback] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFeedback("");
    const form = new FormData(event.currentTarget);
    const payload = { name: form.get("name"), keyword: form.get("keyword"), priority: form.get("priority") || null, tagId: form.get("tagId") || null, assigneeId: form.get("assigneeId") || null };
    const response = await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) return setFeedback("Não foi possível criar a regra. Defina ao menos uma ação.");
    const data = await response.json(); setRules((current) => [...current, data.rule]); event.currentTarget.reset(); setFeedback("Regra criada e ativada.");
  }
  async function disable(id: string) {
    if (!(await fetch(`/api/automations/${id}`, { method: "DELETE" })).ok) return setFeedback("Não foi possível desativar a regra.");
    setRules((current) => current.filter((rule) => rule.id !== id)); setFeedback("Regra desativada.");
  }
  return <div className="automationManager"><form onSubmit={create} className="automationForm"><small>NOVA REGRA</small><h2>Quando a mensagem contiver...</h2><label>Nome da regra<input name="name" required minLength={3} placeholder="Ex.: Cliente solicita segunda via" /></label><label>Palavra ou expressão<input name="keyword" required minLength={2} placeholder="Ex.: segunda via" /></label><div><label>Prioridade<select name="priority"><option value="">Não alterar</option><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></label><label>Etiqueta<select name="tagId"><option value="">Não aplicar</option>{tags.map((tag) => <option value={tag.id} key={tag.id}>{tag.name}</option>)}</select></label><label>Encaminhar para<select name="assigneeId"><option value="">Distribuição automática</option>{agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></label></div><button type="submit">Criar automação</button>{feedback ? <em>{feedback}</em> : null}</form><section className="automationList"><header><div><small>REGRAS ATIVAS</small><h2>Fluxos em execução</h2></div><span>{rules.length} ativas</span></header>{rules.map((rule) => <article key={rule.id}><div><strong>{rule.name}</strong><code>Mensagem contém “{rule.keyword}”</code></div><ul>{rule.priority ? <li>Prioridade: {rule.priority}</li> : null}{rule.tag ? <li><i style={{ background: rule.tag.color }} /> Etiqueta: {rule.tag.name}</li> : null}{rule.assignee ? <li>Atendente: {rule.assignee.name}</li> : null}</ul><footer><span>{rule.matchCount} execuções</span><button onClick={() => disable(rule.id)}>Desativar</button></footer></article>)}{!rules.length ? <p className="emptyIntegration">Nenhuma automação ativa.</p> : null}</section></div>;
}
