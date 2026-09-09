import assert from "node:assert/strict";
import test from "node:test";
import { canEditCustomers, canViewCustomers } from "./customer-policy";

test("allows every active operational role to view customers", () => {
  for (const role of ["OWNER", "ADMIN", "SUPERVISOR", "AGENT", "ANALYST"]) {
    assert.equal(canViewCustomers(role), true);
  }
  assert.equal(canViewCustomers("UNKNOWN"), false);
});

test("keeps analysts in read-only mode", () => {
  assert.equal(canEditCustomers("OWNER"), true);
  assert.equal(canEditCustomers("AGENT"), true);
  assert.equal(canEditCustomers("ANALYST"), false);
});
