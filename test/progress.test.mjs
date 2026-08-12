import test from "node:test";
import assert from "node:assert/strict";
import { buildCadenceData, buildFocusData, buildOperatingReview, buildYearlyCadence, classifyCommitChange, computeStats, longestStreak, mergeFocusHistory, renderCadenceSvg, renderFocusSvg, renderLifetimeSvg, renderMobileCadenceSvg, renderMobileFocusSvg, renderMobileLifetimeSvg, renderMobileOperatingReviewSvg, renderMobileSvg, renderOperatingReviewSvg, renderSvg } from "../scripts/generate-progress.mjs";

const days = Array.from({ length: 70 }, (_, index) => {
  const date = new Date("2026-08-12T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - 69 + index);
  return { date: date.toISOString().slice(0, 10), count: index >= 67 ? 4 : index % 3 === 0 ? 2 : 0 };
});

test("computes rolling totals, streaks, and code metrics", () => {
  const stats = computeStats({
    calendarDays: days,
    today: "2026-08-12",
    code: { additions: 1200, deletions: 300, commits: 10, buildDays: 5, activeProducts: 3, bulkCommitsExcluded: 1 },
    recent: { pullRequests: 3, issues: 2, reviews: 1 },
  });
  assert.equal(stats.contributions.today, 4);
  assert.equal(stats.contributions.currentStreak, 4);
  assert.equal(stats.code.changed, 1500);
  assert.equal(stats.code.net, 900);
  assert.equal(stats.code.averageChangedPerCommit, 150);
  assert.equal(stats.code.commitsPerBuildDay, 2);
  assert.equal(stats.code.activeProducts, 3);
  assert.equal(stats.collaboration.pullRequests, 3);
});

test("renders a responsive, privacy-safe SVG", () => {
  const stats = computeStats({
    calendarDays: days,
    today: "2026-08-12",
    code: { additions: 1200, deletions: 300, commits: 10, buildDays: 5, activeProducts: 3, bulkCommitsExcluded: 1 },
    recent: { pullRequests: 3, issues: 2, reviews: 1 },
  });
  const svg = renderSvg(stats);
  assert.match(svg, /viewBox="0 0 1200 680"/);
  assert.match(svg, /30-day build velocity/);
  assert.match(svg, /Aggregate public \+ private activity/);
  assert.match(svg, /SHIPPING RHYTHM/);
  assert.match(svg, /active products/);
  assert.match(svg, /bulk imports filtered/);
  assert.doesNotMatch(svg, /private-repo|commit message|source code here/);
  assert.equal("repositories" in stats.code, false);
  assert.equal("repositoryNames" in stats.code, false);
  assert.doesNotMatch(JSON.stringify(stats), /repository(?:Name|Url|Identity)/i);
});

test("renders every lifetime metric as a separate trend", () => {
  const history = {
    accountCreatedAt: "2018-05-01T00:00:00Z",
    yearly: [2018, 2019, 2020].map((year, index) => ({
      year,
      contributions: 100 + index * 20,
      activeDays: 30 + index * 5,
      longestStreak: 5 + index,
      additions: 1000 + index * 100,
      deletions: 300 + index * 50,
      changed: 1300 + index * 150,
      net: 700 + index * 50,
      commits: 40 + index * 10,
      commitsPerBuildDay: 2 + index * 0.5,
      bulkCommitsExcluded: index,
      activeProducts: 2 + index,
      buildDays: 20 + index,
      pullRequests: 3 + index,
      issues: 2 + index,
      reviews: 1 + index,
      collaborationSignals: 6 + index * 3,
    })),
  };
  const svg = renderLifetimeSvg(history);
  for (const label of ["CONTRIBUTIONS", "SHIP DAYS", "LONGEST STREAK", "UNIQUE COMMITS", "COMMITS / SHIP DAY", "FOCUSED CODE CHANGED", "ACTIVE PRODUCTS", "BUILD DAYS", "COLLABORATION SIGNALS"]) {
    assert.match(svg, new RegExp(label));
  }
  assert.match(svg, /2018 → 2020/);
  assert.match(renderMobileLifetimeSvg(history), /viewBox="0 0 375 990"/);
});

test("renders a dedicated mobile progress layout", () => {
  const stats = computeStats({
    calendarDays: days,
    today: "2026-08-12",
    code: { additions: 1200, deletions: 300, commits: 10, buildDays: 5, activeProducts: 3, bulkCommitsExcluded: 1 },
    recent: { pullRequests: 3, issues: 2, reviews: 1 },
  });
  const svg = renderMobileSvg(stats);
  assert.match(svg, /viewBox="0 0 375 830"/);
  assert.match(svg, /SHIPPING RHYTHM/);
  assert.match(svg, /FOCUSED CODE/);
});

test("filters giant import snapshots without discarding the commit", () => {
  assert.deepEqual(classifyCommitChange({ additions: 800, deletions: 200 }), {
    additions: 800,
    deletions: 200,
    rawAdditions: 800,
    rawDeletions: 200,
    bulkCommitsExcluded: 0,
  });
  assert.deepEqual(classifyCommitChange({ additions: 2_739_000, deletions: 631 }), {
    additions: 0,
    deletions: 0,
    rawAdditions: 2_739_000,
    rawDeletions: 631,
    bulkCommitsExcluded: 1,
  });
});

test("finds the strongest yearly shipping streak", () => {
  assert.equal(longestStreak([
    { contributionCount: 1 },
    { contributionCount: 2 },
    { contributionCount: 0 },
    { contributionCount: 3 },
    { contributionCount: 4 },
    { contributionCount: 1 },
  ]), 3);
});

test("aggregates exact daily, weekly, and monthly cadence values", () => {
  const calendarDays = dateFixture("2026-07-01", "2026-08-12").map((date, index) => ({ date, count: index % 3 }));
  const codeDaily = [
    { date: "2026-08-11", commits: 2, additions: 100, deletions: 20 },
    { date: "2026-08-12", commits: 3, additions: 200, deletions: 50 },
  ];
  const cadence = buildCadenceData({ calendarDays, codeDaily, today: "2026-08-12" });
  assert.equal(cadence.daily.length, 14);
  assert.equal(cadence.weekly.length, 12);
  assert.equal(cadence.monthly.length, 12);
  assert.equal(cadence.daily.at(-1).commits, 3);
  assert.equal(cadence.daily.at(-1).changed, 250);
  assert.equal(cadence.weekly.at(-1).commits, 5);
  assert.equal(cadence.weekly.at(-1).buildDays, 2);
  assert.equal(cadence.monthly.at(-1).net, 230);
  assert.equal(cadence.monthly.at(-1).label, "2026-08");
});

test("renders exact cadence ledgers for desktop and mobile", () => {
  const cadence = buildCadenceData({
    calendarDays: dateFixture("2025-09-01", "2026-08-12").map((date) => ({ date, count: date === "2026-08-12" ? 123 : 1 })),
    codeDaily: [{ date: "2026-08-12", commits: 45, additions: 123456, deletions: 23456 }],
    focusDaily: [{ date: "2026-08-12", seconds: 7200 }],
    today: "2026-08-12",
  });
  const desktop = renderCadenceSvg(cadence, "daily");
  const mobile = renderMobileCadenceSvg(cadence, "monthly");
  assert.match(desktop, /viewBox="0 0 1200 800"/);
  assert.match(desktop, /Day-by-day, every number/);
  assert.match(desktop, /146,912/);
  assert.match(desktop, /2\.0h/);
  assert.match(mobile, /2\.0h focus/);
  assert.match(mobile, /Monthly detail/);
  assert.match(mobile, /2026-08/);
  assert.doesNotMatch(`${desktop}${mobile}`, /private-repo|repositoryName|commit message/);
});

test("builds a visible exact yearly ledger", () => {
  const yearly = buildYearlyCadence({
    generatedAt: "2026-08-12",
    yearly: [{ year: 2025, contributions: 87, activeDays: 29, commits: 81, buildDays: 27, additions: 50000, deletions: 6000, changed: 56000, net: 44000 }],
  });
  assert.equal(yearly[0].label, "2025");
  assert.equal(yearly[0].contributionDays, 29);
  assert.equal(yearly[0].changed, 56000);
  const cadence = { yearly };
  assert.match(renderCadenceSvg(cadence, "yearly"), /Every year, exact totals/);
  assert.match(renderMobileCadenceSvg(cadence, "yearly"), /Yearly detail/);
});

test("merges WakaTime daily totals without retaining private metadata", () => {
  const merged = mergeFocusHistory(
    [{ date: "2026-08-10", seconds: 1200 }, { date: "2026-08-11", seconds: 1800 }],
    [{ date: "2026-08-11", seconds: 2400 }, { date: "2026-08-12", seconds: 3600 }],
  );
  assert.deepEqual(merged, [
    { date: "2026-08-10", seconds: 1200 },
    { date: "2026-08-11", seconds: 2400 },
    { date: "2026-08-12", seconds: 3600 },
  ]);
  assert.doesNotMatch(JSON.stringify(merged), /project|repository|file|branch|language|machine/i);
});

test("builds and renders granular privacy-safe WakaTime progress", () => {
  const daily = dateFixture("2026-07-01", "2026-08-12").map((date, index) => ({ date, seconds: index % 3 === 0 ? 7200 : 3600 }));
  const focus = buildFocusData({
    daily,
    today: "2026-08-12",
    lifetimeSeconds: 200000,
    accountStartedAt: "2026-07-01",
    commitsLast30: 60,
  });
  assert.equal(focus.connected, true);
  assert.equal(focus.daily.length, 14);
  assert.equal(focus.weekly.length, 12);
  assert.equal(focus.monthly.length, 12);
  assert.equal(focus.yearly.length, 1);
  assert.equal(focus.summary.todaySeconds, 7200);
  assert.equal(focus.summary.lifetimeSeconds, 200000);
  assert.ok(focus.summary.commitsPerFocusHour30 > 0);
  const desktop = renderFocusSvg(focus);
  const mobile = renderMobileFocusSvg(focus);
  for (const label of ["DAILY · LAST 14 DAYS", "WEEKLY · LAST 12 WEEKS", "MONTHLY · LAST 12 MONTHS", "YEARLY · WAKATIME LIFETIME"]) {
    assert.match(desktop, new RegExp(label));
  }
  assert.match(desktop, /Time invested, momentum earned/);
  assert.match(mobile, /viewBox="0 0 375 930"/);
  assert.doesNotMatch(`${JSON.stringify(focus)}${desktop}${mobile}`, /secret-private-repo|private-file-path|machine-hostname/);
});

test("builds a pace-adjusted twelve-month operating review", () => {
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const key = new Date(Date.UTC(2025, 8 + index, 1)).toISOString().slice(0, 7);
    return ({
    key,
    label: key.slice(2),
    start: "2025-09-01",
    end: "2025-09-30",
    daysElapsed: index === 11 ? 12 : 30,
    contributions: index === 11 ? 60 : 100 + index * 10,
    commits: index === 11 ? 48 : 60 + index * 5,
    buildDays: index === 11 ? 10 : 15,
    changed: index === 11 ? 40000 : 30000 + index * 1000,
    focusSeconds: index === 11 ? 36000 : null,
  });
  });
  const review = buildOperatingReview({ generatedAt: "2026-08-12", timezone: "Asia/Bangkok", privacy: "aggregate", monthly });
  assert.equal(review.months.length, 12);
  assert.equal(review.current.daysElapsed, 12);
  assert.ok(review.currentPace.commits > 0, "partial current month should be compared by daily pace");
  assert.equal(review.guidance.length, 3);
  const desktop = renderOperatingReviewSvg(review);
  const mobile = renderMobileOperatingReviewSvg(review);
  assert.match(desktop, /One year of compounding/);
  assert.match(desktop, /pace comparisons adjust for partial months/);
  assert.match(desktop, /3-MONTH SIGNAL/);
  assert.match(mobile, /MONTH BY MONTH · EXACT VALUES/);
  assert.doesNotMatch(`${desktop}${mobile}`, /foreignObject/);
  assert.doesNotMatch(JSON.stringify(review), /repositoryName|private-repo|filePath/);
});

function dateFixture(start, end) {
  const values = [];
  for (let current = start; current <= end; current = shiftFixture(current, 1)) values.push(current);
  return values;
}

function shiftFixture(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
