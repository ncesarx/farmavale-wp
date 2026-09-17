import { createCipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";
import { importJWK, SignJWT } from "jose";
import { getEnv } from "@/lib/env";

type Subscription = { endpoint: string; p256dh: string; auth: string };
type PushPayload = { title: string; body: string; href?: string | null; notificationId: string; type: string };

export function getPushConfiguration() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = getEnv();
  return {
    configured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT),
    publicKey: VAPID_PUBLIC_KEY ?? null,
    privateKey: VAPID_PRIVATE_KEY ?? null,
    subject: VAPID_SUBJECT ?? null,
  };
}

function vapidJwk(publicKey: string, privateKey: string) {
  const pub = Buffer.from(publicKey, "base64url");
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("Invalid VAPID public key");
  return {
    kty: "EC",
    crv: "P-256",
    x: pub.subarray(1, 33).toString("base64url"),
    y: pub.subarray(33).toString("base64url"),
    d: Buffer.from(privateKey, "base64url").toString("base64url"),
  } as const;
}

function encrypt(payload: PushPayload, subscription: Subscription) {
  const receiverPublic = Buffer.from(subscription.p256dh, "base64url");
  const auth = Buffer.from(subscription.auth, "base64url");
  const server = createECDH("prime256v1");
  server.generateKeys();
  const serverPublic = server.getPublicKey();
  const shared = server.computeSecret(receiverPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), receiverPublic, serverPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, keyInfo, 32));
  const salt = randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payload)), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([serverPublic.length]), serverPublic, encrypted]);
}

export async function sendWebPush(subscription: Subscription, payload: PushPayload) {
  const config = getPushConfiguration();
  if (!config.configured || !config.publicKey || !config.privateKey || !config.subject) {
    return { ok: false, status: 0, reason: "not_configured" } as const;
  }
  const endpoint = new URL(subscription.endpoint);
  const key = await importJWK(vapidJwk(config.publicKey, config.privateKey), "ES256");
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setAudience(endpoint.origin).setSubject(config.subject)
    .setExpirationTime(Math.floor(Date.now() / 1000) + 12 * 60 * 60).sign(key);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${config.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "300",
    },
    body: encrypt(payload, subscription),
  });
  return { ok: response.ok, status: response.status, reason: response.ok ? null : "rejected" } as const;
}
