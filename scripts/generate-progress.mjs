import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const USERNAME = process.env.TRACKER_USERNAME || "sonozaki7";
const TIMEZONE = process.env.TRACKER_TIMEZONE || "Asia/Bangkok";
const API = "https://api.github.com";

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

function sumBy(items, key) {
  return items.reduce((total, item) => total + (item[key] || 0), 0);
}

function chartPanel({ x, y, width, height, title, values, years, color, format = compact, signedValues = false }) {
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
  const total = values.reduce((sum, value) => sum + value, 0);
  const circles = points.map((point, index) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5" fill="${color}"><title>${years[index]}: ${point.value.toLocaleString("en")}</title></circle>`).join("");

  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16" fill="#161b22" stroke="#30363d"/>
    <text x="${x + 20}" y="${y + 28}" class="history-label">${escapeXml(title)}</text>
    <text x="${x + width - 20}" y="${y + 29}" text-anchor="end" class="history-total">${escapeXml(format(total))}</text>
    <line x1="${chartLeft}" y1="${baselineY.toFixed(1)}" x2="${chartLeft + chartWidth}" y2="${baselineY.toFixed(1)}" stroke="#30363d"/>
    <path d="${area}" fill="${color}" opacity="0.12"/>
    <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${circles}
    <text x="${chartLeft}" y="${y + height - 12}" class="history-axis">${years[0]}</text>
    <text x="${chartLeft + chartWidth}" y="${y + height - 12}" text-anchor="end" class="history-axis">${years.at(-1)}</text>
  </g>`;
}

export function renderLifetimeSvg(history) {
  const years = history.yearly.map((item) => item.year);
  const metrics = [
    { title: "CONTRIBUTIONS", key: "contributions", color: "#58a6ff" },
    { title: "ACTIVE DAYS", key: "activeDays", color: "#3fb950" },
    { title: "LINES ADDED", key: "additions", color: "#3fb950" },
    { title: "LINES REMOVED", key: "deletions", color: "#f85149" },
    { title: "NET LINES · YEARLY", key: "net", color: "#a371f7", signedValues: true, latest: true },
    { title: "COMMITS ANALYZED", key: "commits", color: "#d29922" },
    { title: "PULL REQUESTS", key: "pullRequests", color: "#2f81f7" },
    { title: "ISSUES", key: "issues", color: "#db61a2" },
    { title: "REVIEWS", key: "reviews", color: "#a371f7" },
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
    format: metric.signedValues ? signed : compact,
  })).join("\n");
  const lifetimeContributions = sumBy(history.yearly, "contributions");
  const linesChanged = sumBy(history.yearly, "additions") + sumBy(history.yearly, "deletions");
  const commits = sumBy(history.yearly, "commits");
  const activeDays = sumBy(history.yearly, "activeDays");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="880" viewBox="0 0 1200 880" role="img" aria-labelledby="title desc">
  <title id="title">So's lifetime founder operating history</title>
  <desc id="desc">Yearly contribution, code movement, commit, pull request, issue, review, and active-day trends from GitHub account creation.</desc>
  <defs>
    <linearGradient id="history-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0d1117"/><stop offset="1" stop-color="#111827"/></linearGradient>
    <linearGradient id="history-line" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#a371f7"/><stop offset="0.5" stop-color="#2f81f7"/><stop offset="1" stop-color="#3fb950"/></linearGradient>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: #f0f6fc; }
      .history-eyebrow { font-size: 15px; font-weight: 700; letter-spacing: 2.4px; fill: #a371f7; }
      .history-title { font-size: 38px; font-weight: 750; }
      .history-subtitle { font-size: 15px; fill: #8b949e; }
      .history-label { font-size: 12px; font-weight: 700; letter-spacing: 1.2px; fill: #8b949e; }
      .history-total { font-size: 22px; font-weight: 750; }
      .history-axis { font-size: 11px; fill: #6e7681; }
      .headline-number { font-size: 27px; font-weight: 750; }
      .headline-label { font-size: 11px; fill: #8b949e; letter-spacing: 0.7px; }
      .history-footer { font-size: 12px; fill: #6e7681; }
    </style>
  </defs>
  <rect x="1" y="1" width="1198" height="878" rx="24" fill="url(#history-bg)" stroke="#30363d" stroke-width="2"/>
  <rect x="28" y="24" width="1144" height="4" rx="2" fill="url(#history-line)"/>
  <text x="52" y="64" class="history-eyebrow">FOUNDER OPERATING HISTORY</text>
  <text x="52" y="106" class="history-title">Lifetime momentum, year by year</text>
  <text x="52" y="134" class="history-subtitle">${escapeXml(history.accountCreatedAt.slice(0, 4))} → ${escapeXml(String(years.at(-1)))} · every chart has its own scale so the trend stays honest</text>
  <g transform="translate(52 158)"><text class="headline-number">${compact(lifetimeContributions)}</text><text y="22" class="headline-label">CONTRIBUTIONS</text></g>
  <g transform="translate(287 158)"><text class="headline-number">${compact(linesChanged)}</text><text y="22" class="headline-label">LINES CHANGED</text></g>
  <g transform="translate(522 158)"><text class="headline-number">${compact(commits)}</text><text y="22" class="headline-label">COMMITS ANALYZED</text></g>
  <g transform="translate(757 158)"><text class="headline-number">${compact(activeDays)}</text><text y="22" class="headline-label">ACTIVE DAYS</text></g>
  <g transform="translate(992 158)"><text class="headline-number">${years.length}</text><text y="22" class="headline-label">YEARS TRACKED</text></g>
  ${panels}
  <text x="52" y="852" class="history-footer">Contribution history: GitHub calendar · line history: authored commits on accessible default branches · aggregate only</text>
</svg>`;
}

function metricCard(x, y, label, value, note, accent = "#2f81f7") {
  return `<g transform="translate(${x} ${y})">
    <rect width="270" height="104" rx="16" fill="#161b22" stroke="#30363d"/>
    <rect x="0" y="0" width="5" height="104" rx="3" fill="${accent}"/>
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
    const color = day.count === 0 ? "#30363d" : day.count >= max * 0.67 ? "#3fb950" : day.count >= max * 0.34 ? "#2f81f7" : "#58a6ff";
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="5" fill="${color}"><title>${day.date}: ${day.count} contributions</title></rect>`;
  }).join("\n");
  const labels = daily.map((day, index) => {
    if (index !== 0 && index !== daily.length - 1 && index % 5 !== 0) return "";
    const x = graphX + index * (barWidth + gap) + barWidth / 2;
    return `<text x="${x}" y="482" text-anchor="middle" class="axis">${day.date.slice(5)}</text>`;
  }).join("\n");
  const momentumColor = stats.contributions.momentumPercent >= 0 ? "#3fb950" : "#f85149";
  const momentumText = `${signed(stats.contributions.momentumPercent)}% vs previous 30 days`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680" viewBox="0 0 1200 680" role="img" aria-labelledby="title desc">
  <title id="title">So's 30-day founder build velocity</title>
  <desc id="desc">Daily contribution streak, code movement, and collaboration totals. Aggregate public and private activity without repository names.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0d1117"/><stop offset="1" stop-color="#111827"/></linearGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#2f81f7"/><stop offset="0.55" stop-color="#a371f7"/><stop offset="1" stop-color="#3fb950"/></linearGradient>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: #f0f6fc; }
      .eyebrow { font-size: 15px; font-weight: 700; letter-spacing: 2.4px; fill: #58a6ff; }
      .title { font-size: 39px; font-weight: 750; }
      .subtitle { font-size: 16px; fill: #8b949e; }
      .label { font-size: 13px; font-weight: 700; letter-spacing: 1.3px; fill: #8b949e; }
      .value { font-size: 31px; font-weight: 750; }
      .note { font-size: 13px; fill: #8b949e; }
      .section { font-size: 14px; font-weight: 700; letter-spacing: 1.6px; fill: #8b949e; }
      .axis { font-size: 11px; fill: #6e7681; }
      .mini-value { font-size: 24px; font-weight: 700; }
      .mini-label { font-size: 12px; fill: #8b949e; }
      .footer { font-size: 12px; fill: #6e7681; }
    </style>
  </defs>
  <rect x="1" y="1" width="1198" height="678" rx="24" fill="url(#bg)" stroke="#30363d" stroke-width="2"/>
  <rect x="28" y="24" width="1144" height="4" rx="2" fill="url(#line)"/>
  <text x="52" y="64" class="eyebrow">FOUNDER SHIP LOG</text>
  <text x="52" y="108" class="title">30-day build velocity</text>
  <text x="52" y="137" class="subtitle">AI-first SaaS · progress measured in consistent shipping, not vanity</text>
  <g transform="translate(925 53)">
    <rect width="220" height="38" rx="19" fill="#122b1a" stroke="#238636"/>
    <circle cx="20" cy="19" r="5" fill="#3fb950"/>
    <text x="34" y="24" font-size="13" fill="#7ee787">UPDATED ${escapeXml(stats.period.end)}</text>
  </g>

  ${metricCard(52, 168, "TODAY", compact(stats.contributions.today), "contributions", "#3fb950")}
  ${metricCard(340, 168, "LAST 7 DAYS", compact(stats.contributions.last7Days), "contributions", "#2f81f7")}
  ${metricCard(628, 168, "LAST 30 DAYS", compact(stats.contributions.last30Days), momentumText, momentumColor)}
  ${metricCard(916, 168, "CURRENT STREAK", `${stats.contributions.currentStreak}d`, `best: ${stats.contributions.longestStreak365Days} days`, "#a371f7")}

  <text x="52" y="317" class="section">DAILY CONTRIBUTIONS · LAST 30 DAYS</text>
  <line x1="52" y1="456" x2="1148" y2="456" stroke="#21262d"/>
  ${bars}
  ${labels}

  <g transform="translate(52 520)">
    <rect width="706" height="112" rx="16" fill="#161b22" stroke="#30363d"/>
    <text x="22" y="29" class="section">CODE MOVEMENT · 30 DAYS</text>
    <g transform="translate(22 49)"><text class="mini-value" fill="#3fb950">+${compact(stats.code.additions)}</text><text y="27" class="mini-label">lines added</text></g>
    <g transform="translate(160 49)"><text class="mini-value" fill="#f85149">−${compact(stats.code.deletions)}</text><text y="27" class="mini-label">lines removed</text></g>
    <g transform="translate(298 49)"><text class="mini-value">${signed(stats.code.net)}</text><text y="27" class="mini-label">net lines</text></g>
    <g transform="translate(436 49)"><text class="mini-value">${compact(stats.code.commitsAnalyzed)}</text><text y="27" class="mini-label">commits analyzed</text></g>
    <g transform="translate(574 49)"><text class="mini-value">${compact(stats.code.averageChangedPerCommit)}</text><text y="27" class="mini-label">avg change / commit</text></g>
  </g>

  <g transform="translate(776 520)">
    <rect width="372" height="112" rx="16" fill="#161b22" stroke="#30363d"/>
    <text x="22" y="29" class="section">SHIP SIGNALS · 30 DAYS</text>
    <g transform="translate(22 49)"><text class="mini-value">${stats.contributions.activeDays}/30</text><text y="27" class="mini-label">active days</text></g>
    <g transform="translate(143 49)"><text class="mini-value">${compact(stats.collaboration.pullRequests)}</text><text y="27" class="mini-label">pull requests</text></g>
    <g transform="translate(263 49)"><text class="mini-value">${compact(stats.collaboration.reviews)}</text><text y="27" class="mini-label">reviews</text></g>
  </g>
  <text x="52" y="660" class="footer">Aggregate public + private activity · private repositories and source remain private · Asia/Bangkok</text>
</svg>`;
}

async function github(pathname, token, options = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "founder-progress-tracker/1.0.1",
      ...options.headers,
    },
  });
  if (response.status === 409) return [];
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${pathname}`);
  return response.json();
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
        contributionCalendar { totalContributions weeks { contributionDays { contributionCount } } }
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
    const contributionDays = collection.contributionCalendar.weeks.flatMap((week) => week.contributionDays);
    return {
      year,
      contributions: collection.contributionCalendar.totalContributions,
      activeDays: contributionDays.filter((day) => day.contributionCount > 0).length,
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
            history(first: 100, after: $cursor, author: {id: $author}, since: $since, until: $until) {
              nodes { additions deletions committedDate }
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
  const candidates = repositories.filter((repo) => !repo.archived && repo.full_name !== `${USERNAME}/${USERNAME}` && repo.pushed_at >= since);
  let repositoriesSkipped = 0;
  const commitLists = await mapLimit(candidates, 4, async (repo) => {
    try {
      return await fetchRepositoryCommitHistory(token, repo, authorId, since, until);
    } catch {
      repositoriesSkipped += 1;
      return [];
    }
  });
  const commits = commitLists.flat();
  const dailyMap = new Map();
  for (const commit of commits) {
    const date = localDate(new Date(commit.committedDate));
    if (date < sinceDate || date > today) continue;
    const current = dailyMap.get(date) || { date, additions: 0, deletions: 0, commits: 0 };
    current.additions += commit.additions || 0;
    current.deletions += commit.deletions || 0;
    current.commits += 1;
    dailyMap.set(date, current);
  }
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    additions: sumBy(daily, "additions"),
    deletions: sumBy(daily, "deletions"),
    commits: sumBy(daily, "commits"),
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

function mergeCodeHistory(existing, fresh, replaceFrom) {
  const byDate = new Map((existing || []).filter((day) => day.date < replaceFrom).map((day) => [day.date, day]));
  for (const day of fresh) byDate.set(day.date, day);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function summarizeHistory({ accountCreatedAt, yearlyContributions, codeDaily, generatedAt }) {
  return {
    version: 1,
    accountCreatedAt,
    generatedAt,
    privacy: "Aggregate yearly and daily totals only; repository identities are not stored.",
    yearly: yearlyContributions.map((year) => {
      const code = codeDaily.filter((day) => Number(day.date.slice(0, 4)) === year.year);
      const additions = sumBy(code, "additions");
      const deletions = sumBy(code, "deletions");
      return {
        ...year,
        additions,
        deletions,
        net: additions - deletions,
        commits: sumBy(code, "commits"),
      };
    }),
    codeDaily,
  };
}

function renderShareCopy(stats) {
  const direction = stats.contributions.momentumPercent >= 0 ? "up" : "down";
  return `Founder ship log — last 30 days\n\n${stats.contributions.last30Days} GitHub contributions across ${stats.contributions.activeDays}/30 active days.\n${compact(stats.code.changed)} lines changed across ${stats.code.commitsAnalyzed} commits analyzed.\n${stats.contributions.currentStreak}-day current streak · momentum ${direction} ${Math.abs(stats.contributions.momentumPercent)}%.\n\nBuilding AI-first SaaS in public.\nhttps://github.com/${USERNAME}\n`;
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.TRACKER_TOKEN;
  if (!token) throw new Error("Set GITHUB_TOKEN or TRACKER_TOKEN before generating metrics");
  const today = localDate();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const contributions = await fetchContributionData(token, today);
  const existingHistory = await loadHistory(root);
  const accountStart = contributions.accountCreatedAt.slice(0, 10);
  const codeStart = existingHistory && process.env.BACKFILL_LIFETIME !== "1" ? shiftDate(today, -29) : accountStart;
  const [yearlyContributions, codeResult] = await Promise.all([
    fetchYearlyContributions(token, Number(accountStart.slice(0, 4)), Number(today.slice(0, 4))),
    fetchCodeMovement(token, today, contributions.authorId, codeStart),
  ]);
  const codeDaily = mergeCodeHistory(existingHistory?.codeDaily, codeResult.daily, codeStart);
  const history = summarizeHistory({
    accountCreatedAt: contributions.accountCreatedAt,
    yearlyContributions,
    codeDaily,
    generatedAt: today,
  });
  const recentCodeDays = codeDaily.filter((day) => day.date >= shiftDate(today, -29));
  const recentCode = {
    additions: sumBy(recentCodeDays, "additions"),
    deletions: sumBy(recentCodeDays, "deletions"),
    commits: sumBy(recentCodeDays, "commits"),
    repositoriesAnalyzed: codeResult.repositoriesAnalyzed,
    repositoriesSkipped: codeResult.repositoriesSkipped,
  };
  const stats = computeStats({ ...contributions, code: recentCode, today });
  const svg = renderSvg(stats);
  const lifetimeSvg = renderLifetimeSvg(history);
  await fs.mkdir(path.join(root, "assets"), { recursive: true });
  await fs.mkdir(path.join(root, "metrics"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(root, "assets", "founder-progress.svg"), svg),
    sharp(Buffer.from(svg)).png().toFile(path.join(root, "assets", "founder-progress.png")),
    fs.writeFile(path.join(root, "assets", "founder-lifetime.svg"), lifetimeSvg),
    sharp(Buffer.from(lifetimeSvg)).png().toFile(path.join(root, "assets", "founder-lifetime.png")),
    fs.writeFile(path.join(root, "assets", "share-copy.txt"), renderShareCopy(stats)),
    fs.writeFile(path.join(root, "metrics", "latest.json"), `${JSON.stringify(stats, null, 2)}\n`),
    fs.writeFile(path.join(root, "metrics", "history.json"), `${JSON.stringify(history, null, 2)}\n`),
  ]);
  console.log(`Generated privacy-safe 30-day and lifetime progress assets through ${stats.period.end}.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
