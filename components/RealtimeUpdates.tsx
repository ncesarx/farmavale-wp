"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RealtimeEvent = { id: string; type: string; occurredAt: string };
type Notice = { id: string; type: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string };
type Preferences = { newMessages: boolean; assignments: boolean; slaWarnings: boolean; pushEnabled: boolean };
type NotificationData = { notifications: Notice[]; unread: number; preference: Preferences; push: { configured: boolean; subscribed: boolean } };

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function RealtimeUpdates() {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationData | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    if (response.ok) setData(await response.json());
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RealtimeEvent;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 250);
      if (event.type === "notification.created") void load();
    };
    return () => { source.close(); if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [load, router]);

  async function enablePush() {
    setBusy(true); setFeedback("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Navegador sem suporte a Push.");
      if (await Notification.requestPermission() !== "granted") throw new Error("Permissão de notificações não concedida.");
      const keyResponse = await fetch("/api/push/public-key");
      if (!keyResponse.ok) throw new Error("Push ainda não foi configurado no servidor.");
      const { publicKey } = await keyResponse.json();
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error("Não foi possível registrar este navegador.");
      setFeedback("Push ativado neste navegador."); await load();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Falha ao ativar Push."); }
    finally { setBusy(false); }
  }

  async function readAll() { await fetch("/api/notifications/read-all", { method: "POST" }); await load(); }
  async function openNotice(notice: Notice) {
    if (!notice.readAt) await fetch(`/api/notifications/${notice.id}/read`, { method: "POST" });
    if (notice.href) router.push(notice.href); else await load();
  }
  async function updatePreference(key: keyof Preferences, checked: boolean) {
    if (!data) return;
    setData({ ...data, preference: { ...data.preference, [key]: checked } });
    const response = await fetch("/api/notifications/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: checked }) });
    if (!response.ok) await load();
  }

  return <div className="realtimeStatus">
    <span className={connected ? "streamOnline" : "streamOffline"}><i /> {connected ? "Tempo real ativo" : "Reconectando"}</span>
    <div className="notificationCenter">
      <button className="notificationBell" type="button" onClick={() => setOpen((value) => !value)} aria-label="Central de notificações">♢ {data?.unread ? <b>{data.unread > 99 ? "99+" : data.unread}</b> : null}</button>
      {open ? <div className="notificationPanel">
        <header><strong>Notificações</strong><button type="button" onClick={readAll}>Marcar lidas</button></header>
        <div className="notificationList">
          {data?.notifications.length ? data.notifications.map((notice) => <button className={notice.readAt ? "notice" : "notice unread"} type="button" key={notice.id} onClick={() => openNotice(notice)}><i /><span><strong>{notice.title}</strong><small>{notice.body}</small><time>{new Date(notice.createdAt).toLocaleString("pt-BR")}</time></span></button>) : <p>Nenhum alerta operacional.</p>}
        </div>
        <section className="notificationPreferences"><strong>Preferências</strong>
          {data ? ([ ["newMessages", "Novas mensagens"], ["assignments", "Atribuições"], ["slaWarnings", "Alertas de SLA"], ["pushEnabled", "Enviar Push"] ] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={data.preference[key]} onChange={(event) => updatePreference(key, event.target.checked)} /></label>) : null}
          {!data?.push.subscribed ? <button type="button" disabled={busy || !data?.push.configured} onClick={enablePush}>{busy ? "Ativando…" : data?.push.configured ? "Ativar neste navegador" : "Push aguardando configuração"}</button> : <small>Este navegador está inscrito para Push.</small>}
          {feedback ? <em>{feedback}</em> : null}
        </section>
      </div> : null}
    </div>
  </div>;
}
