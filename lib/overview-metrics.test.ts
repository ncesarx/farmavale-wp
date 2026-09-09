import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyVolume,
  calculateOverviewMetrics,
  formatDuration,
} from "./overview-metrics";

test("calculates SLA, response and resolution metrics", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  const result = calculateOverviewMetrics(
    [
      {
        createdAt: new Date("2026-09-09T10:00:00.000Z"),
        firstResponseAt: new Date("2026-09-09T10:03:00.000Z"),
        resolvedAt: new Date("2026-09-09T10:30:00.000Z"),
      },
      {
        createdAt: new Date("2026-09-09T11:00:00.000Z"),
        firstResponseAt: new Date("2026-09-09T11:08:00.000Z"),
        resolvedAt: null,
      },
      {
        createdAt: new Date("2026-09-09T11:30:00.000Z"),
        firstResponseAt: null,
        resolvedAt: null,
      },
    ],
    now,
  );

  assert.equal(result.total, 3);
  assert.equal(result.resolved, 1);
  assert.equal(result.averageResponseSeconds, 330);
  assert.equal(result.averageResolutionMinutes, 30);
  assert.equal(Math.round(result.slaRate), 33);
  assert.equal(result.slaBreaches, 2);
});

test("builds a zero-filled daily series", () => {
  const series = buildDailyVolume(
    [{ createdAt: new Date("2026-09-09T08:00:00.000Z") }],
    3,
    new Date("2026-09-09T12:00:00.000Z"),
  );
  assert.deepEqual(series.map((item) => item.count), [0, 0, 1]);
});

test("formats operational durations", () => {
  assert.equal(formatDuration(null), "Sem dados");
  assert.equal(formatDuration(42), "42s");
  assert.equal(formatDuration(185), "3m 5s");
  assert.equal(formatDuration(7_500), "2h 5m");
});
