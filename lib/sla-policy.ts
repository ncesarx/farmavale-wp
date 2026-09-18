export type SlaPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export const DEFAULT_SLA_POLICIES = {
  LOW: { responseMinutes: 240, warningMinutes: 30, escalateAfterMinutes: 60 },
  NORMAL: { responseMinutes: 60, warningMinutes: 15, escalateAfterMinutes: 30 },
  HIGH: { responseMinutes: 30, warningMinutes: 10, escalateAfterMinutes: 15 },
  URGENT: { responseMinutes: 10, warningMinutes: 5, escalateAfterMinutes: 5 },
} satisfies Record<SlaPriority, { responseMinutes: number; warningMinutes: number; escalateAfterMinutes: number }>;

export function calculateSlaDueAt(reference: Date, responseMinutes: number) {
  return new Date(reference.getTime() + responseMinutes * 60_000);
}

export function slaState(dueAt: Date, now: Date, warningMinutes: number) {
  const remaining = dueAt.getTime() - now.getTime();
  if (remaining <= 0) return "OVERDUE" as const;
  if (remaining <= warningMinutes * 60_000) return "WARNING" as const;
  return "ON_TRACK" as const;
}
