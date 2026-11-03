import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TIMEZONE = process.env.TRACKER_TIMEZONE || "Asia/Bangkok";
const SQLITE = "/usr/bin/sqlite3";
const DEFAULT_DATABASE = path.join(os.homedir(), ".t3", "userdata", "statev2.sqlite");

const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const HOUR_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  hourCycle: "h23",
});

export const PRIVACY =
  "Per-day task and agent-run counts with provider names and local hour buckets only; thread titles, prompts, project names, repository names, file paths, branches, and message content are never read or stored.";

function localParts(timestamp) {
  if (!timestamp) return null;
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return null;
  const parts = Object.fromEntries(
    DATE_FORMATTER.formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(HOUR_FORMATTER.format(value)),
  };
}

function emptyDay() {
  return {
    tasks: 0,
    runs: 0,
    providers: {},
    runProviders: {},
    hours: Array.from({ length: 24 }, () => 0),
  };
}

function dayBucket(days, date) {
  if (!days[date]) days[date] = emptyDay();
  return days[date];
}

function increment(counts, key, amount = 1) {
  if (!key) return;
  counts[key] = (counts[key] || 0) + amount;
}

function readRows(database, sql) {
  const output = execFileSync(SQLITE, ["-readonly", "-json", database, sql], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return output ? JSON.parse(output) : [];
}

export function readTaskEvents(database = DEFAULT_DATABASE) {
  const settled = readRows(
    database,
    `SELECT thread_id AS id,
            default_provider AS provider,
            json_extract(payload_json, '$.settledAt') AS settled_at
       FROM orchestration_v2_projection_threads
      WHERE json_extract(payload_json, '$.settledAt') IS NOT NULL`,
  );
  const runs = readRows(
    database,
    `SELECT run_id AS id,
            provider AS provider,
            completed_at AS completed_at
       FROM orchestration_v2_projection_runs
      WHERE status = 'completed' AND completed_at IS NOT NULL`,
  );
  return {
    tasks: settled.map((row) => ({ id: row.id, provider: row.provider, at: row.settled_at })),
    runs: runs.map((row) => ({ id: row.id, provider: row.provider, at: row.completed_at })),
  };
}

export function summarizeEvents(events) {
  const days = {};
  for (const task of events.tasks || []) {
    const local = localParts(task.at);
    if (!local) continue;
    const bucket = dayBucket(days, local.date);
    bucket.tasks += 1;
    increment(bucket.providers, task.provider || "unknown");
    bucket.hours[local.hour] += 1;
  }
  for (const run of events.runs || []) {
    const local = localParts(run.at);
    if (!local) continue;
    const bucket = dayBucket(days, local.date);
    bucket.runs += 1;
    increment(bucket.runProviders, run.provider || "unknown");
  }
  return days;
}

export function mergeLedger(existing, freshDays, today) {
  const merged = { ...(existing?.days || {}) };
  for (const [date, value] of Object.entries(freshDays || {})) {
    merged[date] = {
      tasks: value.tasks || 0,
      runs: value.runs || 0,
      providers: { ...(value.providers || {}) },
      runProviders: { ...(value.runProviders || {}) },
      hours: Array.from({ length: 24 }, (_, hour) => (value.hours || [])[hour] || 0),
    };
  }
  const ordered = {};
  for (const date of Object.keys(merged).sort()) ordered[date] = merged[date];
  const dates = Object.keys(ordered);
  return {
    version: 1,
    source: "T3 Code",
    timezone: TIMEZONE,
    generatedAt: today,
    firstRecordedAt: dates[0] || null,
    lastRecordedAt: dates.at(-1) || null,
    privacy: PRIVACY,
    days: ordered,
  };
}

export function summarizeLedger(ledger) {
  const entries = Object.entries(ledger?.days || {});
  const tasks = entries.reduce((total, [, day]) => total + (day.tasks || 0), 0);
  const runs = entries.reduce((total, [, day]) => total + (day.runs || 0), 0);
  const activeDays = entries.filter(([, day]) => (day.tasks || 0) > 0).length;
  const best = entries.reduce((winner, [date, day]) => {
    const count = day.tasks || 0;
    if (!winner || count >= winner.tasks) return { date, tasks: count };
    return winner;
  }, null);
  return {
    tasks,
    runs,
    activeDays,
    firstRecordedAt: ledger?.firstRecordedAt || null,
    lastRecordedAt: ledger?.lastRecordedAt || null,
    bestDay: best && best.tasks > 0 ? best : null,
  };
}

export async function collect({ database = DEFAULT_DATABASE, root, today, write = true, quiet = false } = {}) {
  const repoRoot = root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const day = today || localParts(new Date().toISOString()).date;
  const metricsDir = path.join(repoRoot, "metrics");
  const target = path.join(metricsDir, "t3-tasks.json");
  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(target, "utf8"));
  } catch {
    existing = null;
  }
  const events = readTaskEvents(database);
  const freshDays = summarizeEvents(events);
  const ledger = mergeLedger(existing, freshDays, day);
  const summary = summarizeLedger(ledger);
  if (write) {
    await fs.mkdir(metricsDir, { recursive: true });
    const temporary = `${target}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`);
    await fs.rename(temporary, target);
  }
  if (!quiet) {
    console.log(
      `T3 tasks: ${summary.tasks} settled · ${summary.runs} completed runs · ${summary.activeDays} active days · since ${summary.firstRecordedAt || "—"}`,
    );
  }
  return { ledger, summary };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--quiet") options.quiet = true;
    else if (value === "--dry-run") options.write = false;
    else if (value === "--db") options.database = argv[++index];
    else if (value === "--root") options.root = argv[++index];
    else if (value === "--today") options.today = argv[++index];
  }
  return options;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  collect(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(`T3 collection failed: ${error.message}`);
    process.exitCode = 1;
  });
}
