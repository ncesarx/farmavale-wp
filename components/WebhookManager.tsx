"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Endpoint = {
  id: string;
  name: string;
  url: string;
  events: string[];
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  deliveries: Array<{
    id: string;
    eventType: string;
    status: string;
    attempts: number;
    responseCode: number | null;
    lastError: string | null;
    createdAt: string;
  }>;
};

export function WebhookManager({ endpoints }: { endpoints: Endpoint[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState(["contact.updated", "conversation.updated"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  function toggleEvent(event: string) {
    setEvents((current) => current.includes(event) ? current.filter((item) => item !== event) : [...current, event]);
  }

  async function createEndpoint(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    const response = await fetch("/api/integrations/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, events }),
    });
    const body = await response.json();
    if (!response.ok) { setState("error"); return; }
    setSecret(body.secret);
    setName("");
    setUrl("");
    setState("idle");
    router.refresh();
  }

  async function disable(id: string) {
    if (!window.confirm("Desativar este webhook?")) return;
    const response = await fetch(`/api/integrations/webhooks/${id}`, { method: "DELETE" });
    if (!response.ok) { setState("error"); return; }
    router.refresh();
  }

  async function retry(id: string) {
    const response = await fetch(`/api/integrations/webhook-deliveries/${id}/retry`, { method: "POST" });
    if (!response.ok) { setState("error"); return; }
    setTimeout(() => router.refresh(), 1200);
  }

  return (
    <section className="integrationCard webhookManager">
      <div className="integrationTitle"><div><small>SINCRONIZAÇÃO DE SAÍDA</small><h2>Webhooks para CRM</h2></div><span>{endpoints.length} ativos</span></div>
      <p>Eventos JSON assinados com HMAC-SHA256, três tentativas automáticas e rastreamento de cada entrega.</p>
      <form className="webhookForm" onSubmit={createEndpoint}>
        <input required minLength={3} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: CRM Comercial" />
        <input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://crm.exemplo.com/webhooks/farmavale" />
        <div>{["contact.updated", "conversation.updated"].map((item) => <label key={item}><input checked={events.includes(item)} onChange={() => toggleEvent(item)} type="checkbox" />{item}</label>)}</div>
        <button disabled={state === "saving" || !events.length} type="submit">{state === "saving" ? "Criando…" : "Criar webhook"}</button>
      </form>
      {secret ? <div className="revealedToken"><strong>Copie o segredo de assinatura agora. Ele não será exibido novamente.</strong><code>{secret}</code><button type="button" onClick={() => navigator.clipboard.writeText(secret)}>Copiar</button></div> : null}
      {state === "error" ? <small className="integrationError">A operação falhou. Confirme a URL pública HTTPS e tente novamente.</small> : null}
      <div className="webhookList">
        {endpoints.map((endpoint) => <article key={endpoint.id}>
          <header><div><strong>{endpoint.name}</strong><code>{endpoint.url}</code><small>{endpoint.events.join(" · ")}</small></div><button type="button" onClick={() => disable(endpoint.id)}>Desativar</button></header>
          <div className="deliveryList">
            {endpoint.deliveries.map((delivery) => <div key={delivery.id}><span className={`delivery-${delivery.status.toLowerCase()}`}>{delivery.status}</span><span>{delivery.eventType}</span><span>{delivery.createdAt}</span><span>{delivery.responseCode ? `HTTP ${delivery.responseCode}` : delivery.lastError ?? "Pendente"} · {delivery.attempts} tentativa(s)</span>{delivery.status === "FAILED" ? <button type="button" onClick={() => retry(delivery.id)}>Reenviar</button> : null}</div>)}
            {!endpoint.deliveries.length ? <small>Nenhum evento entregue ainda.</small> : null}
          </div>
        </article>)}
        {!endpoints.length ? <div className="emptyIntegration">Nenhum webhook ativo.</div> : null}
      </div>
    </section>
  );
}
