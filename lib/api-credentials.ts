import { createHash, randomBytes } from "node:crypto";

export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiToken() {
  const secret = randomBytes(32).toString("base64url");
  const token = `fv_live_${secret}`;
  return { token, prefix: token.slice(0, 16), tokenHash: hashApiToken(token) };
}

export function extractBearerToken(value: string | null) {
  if (!value) return null;
  const match = /^Bearer\s+(fv_live_[A-Za-z0-9_-]{32,})$/i.exec(value.trim());
  return match?.[1] ?? null;
}

export function normalizeCrmPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}
