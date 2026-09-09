import assert from "node:assert/strict";
import test from "node:test";
import { extractBearerToken, generateApiToken, hashApiToken, normalizeCrmPhone } from "./api-credentials";

test("generates opaque API tokens and stores only their hash", () => {
  const first = generateApiToken();
  const second = generateApiToken();
  assert.match(first.token, /^fv_live_[A-Za-z0-9_-]+$/);
  assert.equal(first.tokenHash, hashApiToken(first.token));
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash.includes(first.token), false);
});

test("accepts only Farmavale bearer tokens", () => {
  const { token } = generateApiToken();
  assert.equal(extractBearerToken(`Bearer ${token}`), token);
  assert.equal(extractBearerToken("Basic abc"), null);
  assert.equal(extractBearerToken(null), null);
});

test("normalizes valid CRM phone numbers", () => {
  assert.equal(normalizeCrmPhone("+55 (12) 99999-1234"), "5512999991234");
  assert.equal(normalizeCrmPhone("123"), null);
});
