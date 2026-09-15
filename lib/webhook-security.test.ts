import assert from "node:assert/strict";
import test from "node:test";
import { decryptWebhookSecret, encryptWebhookSecret, isPrivateAddress, parseSafeWebhookUrl } from "./webhook-security";

test("encrypts webhook secrets with authenticated encryption", () => {
  const encrypted = encryptWebhookSecret("segredo-farmavale", "master-secret-with-more-than-32-characters");
  assert.notEqual(encrypted.includes("segredo-farmavale"), true);
  assert.equal(decryptWebhookSecret(encrypted, "master-secret-with-more-than-32-characters"), "segredo-farmavale");
  assert.throws(() => decryptWebhookSecret(encrypted, "wrong-master-secret"));
});

test("accepts only public HTTPS webhook URLs", () => {
  assert.equal(parseSafeWebhookUrl("https://crm.example.com/webhooks")?.hostname, "crm.example.com");
  assert.equal(parseSafeWebhookUrl("http://crm.example.com/webhooks"), null);
  assert.equal(parseSafeWebhookUrl("https://user:pass@crm.example.com/webhooks"), null);
  assert.equal(parseSafeWebhookUrl("https://127.0.0.1/hook"), null);
  assert.equal(parseSafeWebhookUrl("https://192.168.1.10/hook"), null);
});

test("detects private and link-local network addresses", () => {
  assert.equal(isPrivateAddress("10.1.2.3"), true);
  assert.equal(isPrivateAddress("172.20.1.2"), true);
  assert.equal(isPrivateAddress("169.254.1.1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
});
