import assert from "node:assert/strict";
import test from "node:test";
import {
  canAssignRole,
  canManageTarget,
  canManageTeam,
} from "./team-policy";

test("only owners and admins manage the team", () => {
  assert.equal(canManageTeam("OWNER"), true);
  assert.equal(canManageTeam("ADMIN"), true);
  assert.equal(canManageTeam("SUPERVISOR"), false);
  assert.equal(canManageTeam("AGENT"), false);
});

test("admins cannot manage owners or assign the owner role", () => {
  assert.equal(
    canManageTarget("ADMIN", "admin", { id: "owner", role: "OWNER" }),
    false,
  );
  assert.equal(canAssignRole("ADMIN", "OWNER"), false);
  assert.equal(canAssignRole("ADMIN", "AGENT"), true);
});

test("an owner can manage other users and assign roles", () => {
  assert.equal(
    canManageTarget("OWNER", "owner", { id: "agent", role: "AGENT" }),
    true,
  );
  assert.equal(canAssignRole("OWNER", "ADMIN"), true);
});
