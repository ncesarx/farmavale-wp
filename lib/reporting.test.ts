import assert from "node:assert/strict";
import test from "node:test";
import {
  canViewReports,
  parseReportMonth,
  sanitizeCsvCell,
  toCsv,
} from "./reporting";

test("parses valid months and falls back safely", () => {
  assert.equal(parseReportMonth("2026-09").month, "2026-09");
  assert.equal(
    parseReportMonth("invalid", new Date("2026-08-10T12:00:00Z")).month,
    "2026-08",
  );
  assert.equal(parseReportMonth("2026-09").start.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.equal(parseReportMonth("2026-09").end.toISOString(), "2026-10-01T03:00:00.000Z");
});

test("restricts reports to management and analyst roles", () => {
  assert.equal(canViewReports("OWNER"), true);
  assert.equal(canViewReports("ANALYST"), true);
  assert.equal(canViewReports("AGENT"), false);
});

test("escapes delimiters, quotes and spreadsheet formulas", () => {
  assert.equal(sanitizeCsvCell('A;"B"'), '"A;""B"""');
  assert.equal(sanitizeCsvCell("=2+2"), "\"'=2+2\"");
  assert.equal(sanitizeCsvCell("  @SUM(A1)"), "\"'  @SUM(A1)\"");
  const csv = toCsv(["Nome"], [["Farmavale"]]);
  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.match(csv, /"Nome"\r\n"Farmavale"/);
});
