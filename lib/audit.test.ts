import assert from "node:assert/strict";
import test from "node:test";
import { canViewAudit, parseAuditDate, summarizeAuditMetadata } from "./audit";

test("restricts audit access to operational management", () => {
  assert.equal(canViewAudit("OWNER"), true);
  assert.equal(canViewAudit("ADMIN"), true);
  assert.equal(canViewAudit("SUPERVISOR"), true);
  assert.equal(canViewAudit("AGENT"), false);
  assert.equal(canViewAudit("ANALYST"), false);
});

test("parses audit dates in the operational timezone", () => {
  assert.equal(parseAuditDate("2026-09-18")?.toISOString(), "2026-09-18T03:00:00.000Z");
  assert.equal(parseAuditDate("2026-09-18", true)?.toISOString(), "2026-09-19T02:59:59.999Z");
  assert.equal(parseAuditDate("invalid"), undefined);
});

test("summarizes metadata without exposing secrets", () => {
  const summary = summarizeAuditMetadata({ method: "password", token: "hidden", rows: 12 });
  assert.match(summary, /method: password/);
  assert.match(summary, /rows: 12/);
  assert.doesNotMatch(summary, /hidden|token/);
});
