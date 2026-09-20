import assert from "node:assert/strict";
import test from "node:test";
import { canManageAutomations, messageMatchesKeyword, normalizeKeyword } from "./automation-rules";

test("normalizes operational keywords", () => assert.equal(normalizeKeyword("  Segunda   VIA "), "segunda via"));
test("matches keywords without case sensitivity", () => assert.equal(messageMatchesKeyword("Preciso de uma SEGUNDA VIA hoje", "segunda via"), true));
test("does not match absent or empty message bodies", () => assert.equal(messageMatchesKeyword(null, "boleto"), false));
test("restricts automation management to operational leadership", () => {
  assert.equal(canManageAutomations("OWNER"), true);
  assert.equal(canManageAutomations("SUPERVISOR"), true);
  assert.equal(canManageAutomations("AGENT"), false);
});
