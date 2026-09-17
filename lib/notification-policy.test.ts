import assert from "node:assert/strict";
import test from "node:test";
import { isNotificationEnabled } from "./notification-policy";

const all = { newMessages: true, assignments: true, slaWarnings: true };

test("maps each operational notification to its preference", () => {
  assert.equal(isNotificationEnabled("NEW_MESSAGE", { ...all, newMessages: false }), false);
  assert.equal(isNotificationEnabled("ASSIGNMENT", { ...all, assignments: false }), false);
  assert.equal(isNotificationEnabled("SLA_WARNING", { ...all, slaWarnings: false }), false);
});

test("always allows system notifications", () => {
  assert.equal(isNotificationEnabled("SYSTEM", { newMessages: false, assignments: false, slaWarnings: false }), true);
});
