export function normalizeShortcut(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^\/+/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized ? `/${normalized}` : "";
}

export function applyReplyVariables(body: string, values: { customerName?: string; agentName?: string; protocol?: string }) {
  return body
    .replaceAll("{{cliente}}", values.customerName ?? "cliente")
    .replaceAll("{{atendente}}", values.agentName ?? "atendente")
    .replaceAll("{{protocolo}}", values.protocol ?? "protocolo");
}
