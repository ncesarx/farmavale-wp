import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export type RealtimeEventType =
  | "inbox.changed"
  | "message.received"
  | "conversation.assigned"
  | "conversation.updated";

export type RealtimeEvent = {
  id: string;
  type: RealtimeEventType;
  organizationSlug: string;
  occurredAt: string;
};

const EVENT_NAME = "farmavale-realtime";
const globalForRealtime = globalThis as typeof globalThis & {
  farmavaleRealtimeEmitter?: EventEmitter;
};

const emitter =
  globalForRealtime.farmavaleRealtimeEmitter ??
  (() => {
    const instance = new EventEmitter();
    instance.setMaxListeners(0);
    globalForRealtime.farmavaleRealtimeEmitter = instance;
    return instance;
  })();

export function publishRealtimeEvent(
  event: Omit<RealtimeEvent, "id" | "occurredAt">,
) {
  const payload: RealtimeEvent = {
    ...event,
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
  };
  emitter.emit(EVENT_NAME, payload);
}

export function subscribeToRealtimeEvents(
  listener: (event: RealtimeEvent) => void,
) {
  emitter.on(EVENT_NAME, listener);
  return () => emitter.off(EVENT_NAME, listener);
}
