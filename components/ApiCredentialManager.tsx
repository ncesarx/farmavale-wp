"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Credential = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export function ApiCredentialManager({ credentials }: { credentials: Credential[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function createCredential(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    const response = await fetch("/api/integrations/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        expiresInDays: expiresInDays ? Number(expiresInDays) : null,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setState("error");
      return;
    }
    setRevealedToken(body.token);
    setName("");
    setState("idle");
    router.refresh();
  }

  async function revoke(id: string) {
    if (!window.confirm("Revogar esta chave? A integração deixará de autenticar imediatamente.")) return;
    const response = await fetch(`/api/integrations/api-keys/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setState("error");
      return;
    }
    router.refresh();
  }

  return (
    <section className="integrationCard">
      <div className="integrationTitle"><div><small>ACESSO PROGRAMÁTICO</small><h2>Chaves da API</h2></div><span>{credentials.length} ativas</span></div>
      <p>As chaves dão acesso ao escopo <code>contacts:write</code>. O segredo completo aparece somente uma vez.</p>
      <form className="apiKeyForm" onSubmit={createCredential}>
        <input required minLength={3} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: CRM Comercial" />
        <select value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}>
          <option value="30">30 dias</option><option value="90">90 dias</option><option value="180">180 dias</option><option value="365">1 ano</option><option value="">Sem expiração</option>
        </select>
        <button disabled={state === "saving"} type="submit">{state === "saving" ? "Gerando…" : "Gerar chave"}</button>
      </form>
      {revealedToken ? <div className="revealedToken"><strong>Copie agora — esta chave não será exibida novamente.</strong><code>{revealedToken}</code><button type="button" onClick={() => navigator.clipboard.writeText(revealedToken)}>Copiar</button></div> : null}
      {state === "error" ? <small className="integrationError">Não foi possível concluir a operação.</small> : null}
      <div className="apiKeyList">
        {credentials.map((credential) => <article key={credential.id}><div><strong>{credential.name}</strong><code>{credential.prefix}••••••••</code></div><span>Último uso: {credential.lastUsedAt ?? "Nunca"}<small>Expira: {credential.expiresAt ?? "Não expira"}</small></span><button type="button" onClick={() => revoke(credential.id)}>Revogar</button></article>)}
        {!credentials.length ? <div className="emptyIntegration">Nenhuma chave ativa.</div> : null}
      </div>
    </section>
  );
}
