import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";

function keyFromSecret(masterSecret: string) {
  return createHash("sha256").update(`farmavale:webhooks:${masterSecret}`).digest();
}

export function encryptWebhookSecret(secret: string, masterSecret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(masterSecret), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptWebhookSecret(value: string, masterSecret: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("invalid_encrypted_secret");
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(masterSecret), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export function isPrivateAddress(address: string) {
  const normalized = address.replace(/^::ffff:/, "");
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export function parseSafeWebhookUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || (isIP(hostname) && isPrivateAddress(hostname))) return null;
  return url;
}
