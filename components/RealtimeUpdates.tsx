"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RealtimeEvent = {
  id: string;
  type:
    | "inbox.changed"
    | "message.received"
    | "conversation.assigned"
    | "conversation.updated";
  occurredAt: string;
};

export function RealtimeUpdates() {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () =>
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "unsupported",
  );

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RealtimeEvent;

      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 250);

      if (
        event.type === "message.received" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("Novo atendimento Farmavale", {
          body: "Uma nova mensagem chegou à Central.",
          tag: event.id,
        });
      }
    };

    return () => {
      source.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [router]);

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  return (
    <div className="realtimeStatus">
      <span className={connected ? "streamOnline" : "streamOffline"}>
        <i /> {connected ? "Tempo real ativo" : "Reconectando"}
      </span>
      {permission === "default" ? (
        <button type="button" onClick={enableNotifications}>
          Ativar notificações
        </button>
      ) : null}
      {permission === "granted" ? <small>Notificações ativas</small> : null}
      {permission === "denied" ? <small>Notificações bloqueadas</small> : null}
    </div>
  );
}
