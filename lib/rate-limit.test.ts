import assert from "node:assert/strict";
import test from "node:test";
import { consumeRateLimit, getClientIp, resetRateLimit } from "./rate-limit";

test("blocks requests after the configured limit", () => {
  const key = "test:limit";
  resetRateLimit(key);
  assert.equal(consumeRateLimit(key, 2, 60_000, 1_000).allowed, true);
  assert.equal(consumeRateLimit(key, 2, 60_000, 1_001).allowed, true);
  const blocked = consumeRateLimit(key, 2, 60_000, 1_002);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
  resetRateLimit(key);
});

test("opens a fresh window after expiration", () => {
  const key = "test:window";
  resetRateLimit(key);
  consumeRateLimit(key, 1, 1_000, 2_000);
  assert.equal(consumeRateLimit(key, 1, 1_000, 3_000).allowed, true);
  resetRateLimit(key);
});

test("extracts and sanitizes the proxy client address", () => {
  assert.equal(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.4, 127.0.0.1" })), "203.0.113.4");
  assert.equal(getClientIp(new Headers({ "x-real-ip": "2001:db8::1" })), "2001:db8::1");
  assert.equal(getClientIp(new Headers()), "unknown");
});
