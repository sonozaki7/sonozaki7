import test from "node:test";
import assert from "node:assert/strict";
import { computeStats, renderLifetimeSvg, renderSvg } from "../scripts/generate-progress.mjs";

const days = Array.from({ length: 70 }, (_, index) => {
  const date = new Date("2026-08-12T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - 69 + index);
  return { date: date.toISOString().slice(0, 10), count: index >= 67 ? 4 : index % 3 === 0 ? 2 : 0 };
});

test("computes rolling totals, streaks, and code metrics", () => {
  const stats = computeStats({
    calendarDays: days,
    today: "2026-08-12",
    code: { additions: 1200, deletions: 300, commits: 10 },
    recent: { pullRequests: 3, issues: 2, reviews: 1 },
  });
  assert.equal(stats.contributions.today, 4);
  assert.equal(stats.contributions.currentStreak, 4);
  assert.equal(stats.code.changed, 1500);
  assert.equal(stats.code.net, 900);
  assert.equal(stats.code.averageChangedPerCommit, 150);
  assert.equal(stats.collaboration.pullRequests, 3);
});

test("renders a responsive, privacy-safe SVG", () => {
  const stats = computeStats({
    calendarDays: days,
    today: "2026-08-12",
    code: { additions: 1200, deletions: 300, commits: 10 },
    recent: { pullRequests: 3, issues: 2, reviews: 1 },
  });
  const svg = renderSvg(stats);
  assert.match(svg, /viewBox="0 0 1200 680"/);
  assert.match(svg, /30-day build velocity/);
  assert.match(svg, /Aggregate public \+ private activity/);
  assert.doesNotMatch(svg, /private-repo|commit message|source code here/);
});

test("renders every lifetime metric as a separate trend", () => {
  const history = {
    accountCreatedAt: "2018-05-01T00:00:00Z",
    yearly: [2018, 2019, 2020].map((year, index) => ({
      year,
      contributions: 100 + index * 20,
      activeDays: 30 + index * 5,
      additions: 1000 + index * 100,
      deletions: 300 + index * 50,
      net: 700 + index * 50,
      commits: 40 + index * 10,
      pullRequests: 3 + index,
      issues: 2 + index,
      reviews: 1 + index,
    })),
  };
  const svg = renderLifetimeSvg(history);
  for (const label of ["CONTRIBUTIONS", "ACTIVE DAYS", "LINES ADDED", "LINES REMOVED", "NET LINES", "COMMITS ANALYZED", "PULL REQUESTS", "ISSUES", "REVIEWS"]) {
    assert.match(svg, new RegExp(label));
  }
  assert.match(svg, /2018 → 2020/);
});
