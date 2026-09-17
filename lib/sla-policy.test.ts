import assert from "node:assert/strict";
import test from "node:test";
import { calculateSlaDueAt, slaState } from "./sla-policy";

test("calculates the SLA deadline from the configured minutes", () => {
  const start = new Date("2026-09-17T12:00:00.000Z");
  assert.equal(calculateSlaDueAt(start, 30).toISOString(), "2026-09-17T12:30:00.000Z");
});

test("classifies on-track, warning and overdue deadlines", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  assert.equal(slaState(new Date("2026-09-17T13:00:00.000Z"), now, 15), "ON_TRACK");
  assert.equal(slaState(new Date("2026-09-17T12:10:00.000Z"), now, 15), "WARNING");
  assert.equal(slaState(new Date("2026-09-17T11:59:00.000Z"), now, 15), "OVERDUE");
});
