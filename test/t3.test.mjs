import test from "node:test";
import assert from "node:assert/strict";
import { buildT3Data, renderMobileT3Svg, renderT3Svg } from "../scripts/generate-progress.mjs";
import { mergeLedger, summarizeEvents, summarizeLedger } from "../scripts/collect-t3.mjs";

const ledger = {
  version: 1,
  source: "T3 Code",
  timezone: "Asia/Bangkok",
  generatedAt: "2026-11-03",
  firstRecordedAt: "2026-10-27",
  lastRecordedAt: "2026-11-03",
  privacy: "aggregate counts only",
  days: {
    "2026-10-27": { tasks: 3, runs: 0, providers: { codex: 3 }, runProviders: {}, hours: hours({ 11: 2, 12: 1 }) },
    "2026-11-01": { tasks: 4, runs: 42, providers: { codex: 2, opencode: 2 }, runProviders: { codex: 15, opencode: 27 }, hours: hours({ 15: 2, 21: 1, 22: 1 }) },
    "2026-11-02": { tasks: 0, runs: 8, providers: {}, runProviders: { opencode: 8 }, hours: hours({}) },
    "2026-11-03": { tasks: 2, runs: 11, providers: { opencode: 2 }, runProviders: { codex: 1, opencode: 10 }, hours: hours({ 14: 1, 15: 1 }) },
  },
};

function hours(source) {
  return Array.from({ length: 24 }, (_, hour) => source[hour] || 0);
}

test("aggregates settled tasks into day, week, month, streak, and hour buckets", () => {
  const data = buildT3Data({ ledger, today: "2026-11-03" });
  assert.equal(data.connected, true);
  assert.equal(data.daily.length, 14);
  assert.equal(data.weekly.length, 12);
  assert.equal(data.monthly.length, 12);
  assert.equal(data.summary.todayTasks, 2);
  assert.equal(data.summary.last7Tasks, 6);
  assert.equal(data.summary.last30Tasks, 9);
  assert.equal(data.summary.lifetimeTasks, 9);
  assert.equal(data.summary.lifetimeRuns, 61);
  assert.equal(data.summary.last30Runs, 61);
  assert.equal(data.summary.activeDays, 3);
  assert.equal(data.summary.activeDays30, 3);
  assert.equal(data.summary.currentStreak, 1);
  assert.equal(data.summary.bestDay.tasks, 4);
  assert.equal(data.summary.averagePerActiveDay30, 3);
  assert.deepEqual(data.summary.providers, [{ name: "codex", count: 5 }, { name: "opencode", count: 4 }]);
  assert.equal(data.summary.hourTotals[15], 3);
  assert.equal(data.summary.hourTotals[14], 1);
  assert.equal(data.monthly.at(-1).tasks, 6);
  const currentWeek = data.weekly.at(-1);
  assert.equal(currentWeek.tasks, 2);
  assert.equal(currentWeek.start, "2026-11-02");
});

test("renders a privacy-safe finished-task card for desktop and mobile", () => {
  const data = buildT3Data({ ledger, today: "2026-11-03" });
  const desktop = renderT3Svg(data);
  const mobile = renderMobileT3Svg(data);
  for (const label of ["TASK THROUGHPUT · T3 CODE", "DAILY · LAST 14 DAYS", "WEEKLY · LAST 12 WEEKS", "MONTHLY · LAST 12 MONTHS", "BY HOUR · WHEN TASKS LAND"]) {
    assert.match(desktop, new RegExp(label.replace(/[·]/g, "·")));
  }
  assert.match(desktop, /Finished work, counted/);
  assert.match(desktop, /viewBox="0 0 1200 860"/);
  assert.match(desktop, /Provider split · Codex 5 · OpenCode 4/);
  assert.match(desktop, /Tracking since 2026-10-27/);
  assert.match(mobile, /viewBox="0 0 375 930"/);
  assert.match(mobile, /Finished work/);
  assert.doesNotMatch(`${desktop}${mobile}`, /secret task title|private-repo|prompt text/);
  assert.doesNotMatch(JSON.stringify(data), /title|prompt|repository|branch|path"/i);
});

test("renders a calm empty state before the first settled task", () => {
  const data = buildT3Data({ ledger: null, today: "2026-11-03" });
  assert.equal(data.connected, false);
  assert.equal(data.summary.todayTasks, 0);
  const desktop = renderT3Svg(data);
  assert.match(desktop, /Waiting for the first settled task/);
  assert.match(desktop, /The record starts with your next finished task/);
  assert.match(desktop, /No provider split recorded yet/);
});

test("keeps historical days when the live database no longer covers them", () => {
  const existing = { days: { "2026-10-01": { tasks: 5, runs: 1, providers: { codex: 5 }, runProviders: { codex: 1 }, hours: hours({ 9: 5 }) } } };
  const fresh = { "2026-11-03": { tasks: 1, runs: 2, providers: { opencode: 1 }, runProviders: { opencode: 2 }, hours: hours({ 12: 1 }) } };
  const merged = mergeLedger(existing, fresh, "2026-11-03");
  assert.deepEqual(Object.keys(merged.days), ["2026-10-01", "2026-11-03"]);
  assert.equal(merged.firstRecordedAt, "2026-10-01");
  assert.equal(merged.days["2026-10-01"].tasks, 5);
  assert.equal(merged.days["2026-11-03"].runs, 2);
  const summary = summarizeLedger(merged);
  assert.equal(summary.tasks, 6);
  assert.equal(summary.runs, 3);
  assert.equal(summary.activeDays, 2);
});

test("buckets raw completions into the local day and hour", () => {
  const days = summarizeEvents({
    tasks: [{ id: "a", provider: "codex", at: "2026-11-03T18:30:00.000Z" }],
    runs: [{ id: "b", provider: "opencode", at: "2026-11-03T20:05:00.000Z" }],
  });
  assert.equal(days["2026-11-04"].tasks, 1);
  assert.equal(days["2026-11-04"].runs, 1);
  assert.equal(days["2026-11-04"].hours[1], 1);
  assert.equal(days["2026-11-04"].providers.codex, 1);
  assert.equal(days["2026-11-04"].runProviders.opencode, 1);
});
