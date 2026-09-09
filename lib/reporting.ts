export const REPORTING_ROLES = ["OWNER", "ADMIN", "SUPERVISOR", "ANALYST"] as const;
export const REPORT_STATUSES = ["QUEUED", "OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;
export const REPORT_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export function canViewReports(role: string) {
  return REPORTING_ROLES.includes(role as (typeof REPORTING_ROLES)[number]);
}

export function parseReportMonth(value: string | undefined, now = new Date()) {
  const fallback = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? (value as string) : fallback;
  const [year, monthNumber] = month.split("-").map(Number);

  const start = new Date(Date.UTC(year, monthNumber - 1, 1, 3));
  const end = new Date(Date.UTC(year, monthNumber, 1, 3));
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(start.getTime() + 12 * 60 * 60 * 1000));

  return { month, start, end, label };
}

export function sanitizeCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  const lines = [
    headers.map(sanitizeCsvCell).join(";"),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(";")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
