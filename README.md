<div align="center">

# So — AI engineer

I build, launch, and measure AI products at founder speed.

<a href="https://github.com/sonozaki7/sonozaki7/blob/main/metrics/overview.json">
  <picture>
    <source media="(max-width: 800px)" srcset="./assets/overview-mobile.svg" />
    <img src="./assets/overview.svg" alt="Last 30 days: AI work hours, finished T3 Code tasks, active days, and GitHub contributions" width="100%" />
  </picture>
</a>

<sub>Last 30 days · Asia/Bangkok · refreshed automatically</sub>

</div>

## AI work clock

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-focus-mobile.svg" />
  <img src="./assets/founder-focus.svg" alt="AI agent work time measured by WakaTime across daily, weekly, monthly, yearly, and lifetime periods" width="100%" />
</picture>

<sub>Hours measured by WakaTime across Codex, T3 Code, and OpenCode · aggregate only</sub>

## Finished tasks

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-tasks-mobile.svg" />
  <img src="./assets/founder-tasks.svg" alt="Settled T3 Code task threads and completed agent runs counted by day, week, month, and hour" width="100%" />
</picture>

<sub>Tasks settled in T3 Code · counts only, never titles or project names</sub>

<details>
<summary>Daily, weekly, monthly, and yearly detail</summary>

### Daily · last 14 days

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-daily-mobile.svg" />
  <img src="./assets/founder-daily.svg" alt="Daily contributions, unique commits, focused lines, and net line movement for the last 14 days" width="100%" />
</picture>

### Weekly · last 12 weeks

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-weekly-mobile.svg" />
  <img src="./assets/founder-weekly.svg" alt="Weekly contributions, unique commits, build days, and focused lines for the last 12 weeks" width="100%" />
</picture>

### Monthly · last 12 months

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-monthly-mobile.svg" />
  <img src="./assets/founder-monthly.svg" alt="Monthly contributions, unique commits, build days, and focused lines for the last 12 months" width="100%" />
</picture>

### Yearly · account lifetime

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-yearly-mobile.svg" />
  <img src="./assets/founder-yearly.svg" alt="Yearly contributions, unique commits, build days, and focused lines across the account lifetime" width="100%" />
</picture>

</details>

<details>
<summary>Lifetime trend</summary>

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-lifetime-mobile.svg" />
  <img src="./assets/founder-lifetime.svg" alt="Lifetime yearly graphs for shipping days, streaks, commits, code movement, and collaboration" width="100%" />
</picture>

Year-by-year from account creation · giant 100k+ line imports are filtered so ordinary work stays visible.

</details>

<details>
<summary>Twelve-month operating review</summary>

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-progress-mobile.svg" />
  <img src="./assets/founder-progress.svg" alt="Month-by-month founder operating review for the last year with pace-adjusted comparisons" width="100%" />
</picture>

Month-by-month comparison · partial months are pace-adjusted.

</details>

## Monthly SaaS earnings

Only includes SaaS.

- 2024
  - Nov: 0 MRR
  - Dec: 0 MRR

- 2025
  - Jan: 0 MRR
  - Feb: 0 MRR
  - Mar: 0 MRR
  - Apr: 0 MRR
  - May: 0 MRR
  - Jun: 0 MRR
  - Jul: 170 MRR
  - Aug: 0 MRR
  - Sep: 0 MRR
  - Oct: 0 MRR
  - Nov: 0 MRR
  - Dec: 0 MRR

- 2026
  - Jan: 0 MRR
  - Feb:
  - Mar:
  - Apr:
  - May:
  - Jun:
  - Jul:
  - Aug:
  - Sep:
  - Oct:
  - Nov:
  - Dec:

- 2027
  - Jan:
  - Feb:
  - Mar:
  - Apr:
  - May:
  - Jun:
  - Jul:
  - Aug:
  - Sep:
  - Oct:
  - Nov:
  - Dec:

- 2028
  - Jan:
  - Feb:
  - Mar:
  - Apr:
  - May:
  - Jun:
  - Jul:
  - Aug:
  - Sep:
  - Oct:
  - Nov:
  - Dec:

<details>
<summary>How this tracker works</summary>

The tracker runs from this repository with a daily GitHub Action. It reads GitHub contribution totals and commit diff statistics, plus aggregate AI agent time from WakaTime, and produces the graphics above plus machine-readable [`overview.json`](./metrics/overview.json), [`latest.json`](./metrics/latest.json), [`cadence.json`](./metrics/cadence.json), [`history.json`](./metrics/history.json), [`focus.json`](./metrics/focus.json), and [`t3-summary.json`](./metrics/t3-summary.json). Private activity is included only in aggregate.

WakaTime is read through a private, read-only OAuth app rather than a personal API key, because WakaTime restricts personal keys to plugin endpoints. Only aggregate hours and AI session counts are stored.

Finished-task counts come from T3 Code's own settled-thread history, which lives only on the machine that runs it. A small local collector reads that database every 30 minutes and publishes only per-day counts.

Repository names, project names, task titles, prompts, file paths, branch names, commit messages, source code, editor or machine identities, and secrets are never written into the generated files.

Metrics include authored commits on the default branch of accessible, non-archived repositories. Lines changed are a momentum signal, not a quality score. Shipping useful product remains the goal.

</details>

<details>
<summary>Share the momentum</summary>

A social-ready [`founder-progress.png`](./assets/founder-progress.png) and [`share-copy.txt`](./assets/share-copy.txt) refresh with the daily build. Download both whenever you want to post the latest streak.

</details>
