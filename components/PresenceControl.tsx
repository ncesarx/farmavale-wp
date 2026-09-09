"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const OPTIONS = [
  ["AVAILABLE", "Disponível"],
  ["BUSY", "Ocupado"],
  ["AWAY", "Ausente"],
  ["OFFLINE", "Offline"],
] as const;

type AgentStatus = (typeof OPTIONS)[number][0];

export function PresenceControl({ initialStatus }: { initialStatus: AgentStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function updateStatus(nextStatus: AgentStatus) {
    const previous = status;
    setStatus(nextStatus);
    setError("");

    const response = await fetch("/api/agents/me/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!response.ok) {
      setStatus(previous);
      setError("Não foi possível alterar seu status.");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="presenceWrap">
      <label className={`presence presence-${status.toLowerCase()}`}>
        <i />
        <select
          aria-label="Status do atendente"
          value={status}
          disabled={isPending}
          onChange={(event) => updateStatus(event.target.value as AgentStatus)}
        >
          {OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      {error ? <small className="presenceError">{error}</small> : null}
    </div>
  );
}
