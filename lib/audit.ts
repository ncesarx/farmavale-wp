export const AUDIT_ROLES = ["OWNER", "ADMIN", "SUPERVISOR"] as const;

export function canViewAudit(role: string) {
  return AUDIT_ROLES.includes(role as (typeof AUDIT_ROLES)[number]);
}

export function parseAuditDate(value: string | undefined, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}-03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function summarizeAuditMetadata(value: unknown, maxLength = 160) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  const safe = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(password|secret|token|authorization|cookie)/i.test(key))
    .map(([key, item]) => `${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`)
    .join(" · ");
  if (!safe) return "—";
  return safe.length > maxLength ? `${safe.slice(0, maxLength - 1)}…` : safe;
}

export function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    USER_LOGIN: "Login realizado",
    USER_LOGOUT: "Logout realizado",
    USER_CREATED: "Usuário criado",
    USER_UPDATED: "Usuário atualizado",
    API_KEY_CREATED: "Chave de API criada",
    API_KEY_REVOKED: "Chave de API revogada",
    WEBHOOK_CREATED: "Webhook criado",
    WEBHOOK_DISABLED: "Webhook desativado",
    QUICK_REPLY_CREATED: "Resposta rápida criada",
    QUICK_REPLY_UPDATED: "Resposta rápida atualizada",
    QUICK_REPLY_DISABLED: "Resposta rápida desativada",
    MONTHLY_REPORT_EXPORTED: "Relatório exportado",
  };
  return labels[action] ?? action.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
