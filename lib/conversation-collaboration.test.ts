import assert from "node:assert/strict";
import test from "node:test";
import {
  canCollaborateOnConversation,
  isEligibleTransferTarget,
} from "./conversation-collaboration";

test("leadership can collaborate on any conversation", () => {
  assert.equal(canCollaborateOnConversation("SUPERVISOR", "u1", "u2"), true);
});

test("agents collaborate only on their assigned conversations", () => {
  assert.equal(canCollaborateOnConversation("AGENT", "u1", "u1"), true);
  assert.equal(canCollaborateOnConversation("AGENT", "u1", "u2"), false);
  assert.equal(canCollaborateOnConversation("ANALYST", "u1", "u1"), false);
});

test("transfer targets must be active operational users with capacity", () => {
  assert.equal(isEligibleTransferTarget({ role: "AGENT", status: "ACTIVE", maxOpenConversations: 5, openConversations: 4 }), true);
  assert.equal(isEligibleTransferTarget({ role: "ANALYST", status: "ACTIVE", maxOpenConversations: 5, openConversations: 0 }), false);
  assert.equal(isEligibleTransferTarget({ role: "AGENT", status: "SUSPENDED", maxOpenConversations: 5, openConversations: 0 }), false);
  assert.equal(isEligibleTransferTarget({ role: "AGENT", status: "ACTIVE", maxOpenConversations: 5, openConversations: 5 }), false);
});
