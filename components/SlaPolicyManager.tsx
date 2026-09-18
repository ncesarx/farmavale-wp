"use client";

import { useState } from "react";

type Policy = {
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  responseMinutes: number;
  warningMinutes: number;
  escalateAfterMinutes: number;
  notifySupervisors: boolean;
  isActive: boolean;
};

const LABEL = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente" };

export function SlaPolicyManager({ initialPolicies }: { initialPolicies: Policy[] }) {
  const [policies, setPolicies] = useState(initialPolicies);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  function change(priority: Policy["priority"], field: keyof Policy, value: number | boolean) {
    setPolicies((current) => current.map((policy) => policy.priority === priority ? { ...policy, [field]: value } : policy));
  }

  async function save(policy: Policy) {
    setSaving(policy.priority); setFeedback("");
    const response = await fetch("/api/operations/sla", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policy),
    });
    setSaving(null);
    setFeedback(response.ok ? `Política ${LABEL[policy.priority]} salva.` : "Não foi possível salvar. Revise os prazos.");
  }

  return <div className="slaPolicyGrid">
    {policies.map((policy) => <article key={policy.priority} className={`slaPolicy sla-${policy.priority.toLowerCase()}`}>
      <header><div><small>PRIORIDADE</small><h2>{LABEL[policy.priority]}</h2></div><label><input type="checkbox" checked={policy.isActive} onChange={(event) => change(policy.priority, "isActive", event.target.checked)} /> Ativa</label></header>
      <label>Prazo para resposta<input type="number" min="1" value={policy.responseMinutes} onChange={(event) => change(policy.priority, "responseMinutes", Number(event.target.value))} /><span>minutos</span></label>
      <label>Aviso antecipado<input type="number" min="1" value={policy.warningMinutes} onChange={(event) => change(policy.priority, "warningMinutes", Number(event.target.value))} /><span>minutos antes</span></label>
      <label>Escalonar após vencer<input type="number" min="0" value={policy.escalateAfterMinutes} onChange={(event) => change(policy.priority, "escalateAfterMinutes", Number(event.target.value))} /><span>minutos</span></label>
      <label className="slaCheck"><input type="checkbox" checked={policy.notifySupervisors} onChange={(event) => change(policy.priority, "notifySupervisors", event.target.checked)} /> Notificar supervisores</label>
      <button type="button" disabled={saving === policy.priority} onClick={() => save(policy)}>{saving === policy.priority ? "Salvando…" : "Salvar política"}</button>
    </article>)}
    {feedback ? <p className="slaFeedback">{feedback}</p> : null}
  </div>;
}
