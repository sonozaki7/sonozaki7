import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const USERNAME = process.env.TRACKER_USERNAME || "sonozaki7";
const TIMEZONE = process.env.TRACKER_TIMEZONE || "Asia/Bangkok";
const API = "https://api.github.com";
const WAKATIME_API = "https://wakatime.com/api/v1";
const BULK_CHANGE_THRESHOLD = 100_000;
const THEME = Object.freeze({
  background: "#FFFFFF",
  surface: "#FAFBFC",
  border: "#DCE3E7",
  text: "#181915",
  muted: "#68757C",
  dim: "#98A3A9",
  faint: "#EDF2F4",
  accent: "#355F78",
  accentMid: "#7894A5",
  accentLow: "#B8C8D1",
});

function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDate(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function compact(value) {
  return new Intl.NumberFormat("en", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function signed(value) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${compact(Math.abs(value))}`;
}

function hours(seconds, { exactZero = true } = {}) {
  if (seconds == null) return "—";
  if (seconds === 0) return exactZero ? "0h" : "—";
  const value = seconds / 3600;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)}h`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function dateRange(days, endDate) {
  return Array.from({ length: days }, (_, index) => shiftDate(endDate, index - days + 1));
}

function calculateStreaks(days, today) {
  const byDate = new Map(days.map((day) => [day.date, day.count]));
  const ordered = dateRange(366, today).map((date) => ({ date, count: byDate.get(date) || 0 }));

  let current = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (ordered[index].count === 0) break;
    current += 1;
  }

  let longest = 0;
  let run = 0;
  for (const day of ordered) {
    run = day.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}

export function longestStreak(days) {
  let longest = 0;
  let run = 0;
  for (const day of days) {
    run = day.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

export function computeStats({ calendarDays, code, recent, today }) {
  const byDate = new Map(calendarDays.map((day) => [day.date, day.count]));
  const sum = (dates) => dates.reduce((total, date) => total + (byDate.get(date) || 0), 0);
  const last30Dates = dateRange(30, today);
  const previous30Dates = dateRange(30, shiftDate(today, -30));
  const last7Dates = dateRange(7, today);
  const last30 = sum(last30Dates);
  const previous30 = sum(previous30Dates);
  const momentum = previous30 === 0 ? (last30 > 0 ? 100 : 0) : Math.round(((last30 - previous30) / previous30) * 100);
  const streaks = calculateStreaks(calendarDays, today);

  return {
    generatedAt: today,
    timezone: TIMEZONE,
    period: { start: last30Dates[0], end: today },
    contributions: {
      today: byDate.get(today) || 0,
      last7Days: sum(last7Dates),
      last30Days: last30,
      previous30Days: previous30,
      momentumPercent: momentum,
      activeDays: last30Dates.filter((date) => (byDate.get(date) || 0) > 0).length,
      currentStreak: streaks.current,
      longestStreak365Days: streaks.longest,
      daily: last30Dates.map((date) => ({ date, count: byDate.get(date) || 0 })),
    },
    code: {
      additions: code.additions,
      deletions: code.deletions,
      changed: code.additions + code.deletions,
      net: code.additions - code.deletions,
      commitsAnalyzed: code.commits,
      averageChangedPerCommit: code.commits ? Math.round((code.additions + code.deletions) / code.commits) : 0,
      buildDays: code.buildDays || 0,
      commitsPerBuildDay: code.buildDays ? Number((code.commits / code.buildDays).toFixed(1)) : 0,
      activeProducts: code.activeProducts || 0,
      bulkCommitsExcluded: code.bulkCommitsExcluded || 0,
      duplicateCommitsExcluded: code.duplicateCommitsExcluded || 0,
      repositoriesAnalyzed: code.repositoriesAnalyzed || 0,
      repositoriesSkipped: code.repositoriesSkipped || 0,
    },
    collaboration: {
      pullRequests: recent.pullRequests,
      issues: recent.issues,
      reviews: recent.reviews,
    },
    privacy: "Aggregate metrics only; private repository identities are not published.",
  };
}

export function mergeFocusHistory(existing = [], fresh = []) {
  const byDate = new Map(existing.map((day) => [day.date, { date: day.date, seconds: Math.max(0, Math.round(day.seconds || 0)) }]));
  for (const day of fresh) byDate.set(day.date, { date: day.date, seconds: Math.max(0, Math.round(day.seconds || 0)) });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function focusPeriod(dates, byDate) {
  const covered = dates.filter((date) => byDate.has(date));
  const seconds = covered.reduce((total, date) => total + (byDate.get(date) || 0), 0);
  return {
    seconds: covered.length ? seconds : null,
    activeDays: covered.filter((date) => (byDate.get(date) || 0) > 0).length,
    coverageDays: covered.length,
  };
}

export function buildFocusData({ daily = [], today, lifetimeSeconds = null, accountStartedAt = null, commitsLast30 = 0 }) {
  const normalized = mergeFocusHistory([], daily);
  const byDate = new Map(normalized.map((day) => [day.date, day.seconds]));
  const buildRolling = (count, unit) => Array.from({ length: count }, (_, index) => {
    if (unit === "day") {
      const date = shiftDate(today, index - count + 1);
      return { key: date, label: date.slice(5), start: date, end: date, ...focusPeriod([date], byDate) };
    }
    if (unit === "week") {
      const start = shiftDate(weekStart(today), (index - count + 1) * 7);
      const end = [shiftDate(start, 6), today].sort()[0];
      return { key: start, label: start.slice(5), start, end, ...focusPeriod(dateRange(daysBetween(start, end) + 1, end), byDate) };
    }
    const start = monthStart(today, index - count + 1);
    const end = [shiftDate(monthStart(start, 1), -1), today].sort()[0];
    return { key: start.slice(0, 7), label: start.slice(2, 7), start, end, ...focusPeriod(dateRange(daysBetween(start, end) + 1, end), byDate) };
  });
  const firstTracked = accountStartedAt || normalized[0]?.date || today;
  const startYear = Number(firstTracked.slice(0, 4));
  const endYear = Number(today.slice(0, 4));
  const yearly = Array.from({ length: endYear - startYear + 1 }, (_, index) => {
    const year = startYear + index;
    const start = `${year}-01-01`;
    const end = year === endYear ? today : `${year}-12-31`;
    return { key: String(year), label: String(year), start, end, ...focusPeriod(dateRange(daysBetween(start, end) + 1, end), byDate) };
  });
  const last7 = focusPeriod(dateRange(7, today), byDate);
  const last30 = focusPeriod(dateRange(30, today), byDate);
  const todayFocus = focusPeriod([today], byDate);
  const knownLifetime = lifetimeSeconds == null ? sumBy(normalized, "seconds") : Math.max(0, Math.round(lifetimeSeconds));
  const activeDaysLifetime = normalized.filter((day) => day.seconds > 0).length;
  const last30Hours = (last30.seconds || 0) / 3600;
  return {
    version: 1,
    generatedAt: today,
    timezone: TIMEZONE,
    source: "WakaTime",
    connected: normalized.length > 0 || lifetimeSeconds != null,
    trackedSince: firstTracked,
    privacy: "Dates and aggregate active coding seconds only; no project, repository, file, language, branch, editor, or machine identities are stored.",
    summary: {
      todaySeconds: todayFocus.seconds,
      last7Seconds: last7.seconds,
      last30Seconds: last30.seconds,
      lifetimeSeconds: knownLifetime,
      activeDays30: last30.activeDays,
      activeDaysLifetime,
      averageSecondsPerActiveDay30: last30.activeDays ? Math.round((last30.seconds || 0) / last30.activeDays) : 0,
      commitsPerFocusHour30: last30Hours ? Number((commitsLast30 / last30Hours).toFixed(1)) : null,
    },
    daily: buildRolling(14, "day"),
    weekly: buildRolling(12, "week"),
    monthly: buildRolling(12, "month"),
    yearly,
    dailyHistory: normalized,
  };
}

function daysBetween(start, end) {
  return Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86_400_000);
}

function sumBy(items, key) {
  return items.reduce((total, item) => total + (item[key] || 0), 0);
}

export function classifyCommitChange(commit) {
  const rawAdditions = commit.additions || 0;
  const rawDeletions = commit.deletions || 0;
  const isBulk = rawAdditions + rawDeletions > BULK_CHANGE_THRESHOLD;
  return {
    additions: isBulk ? 0 : rawAdditions,
    deletions: isBulk ? 0 : rawDeletions,
    rawAdditions,
    rawDeletions,
    bulkCommitsExcluded: isBulk ? 1 : 0,
  };
}

function monthStart(dateString, offset = 0) {
  const date = new Date(`${dateString.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function weekStart(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function periodTotals(dates, contributionsByDate, codeByDate, focusByDate = new Map()) {
  const days = dates.map((date) => {
    const code = codeByDate.get(date) || {};
    return {
      date,
      contributions: contributionsByDate.get(date) || 0,
      commits: code.commits || 0,
      additions: code.additions || 0,
      deletions: code.deletions || 0,
      bulkCommitsExcluded: code.bulkCommitsExcluded || 0,
    };
  });
  const additions = sumBy(days, "additions");
  const deletions = sumBy(days, "deletions");
  const coveredFocusDates = dates.filter((date) => focusByDate.has(date));
  return {
    contributions: sumBy(days, "contributions"),
    commits: sumBy(days, "commits"),
    buildDays: days.filter((day) => day.commits > 0).length,
    contributionDays: days.filter((day) => day.contributions > 0).length,
    additions,
    deletions,
    changed: additions + deletions,
    net: additions - deletions,
    bulkCommitsExcluded: sumBy(days, "bulkCommitsExcluded"),
    focusSeconds: coveredFocusDates.length ? coveredFocusDates.reduce((total, date) => total + (focusByDate.get(date) || 0), 0) : null,
    focusCoverageDays: coveredFocusDates.length,
  };
}

export function buildCadenceData({ calendarDays, codeDaily, focusDaily = [], today }) {
  const contributionsByDate = new Map(calendarDays.map((day) => [day.date, day.count]));
  const codeByDate = new Map(codeDaily.map((day) => [day.date, day]));
  const focusByDate = new Map(focusDaily.map((day) => [day.date, day.seconds]));
  const daily = dateRange(14, today).map((date) => ({
    key: date,
    label: date.slice(5),
    start: date,
    end: date,
    daysElapsed: 1,
    ...periodTotals([date], contributionsByDate, codeByDate, focusByDate),
  }));
  const currentWeekStart = weekStart(today);
  const weekly = Array.from({ length: 12 }, (_, index) => {
    const start = shiftDate(currentWeekStart, (index - 11) * 7);
    const end = [shiftDate(start, 6), today].sort()[0];
    const dates = dateRange(Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86_400_000) + 1, end);
    return {
      key: start,
      label: start.slice(5),
      start,
      end,
      daysElapsed: dates.length,
      ...periodTotals(dates, contributionsByDate, codeByDate, focusByDate),
    };
  });
  const currentMonthStart = monthStart(today);
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const start = monthStart(currentMonthStart, index - 11);
    const naturalEnd = shiftDate(monthStart(start, 1), -1);
    const end = [naturalEnd, today].sort()[0];
    const dates = dateRange(Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86_400_000) + 1, end);
    return {
      key: start.slice(0, 7),
      label: start.slice(0, 7),
      start,
      end,
      daysElapsed: dates.length,
      ...periodTotals(dates, contributionsByDate, codeByDate, focusByDate),
    };
  });
  return {
    generatedAt: today,
    timezone: TIMEZONE,
    privacy: "Aggregate period totals only; repository identities are not stored.",
    daily,
    weekly,
    monthly,
  };
}

export function buildYearlyCadence(history, focusDaily = []) {
  const focusByYear = new Map();
  for (const day of focusDaily) {
    const year = Number(day.date.slice(0, 4));
    const current = focusByYear.get(year) || { seconds: 0, coverageDays: 0 };
    current.seconds += day.seconds || 0;
    current.coverageDays += 1;
    focusByYear.set(year, current);
  }
  return history.yearly.map((year) => ({
    key: String(year.year),
    label: String(year.year),
    start: `${year.year}-01-01`,
    end: year.year === Number(history.generatedAt.slice(0, 4)) ? history.generatedAt : `${year.year}-12-31`,
    daysElapsed: year.year === Number(history.generatedAt.slice(0, 4))
      ? Math.round((new Date(`${history.generatedAt}T12:00:00Z`) - new Date(`${year.year}-01-01T12:00:00Z`)) / 86_400_000) + 1
      : 365 + (new Date(`${year.year}-02-29T12:00:00Z`).getUTCDate() === 29 ? 1 : 0),
    contributions: year.contributions || 0,
    contributionDays: year.activeDays || 0,
    commits: year.commits || 0,
    buildDays: year.buildDays || 0,
    additions: year.additions || 0,
    deletions: year.deletions || 0,
    changed: year.changed || 0,
    net: year.net || 0,
    bulkCommitsExcluded: year.bulkCommitsExcluded || 0,
    focusSeconds: focusByYear.has(year.year) ? focusByYear.get(year.year).seconds : null,
    focusCoverageDays: focusByYear.get(year.year)?.coverageDays || 0,
  }));
}

function cadenceTotals(periods) {
  return {
    contributions: sumBy(periods, "contributions"),
    commits: sumBy(periods, "commits"),
    buildDays: sumBy(periods, "buildDays"),
    additions: sumBy(periods, "additions"),
    deletions: sumBy(periods, "deletions"),
    changed: sumBy(periods, "changed"),
    net: sumBy(periods, "net"),
    focusSeconds: periods.some((period) => period.focusSeconds != null) ? sumBy(periods, "focusSeconds") : null,
  };
}

function cadenceMetricRows(kind) {
  return kind === "daily"
    ? [
        { key: "contributions", label: "CONTRIBUTIONS" },
        { key: "commits", label: "UNIQUE COMMITS" },
        { key: "focusSeconds", label: "FOCUS TIME", focus: true },
        { key: "changed", label: "FOCUSED LINES" },
        { key: "net", label: "NET LINES", signed: true },
      ]
    : [
        { key: "contributions", label: "CONTRIBUTIONS" },
        { key: "commits", label: "UNIQUE COMMITS" },
        { key: "buildDays", label: "BUILD DAYS" },
        { key: "focusSeconds", label: "FOCUS TIME", focus: true },
        { key: "changed", label: "FOCUSED LINES" },
      ];
}

function exact(value, signedValue = false) {
  if (value === 0) return "0";
  if (signedValue && value !== 0) return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("en")}`;
  return value.toLocaleString("en");
}

export function renderCadenceSvg(cadence, kind) {
  const periods = cadence[kind];
  const totals = cadenceTotals(periods);
  const rows = cadenceMetricRows(kind);
  const title = kind === "daily" ? "Day-by-day, every number" : kind === "weekly" ? "Twelve weeks of shipping" : kind === "monthly" ? "Twelve months of momentum" : "Every year, exact totals";
  const eyebrow = `${kind.toUpperCase()} PROGRESS LEDGER`;
  const subtitle = kind === "daily" ? "Last 14 days · exact aggregate values" : kind === "weekly" ? "Monday-based weeks · the current week is still in progress" : kind === "monthly" ? "Calendar months · the current month is still in progress" : "Account lifetime · the current year is still in progress";
  const chartX = 184;
  const chartWidth = 956;
  const columnWidth = chartWidth / periods.length;
  const chartTop = 260;
  const chartBottom = 440;
  const maxContributions = Math.max(1, ...periods.map((period) => period.contributions));
  const columns = periods.map((period, index) => {
    const center = chartX + columnWidth * index + columnWidth / 2;
    const barWidth = Math.min(44, columnWidth - 16);
    const height = period.contributions ? Math.max(5, Math.round((period.contributions / maxContributions) * (chartBottom - chartTop))) : 2;
    const x = center - barWidth / 2;
    const y = chartBottom - height;
    return `<g>
      <rect x="${x.toFixed(1)}" y="${y}" width="${barWidth.toFixed(1)}" height="${height}" rx="2" fill="${period.contributions === maxContributions ? THEME.accent : THEME.accentLow}"/>
      <text x="${center.toFixed(1)}" y="${Math.max(chartTop - 8, y - 8)}" text-anchor="middle" class="cadence-bar-value">${exact(period.contributions)}</text>
      <text x="${center.toFixed(1)}" y="466" text-anchor="middle" class="cadence-axis">${escapeXml(period.label)}</text>
    </g>`;
  }).join("");
  const ledger = rows.map((row, rowIndex) => {
    const y = 512 + rowIndex * 48;
    const values = periods.map((period, index) => {
      const center = chartX + columnWidth * index + columnWidth / 2;
      const value = row.focus ? hours(period[row.key]) : exact(period[row.key], row.signed);
      return `<text x="${center.toFixed(1)}" y="${y}" text-anchor="middle" class="cadence-cell"><title>${period.start}${period.end === period.start ? "" : ` to ${period.end}`} · ${row.label.toLowerCase()}: ${value}</title>${value}</text>`;
    }).join("");
    return `<text x="52" y="${y}" class="cadence-row-label">${row.label}</text>${values}<line x1="52" y1="${y + 14}" x2="1140" y2="${y + 14}" stroke="${THEME.faint}"/>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(subtitle)}. Exact aggregate contributions, unique commits, build days, and focused code movement without repository identities.</desc>
  <defs><linearGradient id="cadence-bg-${kind}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${THEME.background}"/><stop offset="1" stop-color="#F8FAFB"/></linearGradient>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: ${THEME.text}; }
      .cadence-eyebrow,.cadence-row-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; letter-spacing: 1.7px; fill: ${THEME.accent}; }
      .cadence-eyebrow { font-size: 12px; }.cadence-row-label { font-size: 11px; fill: ${THEME.muted}; }
      .cadence-title { font-family: Georgia, "Times New Roman", serif; font-size: 39px; font-weight: 700; letter-spacing: -1px; }
      .cadence-subtitle { font-size: 14px; fill: ${THEME.muted}; }
      .cadence-total { font-size: 25px; font-weight: 750; }.cadence-total-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; fill: ${THEME.muted}; letter-spacing: .8px; }
      .cadence-axis { font-size: 10px; fill: ${THEME.dim}; }.cadence-bar-value { font-size: 11px; font-weight: 650; }.cadence-cell { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
      .cadence-footer { font-size: 11px; fill: ${THEME.dim}; }
    </style>
  </defs>
  <rect x="1" y="1" width="1198" height="798" rx="10" fill="url(#cadence-bg-${kind})" stroke="${THEME.border}" stroke-width="2"/>
  <rect x="28" y="24" width="1144" height="2" fill="${THEME.accent}"/>
  <text x="52" y="62" class="cadence-eyebrow">${eyebrow}</text>
  <text x="52" y="103" class="cadence-title">${escapeXml(title)}</text>
  <text x="52" y="130" class="cadence-subtitle">${escapeXml(subtitle)}</text>
  <g transform="translate(52 166)"><text class="cadence-total">${exact(totals.contributions)}</text><text y="21" class="cadence-total-label">CONTRIBUTIONS</text></g>
  <g transform="translate(288 166)"><text class="cadence-total">${exact(totals.commits)}</text><text y="21" class="cadence-total-label">UNIQUE COMMITS</text></g>
  <g transform="translate(524 166)"><text class="cadence-total">${exact(totals.buildDays)}</text><text y="21" class="cadence-total-label">BUILD DAYS</text></g>
  <g transform="translate(760 166)"><text class="cadence-total">${exact(totals.changed)}</text><text y="21" class="cadence-total-label">FOCUSED LINES</text></g>
  <g transform="translate(996 166)"><text class="cadence-total">${hours(totals.focusSeconds)}</text><text y="21" class="cadence-total-label">FOCUS TIME</text></g>
  <text x="52" y="232" class="cadence-row-label">CONTRIBUTIONS</text>
  <line x1="184" y1="440" x2="1140" y2="440" stroke="${THEME.border}"/>
  ${columns}
  ${ledger}
  <text x="52" y="774" class="cadence-footer">Exact aggregate values · focused lines exclude 100k+ line imports · WakaTime project and file identities are never stored</text>
</svg>`;
}

export function renderMobileCadenceSvg(cadence, kind) {
  const periods = cadence[kind];
  const totals = cadenceTotals(periods);
  const title = kind === "daily" ? "Daily detail" : kind === "weekly" ? "Weekly detail" : kind === "monthly" ? "Monthly detail" : "Yearly detail";
  const rowHeight = 94;
  const headerHeight = 194;
  const height = headerHeight + periods.length * rowHeight + 40;
  const rows = periods.map((period, index) => {
    const y = headerHeight + index * rowHeight;
    return `<g>
      <rect x="20" y="${y}" width="335" height="84" rx="5" fill="${THEME.surface}" stroke="${THEME.border}"/>
      <text x="32" y="${y + 25}" class="mc-period">${escapeXml(period.label)}</text>
      <text x="32" y="${y + 45}" class="mc-range">${period.start}${period.end === period.start ? "" : ` → ${period.end}`}</text>
      <text x="32" y="${y + 68}" class="mc-range">${period.contributionDays} contribution days · ${hours(period.focusSeconds)} focus</text>
      <g transform="translate(126 ${y + 21})"><text class="mc-value">${exact(period.contributions)}</text><text y="17" class="mc-label">CONTRIB</text></g>
      <g transform="translate(202 ${y + 21})"><text class="mc-value">${exact(period.commits)}</text><text y="17" class="mc-label">COMMITS</text></g>
      <g transform="translate(278 ${y + 21})"><text class="mc-value">${exact(period.buildDays)}</text><text y="17" class="mc-label">BUILD DAYS</text></g>
      <g transform="translate(126 ${y + 60})"><text class="mc-value">${exact(period.changed)}</text><text y="17" class="mc-label">FOCUSED</text></g>
      <g transform="translate(202 ${y + 60})"><text class="mc-value">${exact(period.additions, true)}</text><text y="17" class="mc-label">ADDED</text></g>
      <g transform="translate(278 ${y + 60})"><text class="mc-value">${exact(-period.deletions, true)}</text><text y="17" class="mc-label">REMOVED</text></g>
    </g>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="375" height="${height}" viewBox="0 0 375 ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">Exact aggregate period values for contributions, unique commits, and focused lines without repository identities.</desc>
  <defs><linearGradient id="mc-bg-${kind}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${THEME.background}"/><stop offset="1" stop-color="#F8FAFB"/></linearGradient>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: ${THEME.text}; }
      .mc-eyebrow,.mc-period { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; letter-spacing: 1.2px; fill: ${THEME.accent}; }.mc-eyebrow { font-size: 10px; }.mc-period { font-size: 10px; }
      .mc-title { font-family: Georgia, "Times New Roman", serif; font-size: 28px; font-weight: 700; }.mc-subtitle,.mc-range,.mc-footer { font-size: 8px; fill: ${THEME.muted}; }
      .mc-total { font-size: 18px; font-weight: 750; }.mc-total-label,.mc-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 7px; fill: ${THEME.muted}; letter-spacing: .4px; }
      .mc-value { font-size: 11px; font-weight: 700; }
    </style>
  </defs>
  <rect x="1" y="1" width="373" height="${height - 2}" rx="8" fill="url(#mc-bg-${kind})" stroke="${THEME.border}" stroke-width="2"/>
  <rect x="16" y="15" width="343" height="2" fill="${THEME.accent}"/>
  <text x="20" y="44" class="mc-eyebrow">${kind.toUpperCase()} PROGRESS LEDGER</text>
  <text x="20" y="76" class="mc-title">${escapeXml(title)}</text>
  <text x="20" y="96" class="mc-subtitle">Every period · exact aggregate values</text>
  <g transform="translate(20 124)"><text class="mc-total">${exact(totals.contributions)}</text><text y="18" class="mc-total-label">CONTRIBUTIONS</text></g>
  <g transform="translate(132 124)"><text class="mc-total">${exact(totals.commits)}</text><text y="18" class="mc-total-label">UNIQUE COMMITS</text></g>
  <g transform="translate(244 124)"><text class="mc-total">${hours(totals.focusSeconds)}</text><text y="18" class="mc-total-label">FOCUS TIME</text></g>
  ${rows}
  <text x="20" y="${height - 16}" class="mc-footer">Private repository identities are never stored</text>
</svg>`;
}

function chartPanel({ x, y, width, height, title, values, years, color, format = compact, signedValues = false, summary = "sum" }) {
  const chartLeft = x + 22;
  const chartTop = y + 48;
  const chartWidth = width - 44;
  const chartHeight = height - 80;
  const minValue = signedValues ? Math.min(0, ...values) : 0;
  const maxValue = Math.max(1, ...values);
  const range = Math.max(1, maxValue - minValue);
  const points = values.map((value, index) => {
    const px = values.length === 1 ? chartLeft + chartWidth / 2 : chartLeft + (index / (values.length - 1)) * chartWidth;
    const py = chartTop + chartHeight - ((value - minValue) / range) * chartHeight;
    return { x: px, y: py, value };
  });
  const baselineY = chartTop + chartHeight - ((0 - minValue) / range) * chartHeight;
  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const linePath = points.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = points.length ? `M ${points[0].x.toFixed(1)} ${baselineY.toFixed(1)} ${linePath} L ${points.at(-1).x.toFixed(1)} ${baselineY.toFixed(1)} Z` : "";
  const total = summary === "max" ? Math.max(0, ...values) : summary === "latest" ? (values.at(-1) || 0) : values.reduce((sum, value) => sum + value, 0);
  const circles = points.map((point, index) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5" fill="${color}"><title>${years[index]}: ${point.value.toLocaleString("en")}</title></circle>`).join("");

  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="${THEME.surface}" stroke="${THEME.border}"/>
    <text x="${x + 20}" y="${y + 28}" class="history-label">${escapeXml(title)}</text>
    <text x="${x + width - 20}" y="${y + 29}" text-anchor="end" class="history-total">${escapeXml(format(total))}</text>
    <line x1="${chartLeft}" y1="${baselineY.toFixed(1)}" x2="${chartLeft + chartWidth}" y2="${baselineY.toFixed(1)}" stroke="${THEME.border}"/>
    <path d="${area}" fill="${color}" opacity="0.08"/>
    <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/>
    ${circles}
    <text x="${chartLeft}" y="${y + height - 12}" class="history-axis">${years[0]}</text>
    <text x="${chartLeft + chartWidth}" y="${y + height - 12}" text-anchor="end" class="history-axis">${years.at(-1)}</text>
  </g>`;
}

export function renderLifetimeSvg(history) {
  const years = history.yearly.map((item) => item.year);
  const metrics = [
    { title: "CONTRIBUTIONS", key: "contributions", color: THEME.accent },
    { title: "SHIP DAYS", key: "activeDays", color: THEME.accent },
    { title: "LONGEST STREAK", key: "longestStreak", color: THEME.accent, summary: "max" },
    { title: "UNIQUE COMMITS", key: "commits", color: THEME.accent },
    { title: "COMMITS / SHIP DAY", key: "commitsPerBuildDay", color: THEME.accent, summary: "latest", format: (value) => value.toFixed(1) },
    { title: "FOCUSED CODE CHANGED", key: "changed", color: THEME.accent },
    { title: "ACTIVE PRODUCTS", key: "activeProducts", color: THEME.accent },
    { title: "BUILD DAYS", key: "buildDays", color: THEME.accent },
    { title: "COLLABORATION SIGNALS", key: "collaborationSignals", color: THEME.accent },
  ];
  const panels = metrics.map((metric, index) => chartPanel({
    x: 52 + (index % 3) * 366,
    y: 220 + Math.floor(index / 3) * 205,
    width: 342,
    height: 180,
    title: metric.title,
    values: history.yearly.map((item) => item[metric.key] || 0),
    years,
    color: metric.color,
    signedValues: metric.signedValues,
    summary: metric.summary,
    format: metric.format || (metric.signedValues ? signed : compact),
  })).join("\n");
  const lifetimeContributions = sumBy(history.yearly, "contributions");
  const linesChanged = sumBy(history.yearly, "changed");
  const commits = sumBy(history.yearly, "commits");
  const activeDays = sumBy(history.yearly, "activeDays");
  const bulkFiltered = sumBy(history.yearly, "bulkCommitsExcluded");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="880" viewBox="0 0 1200 880" role="img" aria-labelledby="title desc">
  <title id="title">So's lifetime founder operating history</title>
  <desc id="desc">Yearly shipping consistency, deduplicated commit throughput, focused code movement, and collaboration trends from GitHub account creation.</desc>
  <defs>
    <linearGradient id="history-bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${THEME.background}"/><stop offset="1" stop-color="#F8FAFB"/></linearGradient>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: ${THEME.text}; }
      .history-eyebrow { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; font-weight: 600; letter-spacing: 2.6px; fill: ${THEME.accent}; }
      .history-title { font-family: Georgia, "Times New Roman", serif; font-size: 40px; font-weight: 700; letter-spacing: -1.2px; }
      .history-subtitle { font-size: 15px; fill: ${THEME.muted}; }
      .history-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; letter-spacing: 1.2px; fill: ${THEME.muted}; }
      .history-total { font-size: 22px; font-weight: 750; }
      .history-axis { font-size: 11px; fill: ${THEME.dim}; }
      .headline-number { font-size: 27px; font-weight: 750; }
      .headline-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; fill: ${THEME.muted}; letter-spacing: 0.8px; }
      .history-footer { font-size: 12px; fill: ${THEME.dim}; }
    </style>
  </defs>
  <rect x="1" y="1" width="1198" height="878" rx="10" fill="url(#history-bg)" stroke="${THEME.border}" stroke-width="2"/>
  <rect x="28" y="24" width="1144" height="2" fill="${THEME.accent}"/>
  <text x="52" y="64" class="history-eyebrow">FOUNDER OPERATING HISTORY</text>
  <text x="52" y="106" class="history-title">Lifetime momentum, year by year</text>
  <text x="52" y="134" class="history-subtitle">${escapeXml(history.accountCreatedAt.slice(0, 4))} → ${escapeXml(String(years.at(-1)))} · every chart has its own scale so the trend stays honest</text>
  <g transform="translate(52 158)"><text class="headline-number">${compact(lifetimeContributions)}</text><text y="22" class="headline-label">CONTRIBUTIONS</text></g>
  <g transform="translate(287 158)"><text class="headline-number">${compact(linesChanged)}</text><text y="22" class="headline-label">FOCUSED LINES</text></g>
  <g transform="translate(522 158)"><text class="headline-number">${compact(commits)}</text><text y="22" class="headline-label">UNIQUE COMMITS</text></g>
  <g transform="translate(757 158)"><text class="headline-number">${compact(activeDays)}</text><text y="22" class="headline-label">SHIP DAYS</text></g>
  <g transform="translate(992 158)"><text class="headline-number">${compact(bulkFiltered)}</text><text y="22" class="headline-label">BULK IMPORTS FILTERED</text></g>
  ${panels}
  <text x="52" y="852" class="history-footer">Unique authored commits on accessible default branches · 100k+ line imports filtered · aggregate only</text>
</svg>`;
}

function mobileHistoryRow(metric, index, values, years) {
  const y = 183 + index * 86;
  const min = metric.signedValues ? Math.min(0, ...values) : 0;
  const max = Math.max(1, ...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, pointIndex) => {
    const x = 151 + (pointIndex / Math.max(1, values.length - 1)) * 183;
    const pointY = y + 59 - ((value - min) / range) * 34;
    return `${x.toFixed(1)},${pointY.toFixed(1)}`;
  }).join(" ");
  const total = metric.summary === "max" ? Math.max(0, ...values) : metric.summary === "latest" ? (values.at(-1) || 0) : values.reduce((sum, value) => sum + value, 0);
  const valueFormat = metric.format || (metric.signedValues ? signed : compact);
  return `<g>
    <rect x="20" y="${y}" width="335" height="76" rx="5" fill="${THEME.surface}" stroke="${THEME.border}"/>
    <text x="34" y="${y + 28}" class="mh-label">${escapeXml(metric.title)}</text>
    <text x="34" y="${y + 55}" class="mh-value">${escapeXml(valueFormat(total))}</text>
    <line x1="151" y1="${y + 60}" x2="334" y2="${y + 60}" stroke="${THEME.border}"/>
    <polyline points="${points}" fill="none" stroke="${metric.color}" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/>
    <text x="151" y="${y + 72}" class="mh-axis">${years[0]}</text><text x="334" y="${y + 72}" text-anchor="end" class="mh-axis">${years.at(-1)}</text>
  </g>`;
}

export function renderMobileLifetimeSvg(history) {
  const years = history.yearly.map((item) => item.year);
  const metrics = [
    { title: "CONTRIBUTIONS", key: "contributions", color: THEME.accent },
    { title: "SHIP DAYS", key: "activeDays", color: THEME.accent },
    { title: "LONGEST STREAK", key: "longestStreak", color: THEME.accent, summary: "max" },
    { title: "UNIQUE COMMITS", key: "commits", color: THEME.accent },
    { title: "COMMITS / SHIP DAY", key: "commitsPerBuildDay", color: THEME.accent, summary: "latest", format: (value) => value.toFixed(1) },
    { title: "FOCUSED CODE", key: "changed", color: THEME.accent },
    { title: "ACTIVE PRODUCTS", key: "activeProducts", color: THEME.accent },
    { title: "BUILD DAYS", key: "buildDays", color: THEME.accent },
    { title: "COLLAB SIGNALS", key: "collaborationSignals", color: THEME.accent },
  ];
  const rows = metrics.map((metric, index) => mobileHistoryRow(metric, index, history.yearly.map((item) => item[metric.key] || 0), years)).join("");
  const contributions = sumBy(history.yearly, "contributions");
  const lines = sumBy(history.yearly, "changed");
  const commits = sumBy(history.yearly, "commits");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="375" height="990" viewBox="0 0 375 990" role="img" aria-labelledby="title desc">
  <title id="title">So's mobile lifetime founder operating history</title>
  <desc id="desc">Mobile yearly trends for shipping consistency, unique commits, focused code movement, and collaboration.</desc>
  <defs><linearGradient id="mh-bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${THEME.background}"/><stop offset="1" stop-color="#F8FAFB"/></linearGradient>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: ${THEME.text}; }
      .mh-eyebrow { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-weight: 600; letter-spacing: 1.7px; fill: ${THEME.accent}; }
      .mh-title { font-family: Georgia, "Times New Roman", serif; font-size: 27px; font-weight: 700; letter-spacing: -.7px; }
      .mh-subtitle,.mh-axis,.mh-footer { font-size: 9px; fill: ${THEME.muted}; }
      .mh-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; font-weight: 600; letter-spacing: .8px; fill: ${THEME.muted}; }
      .mh-value { font-size: 18px; font-weight: 750; }
      .mh-head { font-size: 20px; font-weight: 750; }
      .mh-head-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 8px; fill: ${THEME.muted}; letter-spacing: .5px; }
    </style>
  </defs>
  <rect x="1" y="1" width="373" height="988" rx="8" fill="url(#mh-bg)" stroke="${THEME.border}" stroke-width="2"/>
  <rect x="16" y="15" width="343" height="2" fill="${THEME.accent}"/>
  <text x="20" y="45" class="mh-eyebrow">FOUNDER OPERATING HISTORY</text>
  <text x="20" y="77" class="mh-title">Lifetime momentum</text>
  <text x="20" y="97" class="mh-subtitle">${years[0]} → ${years.at(-1)} · each trend uses its own honest scale</text>
  <g transform="translate(20 122)"><text class="mh-head">${compact(contributions)}</text><text y="18" class="mh-head-label">CONTRIBUTIONS</text></g>
  <g transform="translate(137 122)"><text class="mh-head">${compact(lines)}</text><text y="18" class="mh-head-label">FOCUSED LINES</text></g>
  <g transform="translate(254 122)"><text class="mh-head">${compact(commits)}</text><text y="18" class="mh-head-label">UNIQUE COMMITS</text></g>
  ${rows}
  <text x="20" y="974" class="mh-footer">100k+ line imports filtered · repository identities are never stored</text>
</svg>`;
}

function focusChart({ x, y, width, height, title, periods }) {
  const chartLeft = x + 22;
  const chartRight = x + width - 22;
  const chartTop = y + 48;
  const chartBottom = y + height - 34;
  const values = periods.map((period) => period.seconds || 0);
  const max = Math.max(1, ...values);
  const points = periods.map((period, index) => {
    const px = periods.length === 1 ? (chartLeft + chartRight) / 2 : chartLeft + (index / (periods.length - 1)) * (chartRight - chartLeft);
    const py = chartBottom - ((period.seconds || 0) / max) * (chartBottom - chartTop);
    return { ...period, x: px, y: py };
  });
  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const labels = points.map((point, index) => {
    const showAxis = periods.length <= 6 || index === 0 || index === periods.length - 1 || index % Math.ceil(periods.length / 4) === 0;
    const valueY = Math.max(chartTop - 7, point.y - 8);
    return `<g><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3" fill="${THEME.accent}"><title>${point.start}${point.end === point.start ? "" : ` to ${point.end}`}: ${hours(point.seconds)}</title></circle><text x="${point.x.toFixed(1)}" y="${valueY.toFixed(1)}" text-anchor="middle" class="focus-point">${hours(point.seconds)}</text>${showAxis ? `<text x="${point.x.toFixed(1)}" y="${y + height - 13}" text-anchor="middle" class="focus-axis">${escapeXml(point.label)}</text>` : ""}</g>`;
  }).join("");
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="${THEME.surface}" stroke="${THEME.border}"/>
    <text x="${x + 20}" y="${y + 28}" class="focus-label">${escapeXml(title)}</text>
    <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" stroke="${THEME.border}"/>
    <polyline points="${polyline}" fill="none" stroke="${THEME.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${labels}
  </g>`;
}

function focusSummaryCard(x, label, value, note) {
  return `<g transform="translate(${x} 162)"><rect width="262" height="96" rx="6" fill="${THEME.surface}" stroke="${THEME.border}"/><text x="20" y="27" class="focus-label">${escapeXml(label)}</text><text x="20" y="61" class="focus-value">${escapeXml(value)}</text><text x="20" y="81" class="focus-note">${escapeXml(note)}</text></g>`;
}

export function renderFocusSvg(focus) {
  const status = focus.connected ? `Tracking since ${focus.trackedSince}` : "Connect WakaTime to begin the lifelong focus record";
  const leverage = focus.summary.commitsPerFocusHour30 == null ? "—" : focus.summary.commitsPerFocusHour30.toFixed(1);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850" role="img" aria-labelledby="title desc">
  <title id="title">So's WakaTime focus and leverage tracker</title>
  <desc id="desc">Privacy-safe active coding time with exact daily, weekly, monthly, and yearly trends. Project and file identities are excluded.</desc>
  <defs><linearGradient id="focus-bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${THEME.background}"/><stop offset="1" stop-color="#F8FAFB"/></linearGradient><style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: ${THEME.text}; }
    .focus-eyebrow,.focus-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; letter-spacing: 1.6px; fill: ${THEME.accent}; }
    .focus-eyebrow { font-size: 13px; letter-spacing: 2.6px; }.focus-label { font-size: 10px; fill: ${THEME.muted}; }
    .focus-title { font-family: Georgia, "Times New Roman", serif; font-size: 40px; font-weight: 700; letter-spacing: -1.1px; }
    .focus-subtitle { font-size: 15px; fill: ${THEME.muted}; }.focus-value { font-size: 29px; font-weight: 750; }.focus-note { font-size: 11px; fill: ${THEME.dim}; }
    .focus-point { font-size: 9px; font-weight: 650; }.focus-axis,.focus-footer { font-size: 9px; fill: ${THEME.dim}; }.focus-footer { font-size: 11px; }
  </style></defs>
  <rect x="1" y="1" width="1198" height="848" rx="10" fill="url(#focus-bg)" stroke="${THEME.border}" stroke-width="2"/>
  <rect x="28" y="24" width="1144" height="2" fill="${THEME.accent}"/>
  <text x="52" y="64" class="focus-eyebrow">FOCUS &amp; LEVERAGE · WAKATIME</text>
  <text x="52" y="106" class="focus-title">Time invested, momentum earned</text>
  <text x="52" y="134" class="focus-subtitle">Active editor time · ${escapeXml(status)} · Asia/Bangkok</text>
  ${focusSummaryCard(52, "TODAY", hours(focus.summary.todaySeconds), `${focus.summary.activeDays30} active days / 30`)}
  ${focusSummaryCard(330, "LAST 7 DAYS", hours(focus.summary.last7Seconds), `${hours(focus.summary.averageSecondsPerActiveDay30)} avg / active day`)}
  ${focusSummaryCard(608, "LAST 30 DAYS", hours(focus.summary.last30Seconds), `${leverage} commits / focus hour`)}
  ${focusSummaryCard(886, "LIFETIME", hours(focus.summary.lifetimeSeconds), `${focus.summary.activeDaysLifetime} recorded focus days`)}
  ${focusChart({ x: 52, y: 286, width: 538, height: 238, title: "DAILY · LAST 14 DAYS", periods: focus.daily })}
  ${focusChart({ x: 610, y: 286, width: 538, height: 238, title: "WEEKLY · LAST 12 WEEKS", periods: focus.weekly })}
  ${focusChart({ x: 52, y: 544, width: 538, height: 238, title: "MONTHLY · LAST 12 MONTHS", periods: focus.monthly })}
  ${focusChart({ x: 610, y: 544, width: 538, height: 238, title: "YEARLY · WAKATIME LIFETIME", periods: focus.yearly })}
  <text x="52" y="822" class="focus-footer">Aggregate active seconds only · no project, file, repository, branch, language, editor, or machine names are published</text>
</svg>`;
}

function mobileFocusChart(focus, key, y, title) {
  const periods = focus[key];
  const values = periods.map((period) => period.seconds || 0);
  const max = Math.max(1, ...values);
  const left = 36;
  const right = 339;
  const top = y + 42;
  const bottom = y + 112;
  const points = periods.map((period, index) => ({
    ...period,
    x: periods.length === 1 ? (left + right) / 2 : left + (index / (periods.length - 1)) * (right - left),
    y: bottom - ((period.seconds || 0) / max) * (bottom - top),
  }));
  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const dots = points.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.5" fill="${THEME.accent}"><title>${point.start}${point.end === point.start ? "" : ` to ${point.end}`}: ${hours(point.seconds)}</title></circle>`).join("");
  const total = values.reduce((sum, value) => sum + value, 0);
  const endLabel = periods.length > 1 ? `<text x="${right}" y="${y + 130}" text-anchor="end" class="mf-axis">${escapeXml(periods.at(-1)?.label || "")}</text>` : "";
  return `<g><rect x="20" y="${y}" width="335" height="140" rx="5" fill="${THEME.surface}" stroke="${THEME.border}"/><text x="34" y="${y + 25}" class="mf-label">${escapeXml(title)}</text><text x="341" y="${y + 25}" text-anchor="end" class="mf-total">${hours(total)}</text><line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${THEME.border}"/><polyline points="${polyline}" fill="none" stroke="${THEME.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${dots}<text x="${left}" y="${y + 130}" class="mf-axis">${escapeXml(periods[0]?.label || "")}</text>${endLabel}</g>`;
}

export function renderMobileFocusSvg(focus) {
  const status = focus.connected ? `Since ${focus.trackedSince}` : "Connection pending";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="375" height="930" viewBox="0 0 375 930" role="img" aria-labelledby="title desc">
  <title id="title">So's mobile WakaTime focus tracker</title><desc id="desc">Privacy-safe active coding time across daily, weekly, monthly, and yearly periods.</desc>
  <defs><linearGradient id="mf-bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${THEME.background}"/><stop offset="1" stop-color="#F8FAFB"/></linearGradient><style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: ${THEME.text}; }.mf-eyebrow,.mf-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; letter-spacing: 1px; fill: ${THEME.accent}; }.mf-eyebrow { font-size: 10px; letter-spacing: 1.7px; }.mf-label { font-size: 9px; fill: ${THEME.muted}; }.mf-title { font-family: Georgia, "Times New Roman", serif; font-size: 27px; font-weight: 700; }.mf-subtitle,.mf-axis,.mf-footer { font-size: 9px; fill: ${THEME.muted}; }.mf-number { font-size: 20px; font-weight: 750; }.mf-small { font-size: 8px; fill: ${THEME.dim}; }.mf-total { font-size: 13px; font-weight: 700; }
  </style></defs>
  <rect x="1" y="1" width="373" height="928" rx="8" fill="url(#mf-bg)" stroke="${THEME.border}" stroke-width="2"/><rect x="16" y="15" width="343" height="2" fill="${THEME.accent}"/>
  <text x="20" y="45" class="mf-eyebrow">FOCUS &amp; LEVERAGE · WAKATIME</text><text x="20" y="78" class="mf-title">Time invested</text><text x="20" y="98" class="mf-subtitle">${escapeXml(status)} · aggregate active time only</text>
  <g transform="translate(20 119)"><rect width="164" height="76" rx="5" fill="${THEME.surface}" stroke="${THEME.border}"/><text x="14" y="21" class="mf-label">TODAY</text><text x="14" y="49" class="mf-number">${hours(focus.summary.todaySeconds)}</text><text x="14" y="66" class="mf-small">ACTIVE EDITOR TIME</text></g>
  <g transform="translate(191 119)"><rect width="164" height="76" rx="5" fill="${THEME.surface}" stroke="${THEME.border}"/><text x="14" y="21" class="mf-label">LAST 7 DAYS</text><text x="14" y="49" class="mf-number">${hours(focus.summary.last7Seconds)}</text><text x="14" y="66" class="mf-small">${focus.summary.activeDays30} ACTIVE DAYS / 30</text></g>
  <g transform="translate(20 202)"><rect width="164" height="76" rx="5" fill="${THEME.surface}" stroke="${THEME.border}"/><text x="14" y="21" class="mf-label">LAST 30 DAYS</text><text x="14" y="49" class="mf-number">${hours(focus.summary.last30Seconds)}</text><text x="14" y="66" class="mf-small">${hours(focus.summary.averageSecondsPerActiveDay30)} AVG / ACTIVE DAY</text></g>
  <g transform="translate(191 202)"><rect width="164" height="76" rx="5" fill="${THEME.surface}" stroke="${THEME.border}"/><text x="14" y="21" class="mf-label">LIFETIME</text><text x="14" y="49" class="mf-number">${hours(focus.summary.lifetimeSeconds)}</text><text x="14" y="66" class="mf-small">${focus.summary.activeDaysLifetime} RECORDED DAYS</text></g>
  ${mobileFocusChart(focus, "daily", 301, "DAILY · 14 DAYS")}${mobileFocusChart(focus, "weekly", 451, "WEEKLY · 12 WEEKS")}${mobileFocusChart(focus, "monthly", 601, "MONTHLY · 12 MONTHS")}${mobileFocusChart(focus, "yearly", 751, "YEARLY · WAKATIME LIFETIME")}
  <text x="20" y="912" class="mf-footer">No project, file, repository, branch, language, editor, or machine names</text>
</svg>`;
}

function metricCard(x, y, label, value, note, index) {
  return `<g transform="translate(${x} ${y})">
    <rect width="270" height="104" rx="6" fill="${THEME.surface}" stroke="${THEME.border}"/>
    <text x="248" y="27" text-anchor="end" class="index">0${index}</text>
    <text x="22" y="29" class="label">${escapeXml(label)}</text>
    <text x="22" y="68" class="value">${escapeXml(value)}</text>
    <text x="22" y="90" class="note">${escapeXml(note)}</text>
  </g>`;
}

export function renderSvg(stats) {
  const daily = stats.contributions.daily;
  const max = Math.max(1, ...daily.map((day) => day.count));
  const barWidth = 22;
  const gap = 12;
  const graphX = 62;
  const graphBottom = 455;
  const graphHeight = 112;
  const bars = daily.map((day, index) => {
    const height = day.count === 0 ? 3 : Math.max(8, Math.round((day.count / max) * graphHeight));
    const x = graphX + index * (barWidth + gap);
    const y = graphBottom - height;
    const color = day.count === 0 ? THEME.faint : day.count >= max * 0.67 ? THEME.accent : day.count >= max * 0.34 ? THEME.accentMid : THEME.accentLow;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="2" fill="${color}"><title>${day.date}: ${day.count} contributions</title></rect>`;
  }).join("\n");
  const labels = daily.map((day, index) => {
    if (index !== 0 && index !== daily.length - 1 && index % 5 !== 0) return "";
    const x = graphX + index * (barWidth + gap) + barWidth / 2;
    return `<text x="${x}" y="482" text-anchor="middle" class="axis">${day.date.slice(5)}</text>`;
  }).join("\n");
  const momentumText = `${signed(stats.contributions.momentumPercent)}% vs previous 30 days`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680" viewBox="0 0 1200 680" role="img" aria-labelledby="title desc">
  <title id="title">So's 30-day founder build velocity</title>
  <desc id="desc">Daily contribution momentum, shipping consistency, unique commit throughput, product breadth, and focused code movement. Aggregate public and private activity without repository names.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${THEME.background}"/><stop offset="1" stop-color="#F8FAFB"/></linearGradient>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: ${THEME.text}; }
      .eyebrow { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; font-weight: 600; letter-spacing: 2.6px; fill: ${THEME.accent}; }
      .title { font-family: Georgia, "Times New Roman", serif; font-size: 42px; font-weight: 700; letter-spacing: -1.3px; }
      .subtitle { font-size: 16px; fill: ${THEME.muted}; }
      .label,.index { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; letter-spacing: 1.3px; fill: ${THEME.muted}; }
      .index { fill: ${THEME.dim}; }
      .value { font-size: 31px; font-weight: 750; }
      .note { font-size: 13px; fill: ${THEME.muted}; }
      .section { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 600; letter-spacing: 1.6px; fill: ${THEME.muted}; }
      .axis { font-size: 11px; fill: ${THEME.dim}; }
      .mini-value { font-size: 24px; font-weight: 700; }
      .mini-label { font-size: 12px; fill: ${THEME.muted}; }
      .footer { font-size: 12px; fill: ${THEME.dim}; }
    </style>
  </defs>
  <rect x="1" y="1" width="1198" height="678" rx="10" fill="url(#bg)" stroke="${THEME.border}" stroke-width="2"/>
  <rect x="28" y="24" width="1144" height="2" fill="${THEME.accent}"/>
  <text x="52" y="64" class="eyebrow">FOUNDER SHIP LOG</text>
  <text x="52" y="108" class="title">30-day build velocity</text>
  <text x="52" y="137" class="subtitle">AI-first SaaS · progress measured in consistent shipping, not vanity</text>
  <g transform="translate(925 53)">
    <rect width="220" height="38" rx="4" fill="${THEME.surface}" stroke="${THEME.border}"/>
    <line x1="18" y1="19" x2="30" y2="19" stroke="${THEME.accent}" stroke-width="2"/>
    <text x="41" y="24" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" letter-spacing="1" fill="${THEME.muted}">UPDATED ${escapeXml(stats.period.end)}</text>
  </g>

  ${metricCard(52, 168, "TODAY", compact(stats.contributions.today), "contributions", 1)}
  ${metricCard(340, 168, "LAST 7 DAYS", compact(stats.contributions.last7Days), "contributions", 2)}
  ${metricCard(628, 168, "LAST 30 DAYS", compact(stats.contributions.last30Days), momentumText, 3)}
  ${metricCard(916, 168, "CURRENT STREAK", `${stats.contributions.currentStreak}d`, `best: ${stats.contributions.longestStreak365Days} days`, 4)}

  <text x="52" y="317" class="section">DAILY CONTRIBUTIONS · LAST 30 DAYS</text>
  <line x1="52" y1="456" x2="1148" y2="456" stroke="${THEME.faint}"/>
  ${bars}
  ${labels}

  <g transform="translate(52 520)">
    <rect width="706" height="112" rx="6" fill="${THEME.surface}" stroke="${THEME.border}"/>
    <text x="22" y="29" class="section">SHIPPING RHYTHM · 30 DAYS</text>
    <g transform="translate(22 49)"><text class="mini-value" fill="${THEME.accent}">${stats.code.buildDays}/30</text><text y="27" class="mini-label">build days</text></g>
    <g transform="translate(160 49)"><text class="mini-value">${compact(stats.code.commitsAnalyzed)}</text><text y="27" class="mini-label">unique commits</text></g>
    <g transform="translate(298 49)"><text class="mini-value">${compact(stats.code.activeProducts)}</text><text y="27" class="mini-label">active products</text></g>
    <g transform="translate(436 49)"><text class="mini-value">${stats.code.commitsPerBuildDay.toFixed(1)}</text><text y="27" class="mini-label">commits / build day</text></g>
    <g transform="translate(574 49)"><text class="mini-value">${compact(stats.code.bulkCommitsExcluded)}</text><text y="27" class="mini-label">bulk imports filtered</text></g>
  </g>

  <g transform="translate(776 520)">
    <rect width="372" height="112" rx="6" fill="${THEME.surface}" stroke="${THEME.border}"/>
    <text x="22" y="29" class="section">FOCUSED CODE · 30 DAYS</text>
    <g transform="translate(22 49)"><text class="mini-value" fill="${THEME.accent}">+${compact(stats.code.additions)}</text><text y="27" class="mini-label">lines added</text></g>
    <g transform="translate(143 49)"><text class="mini-value">−${compact(stats.code.deletions)}</text><text y="27" class="mini-label">lines removed</text></g>
    <g transform="translate(263 49)"><text class="mini-value">${signed(stats.code.net)}</text><text y="27" class="mini-label">net lines</text></g>
  </g>
  <text x="52" y="660" class="footer">Aggregate public + private activity · private repositories and source remain private · Asia/Bangkok</text>
</svg>`;
}

function mobileMetric(x, y, label, value, note, index) {
  return `<g transform="translate(${x} ${y})">
    <rect width="164" height="83" rx="5" fill="${THEME.surface}" stroke="${THEME.border}"/>
    <text x="148" y="21" text-anchor="end" class="m-index">0${index}</text>
    <text x="15" y="23" class="m-label">${escapeXml(label)}</text>
    <text x="15" y="52" class="m-value">${escapeXml(value)}</text>
    <text x="15" y="71" class="m-note">${escapeXml(note)}</text>
  </g>`;
}

export function renderMobileSvg(stats) {
  const daily = stats.contributions.daily;
  const max = Math.max(1, ...daily.map((day) => day.count));
  const bars = daily.map((day, index) => {
    const height = day.count === 0 ? 2 : Math.max(5, Math.round((day.count / max) * 82));
    const x = 20 + index * 11;
    const y = 475 - height;
    const color = day.count === 0 ? THEME.faint : day.count >= max * 0.67 ? THEME.accent : day.count >= max * 0.34 ? THEME.accentMid : THEME.accentLow;
    return `<rect x="${x}" y="${y}" width="7" height="${height}" rx="1" fill="${color}"><title>${day.date}: ${day.count} contributions</title></rect>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="375" height="830" viewBox="0 0 375 830" role="img" aria-labelledby="title desc">
  <title id="title">So's mobile 30-day founder build velocity</title>
  <desc id="desc">Mobile view of daily momentum, shipping consistency, unique commits, product breadth, and focused code movement.</desc>
  <defs><linearGradient id="m-bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${THEME.background}"/><stop offset="1" stop-color="#F8FAFB"/></linearGradient>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: ${THEME.text}; }
      .m-eyebrow { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-weight: 600; letter-spacing: 1.8px; fill: ${THEME.accent}; }
      .m-title { font-family: Georgia, "Times New Roman", serif; font-size: 28px; font-weight: 700; letter-spacing: -.8px; }
      .m-subtitle,.m-note,.m-footer { font-size: 10px; fill: ${THEME.muted}; }
      .m-label,.m-section,.m-index { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; font-weight: 600; letter-spacing: 1px; fill: ${THEME.muted}; }
      .m-index { fill: ${THEME.dim}; }
      .m-value { font-size: 23px; font-weight: 750; }
      .m-small-value { font-size: 19px; font-weight: 750; }
      .m-small-label { font-size: 9px; fill: ${THEME.muted}; }
    </style>
  </defs>
  <rect x="1" y="1" width="373" height="828" rx="8" fill="url(#m-bg)" stroke="${THEME.border}" stroke-width="2"/>
  <rect x="16" y="15" width="343" height="2" fill="${THEME.accent}"/>
  <text x="20" y="45" class="m-eyebrow">FOUNDER SHIP LOG</text>
  <text x="20" y="78" class="m-title">30-day build velocity</text>
  <text x="20" y="98" class="m-subtitle">AI-first SaaS · updated ${escapeXml(stats.period.end)}</text>
  ${mobileMetric(20, 120, "TODAY", compact(stats.contributions.today), "contributions", 1)}
  ${mobileMetric(191, 120, "LAST 7 DAYS", compact(stats.contributions.last7Days), "contributions", 2)}
  ${mobileMetric(20, 211, "LAST 30 DAYS", compact(stats.contributions.last30Days), `${signed(stats.contributions.momentumPercent)}% momentum`, 3)}
  ${mobileMetric(191, 211, "CURRENT STREAK", `${stats.contributions.currentStreak}d`, `best: ${stats.contributions.longestStreak365Days} days`, 4)}
  <text x="20" y="329" class="m-section">DAILY CONTRIBUTIONS · LAST 30 DAYS</text>
  <line x1="20" y1="476" x2="355" y2="476" stroke="${THEME.faint}"/>
  ${bars}
  <text x="20" y="494" class="m-note">${daily[0].date.slice(5)}</text><text x="355" y="494" text-anchor="end" class="m-note">${daily.at(-1).date.slice(5)}</text>
  <g transform="translate(20 520)">
    <rect width="335" height="151" rx="5" fill="${THEME.surface}" stroke="${THEME.border}"/>
    <text x="15" y="24" class="m-section">SHIPPING RHYTHM · 30 DAYS</text>
    <g transform="translate(15 47)"><text class="m-small-value" fill="${THEME.accent}">${stats.code.buildDays}/30</text><text y="19" class="m-small-label">build days</text></g>
    <g transform="translate(124 47)"><text class="m-small-value">${compact(stats.code.commitsAnalyzed)}</text><text y="19" class="m-small-label">unique commits</text></g>
    <g transform="translate(233 47)"><text class="m-small-value">${compact(stats.code.activeProducts)}</text><text y="19" class="m-small-label">active products</text></g>
    <g transform="translate(15 106)"><text class="m-small-value">${stats.code.commitsPerBuildDay.toFixed(1)}</text><text y="19" class="m-small-label">commits / build day</text></g>
    <g transform="translate(170 106)"><text class="m-small-value">${compact(stats.code.bulkCommitsExcluded)}</text><text y="19" class="m-small-label">bulk imports filtered</text></g>
  </g>
  <g transform="translate(20 686)">
    <rect width="335" height="105" rx="5" fill="${THEME.surface}" stroke="${THEME.border}"/>
    <text x="15" y="24" class="m-section">FOCUSED CODE · 30 DAYS</text>
    <g transform="translate(15 50)"><text class="m-small-value" fill="${THEME.accent}">+${compact(stats.code.additions)}</text><text y="19" class="m-small-label">lines added</text></g>
    <g transform="translate(130 50)"><text class="m-small-value">−${compact(stats.code.deletions)}</text><text y="19" class="m-small-label">lines removed</text></g>
    <g transform="translate(245 50)"><text class="m-small-value">${signed(stats.code.net)}</text><text y="19" class="m-small-label">net lines</text></g>
  </g>
  <text x="20" y="813" class="m-footer">Aggregate public + private activity · private work stays private</text>
</svg>`;
}

async function github(pathname, token, options = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "founder-progress-tracker/1.3.0",
      ...options.headers,
    },
  });
  if (response.status === 409) return [];
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${pathname}`);
  return response.json();
}

async function wakatime(pathname, apiKey) {
  const response = await fetch(`${WAKATIME_API}${pathname}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`,
      "User-Agent": "founder-progress-tracker/1.3.0",
    },
  });
  if (!response.ok) throw new Error(`WakaTime API ${response.status} for aggregate coding time`);
  return response.json();
}

async function fetchWakaTimeFocus(apiKey, today) {
  const fetchSummaries = async (days) => wakatime(`/users/current/summaries?start=${shiftDate(today, -(days - 1))}&end=${today}&timezone=${encodeURIComponent(TIMEZONE)}`, apiKey);
  let summaries;
  try {
    summaries = await fetchSummaries(30);
  } catch (error) {
    console.warn(`${error.message}; retrying the privacy-safe seven-day window.`);
    summaries = await fetchSummaries(7);
  }
  const lifetime = await wakatime("/users/current/all_time_since_today", apiKey);
  return {
    daily: (summaries.data || []).map((day) => ({
      date: day.range.date,
      seconds: Math.max(0, Math.round(day.grand_total?.total_seconds || 0)),
    })),
    lifetimeSeconds: Math.max(0, Math.round(lifetime.data?.total_seconds || 0)),
    accountStartedAt: lifetime.data?.range?.start_date || null,
  };
}

async function graphql(token, query, variables) {
  const payload = await github("/graphql", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (payload.errors?.length) throw new Error(`GitHub GraphQL: ${payload.errors.map((error) => error.message).join("; ")}`);
  return payload.data;
}

async function paginate(pathname, token, limitPages = 10) {
  const results = [];
  for (let page = 1; page <= limitPages; page += 1) {
    const separator = pathname.includes("?") ? "&" : "?";
    const batch = await github(`${pathname}${separator}per_page=100&page=${page}`, token);
    results.push(...batch);
    if (batch.length < 100) break;
  }
  return results;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function withRetry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError;
}

async function fetchContributionData(token, today) {
  const query = `query FounderProgress($login: String!, $yearFrom: DateTime!, $recentFrom: DateTime!, $to: DateTime!) {
    user(login: $login) {
      id
      createdAt
      year: contributionsCollection(from: $yearFrom, to: $to) {
        contributionCalendar { weeks { contributionDays { date contributionCount } } }
      }
      recent: contributionsCollection(from: $recentFrom, to: $to) {
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
      }
    }
  }`;
  const variables = {
    login: USERNAME,
    yearFrom: `${shiftDate(today, -365)}T00:00:00Z`,
    recentFrom: `${shiftDate(today, -29)}T00:00:00Z`,
    to: `${today}T23:59:59Z`,
  };
  const data = await graphql(token, query, variables);
  const user = data.user;
  if (!user) throw new Error(`GitHub user ${USERNAME} was not found`);
  return {
    authorId: user.id,
    accountCreatedAt: user.createdAt,
    calendarDays: user.year.contributionCalendar.weeks.flatMap((week) => week.contributionDays).map((day) => ({ date: day.date, count: day.contributionCount })),
    recent: {
      pullRequests: user.recent.totalPullRequestContributions,
      issues: user.recent.totalIssueContributions,
      reviews: user.recent.totalPullRequestReviewContributions,
    },
  };
}

async function fetchYearlyContributions(token, startYear, endYear) {
  const query = `query YearProgress($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
      }
    }
  }`;
  const years = Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
  return mapLimit(years, 4, async (year) => {
    const data = await graphql(token, query, {
      login: USERNAME,
      from: `${year}-01-01T00:00:00Z`,
      to: `${year}-12-31T23:59:59Z`,
    });
    const collection = data.user.contributionsCollection;
    const contributionDays = collection.contributionCalendar.weeks
      .flatMap((week) => week.contributionDays)
      .filter((day) => day.date.startsWith(`${year}-`));
    return {
      year,
      contributions: collection.contributionCalendar.totalContributions,
      activeDays: contributionDays.filter((day) => day.contributionCount > 0).length,
      longestStreak: longestStreak(contributionDays),
      pullRequests: collection.totalPullRequestContributions,
      issues: collection.totalIssueContributions,
      reviews: collection.totalPullRequestReviewContributions,
    };
  });
}

async function fetchRepositoryCommitHistory(token, repo, authorId, since, until) {
  const query = `query CodeHistory($owner: String!, $name: String!, $author: ID!, $since: GitTimestamp!, $until: GitTimestamp!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: 50, after: $cursor, author: {id: $author}, since: $since, until: $until) {
              nodes { oid additions deletions committedDate }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }
    }
  }`;
  const commits = [];
  let cursor = null;
  do {
    const data = await graphql(token, query, {
      owner: repo.owner.login,
      name: repo.name,
      author: authorId,
      since,
      until,
      cursor,
    });
    const history = data.repository?.defaultBranchRef?.target?.history;
    if (!history) break;
    commits.push(...history.nodes);
    cursor = history.pageInfo.hasNextPage ? history.pageInfo.endCursor : null;
  } while (cursor);
  return commits;
}

async function fetchCodeMovement(token, today, authorId, sinceDate) {
  // Query a small UTC buffer, then classify commits in the configured timezone.
  // This prevents commits around midnight in Bangkok from falling into the wrong day.
  const since = `${shiftDate(sinceDate, -1)}T00:00:00Z`;
  const until = `${shiftDate(today, 1)}T23:59:59Z`;
  const repositories = await paginate("/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc", token);
  // Inspect every eligible repository. REST `pushed_at` can be stale after transfers,
  // mirrors, and other history changes, so using it here silently dropped valid work.
  const candidates = repositories.filter((repo) => !repo.archived && repo.full_name !== `${USERNAME}/${USERNAME}`);
  let repositoriesSkipped = 0;
  const repositoryResults = await mapLimit(candidates, 4, async (repo) => {
    try {
      return { commits: await withRetry(() => fetchRepositoryCommitHistory(token, repo, authorId, since, until)) };
    } catch (error) {
      repositoriesSkipped += 1;
      console.warn(`Skipped one repository after retries: ${error.message}`);
      return { commits: [] };
    }
  });
  const seenOids = new Set();
  let duplicateCommitsExcluded = 0;
  const dailyMap = new Map();
  const repositoryYears = new Map();
  const recentStart = shiftDate(today, -29);
  let recentRepositoriesActive = 0;
  for (const result of repositoryResults) {
    const years = new Set();
    let recentActive = false;
    for (const commit of result.commits) {
      const date = localDate(new Date(commit.committedDate));
      if (date < sinceDate || date > today) continue;
      years.add(date.slice(0, 4));
      if (date >= recentStart) recentActive = true;
      if (seenOids.has(commit.oid)) {
        duplicateCommitsExcluded += 1;
        continue;
      }
      seenOids.add(commit.oid);
      const change = classifyCommitChange(commit);
      const current = dailyMap.get(date) || {
        date,
        additions: 0,
        deletions: 0,
        rawAdditions: 0,
        rawDeletions: 0,
        commits: 0,
        bulkCommitsExcluded: 0,
      };
      current.rawAdditions += change.rawAdditions;
      current.rawDeletions += change.rawDeletions;
      current.additions += change.additions;
      current.deletions += change.deletions;
      current.bulkCommitsExcluded += change.bulkCommitsExcluded;
      current.commits += 1;
      dailyMap.set(date, current);
    }
    if (recentActive) recentRepositoriesActive += 1;
    for (const year of years) repositoryYears.set(year, (repositoryYears.get(year) || 0) + 1);
  }
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    additions: sumBy(daily, "additions"),
    deletions: sumBy(daily, "deletions"),
    commits: sumBy(daily, "commits"),
    buildDays: daily.length,
    bulkCommitsExcluded: sumBy(daily, "bulkCommitsExcluded"),
    duplicateCommitsExcluded,
    recentRepositoriesActive,
    repositoryYearCounts: Object.fromEntries(repositoryYears),
    repositoriesAnalyzed: candidates.length - repositoriesSkipped,
    repositoriesSkipped,
    daily,
  };
}

async function loadHistory(root) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, "metrics", "history.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function loadFocusHistory(root) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, "metrics", "focus.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function mergeCodeHistory(existing, fresh, replaceFrom) {
  const byDate = new Map((existing || []).filter((day) => day.date < replaceFrom).map((day) => [day.date, day]));
  for (const day of fresh) byDate.set(day.date, day);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function summarizeHistory({ accountCreatedAt, yearlyContributions, codeDaily, generatedAt, repositoryYearCounts }) {
  return {
    version: 2,
    accountCreatedAt,
    generatedAt,
    privacy: "Aggregate yearly and daily totals only; repository identities are not stored.",
    yearly: yearlyContributions.map((year) => {
      const code = codeDaily.filter((day) => Number(day.date.slice(0, 4)) === year.year);
      const additions = sumBy(code, "additions");
      const deletions = sumBy(code, "deletions");
      const commits = sumBy(code, "commits");
      const buildDays = code.length;
      return {
        ...year,
        additions,
        deletions,
        changed: additions + deletions,
        net: additions - deletions,
        rawAdditions: sumBy(code, "rawAdditions"),
        rawDeletions: sumBy(code, "rawDeletions"),
        commits,
        buildDays,
        commitsPerBuildDay: buildDays ? Number((commits / buildDays).toFixed(1)) : 0,
        activeProducts: repositoryYearCounts?.[year.year] || 0,
        bulkCommitsExcluded: sumBy(code, "bulkCommitsExcluded"),
        collaborationSignals: year.pullRequests + year.issues + year.reviews,
      };
    }),
    codeDaily,
  };
}

function renderShareCopy(stats, focus) {
  const direction = stats.contributions.momentumPercent >= 0 ? "up" : "down";
  const focusLine = focus.connected ? `${hours(focus.summary.last30Seconds)} of active building time across ${focus.summary.activeDays30} focus days.\n` : "";
  return `Founder ship log — last 30 days\n\n${focusLine}${stats.contributions.last30Days} GitHub contributions across ${stats.code.buildDays}/30 build days.\n${stats.code.commitsAnalyzed} unique commits moved ${stats.code.activeProducts} products.\n${compact(stats.code.changed)} focused lines changed after filtering bulk imports.\n${stats.contributions.currentStreak}-day current streak · momentum ${direction} ${Math.abs(stats.contributions.momentumPercent)}%.\n\nBuilding AI-first SaaS in public.\nhttps://github.com/${USERNAME}\n`;
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.TRACKER_TOKEN;
  if (!token) throw new Error("Set GITHUB_TOKEN or TRACKER_TOKEN before generating metrics");
  const today = localDate();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const contributions = await fetchContributionData(token, today);
  const [existingHistory, existingFocus] = await Promise.all([loadHistory(root), loadFocusHistory(root)]);
  const accountStart = contributions.accountCreatedAt.slice(0, 10);
  const codeStart = existingHistory && process.env.BACKFILL_LIFETIME !== "1" ? `${today.slice(0, 4)}-01-01` : accountStart;
  const [yearlyContributions, codeResult] = await Promise.all([
    fetchYearlyContributions(token, Number(accountStart.slice(0, 4)), Number(today.slice(0, 4))),
    fetchCodeMovement(token, today, contributions.authorId, codeStart),
  ]);
  const codeDaily = mergeCodeHistory(existingHistory?.codeDaily, codeResult.daily, codeStart);
  const repositoryYearCounts = {
    ...(existingHistory?.repositoryYearCounts || {}),
    ...codeResult.repositoryYearCounts,
  };
  const history = summarizeHistory({
    accountCreatedAt: contributions.accountCreatedAt,
    yearlyContributions,
    codeDaily,
    generatedAt: today,
    repositoryYearCounts,
  });
  history.repositoryYearCounts = repositoryYearCounts;
  const recentCodeDays = codeDaily.filter((day) => day.date >= shiftDate(today, -29));
  const recentCode = {
    additions: sumBy(recentCodeDays, "additions"),
    deletions: sumBy(recentCodeDays, "deletions"),
    commits: sumBy(recentCodeDays, "commits"),
    buildDays: recentCodeDays.length,
    activeProducts: codeResult.recentRepositoriesActive,
    bulkCommitsExcluded: sumBy(recentCodeDays, "bulkCommitsExcluded"),
    duplicateCommitsExcluded: codeResult.duplicateCommitsExcluded,
    repositoriesAnalyzed: codeResult.repositoriesAnalyzed,
    repositoriesSkipped: codeResult.repositoriesSkipped,
  };
  const stats = computeStats({ ...contributions, code: recentCode, today });
  let wakaResult = null;
  const wakaKey = process.env.WAKATIME_API_KEY;
  if (wakaKey) {
    try {
      wakaResult = await withRetry(() => fetchWakaTimeFocus(wakaKey, today), 2);
    } catch (error) {
      console.warn(`${error.message}; preserving the last privacy-safe WakaTime snapshot.`);
    }
  }
  const focusDaily = mergeFocusHistory(existingFocus?.dailyHistory, wakaResult?.daily);
  const focus = buildFocusData({
    daily: focusDaily,
    today,
    lifetimeSeconds: wakaResult?.lifetimeSeconds ?? existingFocus?.summary?.lifetimeSeconds ?? null,
    accountStartedAt: wakaResult?.accountStartedAt ?? existingFocus?.trackedSince ?? null,
    commitsLast30: recentCode.commits,
  });
  stats.focus = {
    source: focus.source,
    connected: focus.connected,
    trackedSince: focus.trackedSince,
    ...focus.summary,
    privacy: focus.privacy,
  };
  const cadence = buildCadenceData({ calendarDays: contributions.calendarDays, codeDaily, focusDaily, today });
  cadence.yearly = buildYearlyCadence(history, focusDaily);
  const svg = renderSvg(stats);
  const mobileSvg = renderMobileSvg(stats);
  const dailySvg = renderCadenceSvg(cadence, "daily");
  const mobileDailySvg = renderMobileCadenceSvg(cadence, "daily");
  const weeklySvg = renderCadenceSvg(cadence, "weekly");
  const mobileWeeklySvg = renderMobileCadenceSvg(cadence, "weekly");
  const monthlySvg = renderCadenceSvg(cadence, "monthly");
  const mobileMonthlySvg = renderMobileCadenceSvg(cadence, "monthly");
  const yearlySvg = renderCadenceSvg(cadence, "yearly");
  const mobileYearlySvg = renderMobileCadenceSvg(cadence, "yearly");
  const lifetimeSvg = renderLifetimeSvg(history);
  const mobileLifetimeSvg = renderMobileLifetimeSvg(history);
  const focusSvg = renderFocusSvg(focus);
  const mobileFocusSvg = renderMobileFocusSvg(focus);
  await fs.mkdir(path.join(root, "assets"), { recursive: true });
  await fs.mkdir(path.join(root, "metrics"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(root, "assets", "founder-progress.svg"), svg),
    fs.writeFile(path.join(root, "assets", "founder-progress-mobile.svg"), mobileSvg),
    sharp(Buffer.from(svg)).png().toFile(path.join(root, "assets", "founder-progress.png")),
    fs.writeFile(path.join(root, "assets", "founder-daily.svg"), dailySvg),
    fs.writeFile(path.join(root, "assets", "founder-daily-mobile.svg"), mobileDailySvg),
    fs.writeFile(path.join(root, "assets", "founder-weekly.svg"), weeklySvg),
    fs.writeFile(path.join(root, "assets", "founder-weekly-mobile.svg"), mobileWeeklySvg),
    fs.writeFile(path.join(root, "assets", "founder-monthly.svg"), monthlySvg),
    fs.writeFile(path.join(root, "assets", "founder-monthly-mobile.svg"), mobileMonthlySvg),
    fs.writeFile(path.join(root, "assets", "founder-yearly.svg"), yearlySvg),
    fs.writeFile(path.join(root, "assets", "founder-yearly-mobile.svg"), mobileYearlySvg),
    fs.writeFile(path.join(root, "assets", "founder-lifetime.svg"), lifetimeSvg),
    fs.writeFile(path.join(root, "assets", "founder-lifetime-mobile.svg"), mobileLifetimeSvg),
    sharp(Buffer.from(lifetimeSvg)).png().toFile(path.join(root, "assets", "founder-lifetime.png")),
    fs.writeFile(path.join(root, "assets", "founder-focus.svg"), focusSvg),
    fs.writeFile(path.join(root, "assets", "founder-focus-mobile.svg"), mobileFocusSvg),
    fs.writeFile(path.join(root, "assets", "share-copy.txt"), renderShareCopy(stats, focus)),
    fs.writeFile(path.join(root, "metrics", "latest.json"), `${JSON.stringify(stats, null, 2)}\n`),
    fs.writeFile(path.join(root, "metrics", "cadence.json"), `${JSON.stringify(cadence, null, 2)}\n`),
    fs.writeFile(path.join(root, "metrics", "history.json"), `${JSON.stringify(history, null, 2)}\n`),
    fs.writeFile(path.join(root, "metrics", "focus.json"), `${JSON.stringify(focus, null, 2)}\n`),
  ]);
  console.log(`Generated privacy-safe GitHub and WakaTime progress assets through ${stats.period.end}.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
