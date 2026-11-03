<div align="center">

# So — AI-first SaaS founder

I build, launch, measure, and iterate on AI products at founder speed.

<a href="https://github.com/sonozaki7/sonozaki7/blob/main/metrics/latest.json">
  <picture>
    <source media="(max-width: 800px)" srcset="./assets/founder-progress-mobile.svg" />
    <img src="./assets/founder-progress.svg" alt="So's twelve-month founder operating review with monthly workflow comparisons, exact progress signals, and practical guidance" width="100%" />
  </picture>
</a>

<sub>Month-by-month comparison for the last year · pace-adjusted guidance for partial months · updates daily at 00:10 Asia/Bangkok</sub>

</div>

## Finished tasks · powered by T3 Code

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-tasks-mobile.svg" />
  <img src="./assets/founder-tasks.svg" alt="Exact counts of settled T3 Code task threads and completed agent runs per day, week, month, and hour of day" width="100%" />
</picture>

<sub>Settled task threads and completed agent runs, counted by day, week, month, and hour · task titles, prompts, and project names stay private · updates hourly while the machine is awake</sub>

## AI work clock · powered by WakaTime

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-focus-mobile.svg" />
  <img src="./assets/founder-focus.svg" alt="Privacy-safe AI agent work time with exact daily, weekly, monthly, yearly, and lifetime WakaTime trends plus AI session counts" width="100%" />
</picture>

<sub>AI agent time recorded by WakaTime across Codex, T3 Code, and OpenCode sessions · project, repository, file, editor, and machine names stay private</sub>

## Daily detail · last 14 days

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-daily-mobile.svg" />
  <img src="./assets/founder-daily.svg" alt="Exact daily contributions, unique commits, focused lines, and net line movement for the last 14 days" width="100%" />
</picture>

## Weekly detail · last 12 weeks

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-weekly-mobile.svg" />
  <img src="./assets/founder-weekly.svg" alt="Exact weekly contributions, unique commits, build days, and focused lines for the last 12 weeks" width="100%" />
</picture>

## Monthly detail · last 12 months

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-monthly-mobile.svg" />
  <img src="./assets/founder-monthly.svg" alt="Exact monthly contributions, unique commits, build days, and focused lines for the last 12 calendar months" width="100%" />
</picture>

## Yearly detail · account lifetime

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-yearly-mobile.svg" />
  <img src="./assets/founder-yearly.svg" alt="Exact yearly contributions, unique commits, build days, and focused lines across the lifetime of the account" width="100%" />
</picture>

## Lifetime trend overview

<picture>
  <source media="(max-width: 800px)" srcset="./assets/founder-lifetime-mobile.svg" />
  <img src="./assets/founder-lifetime.svg" alt="Lifetime yearly graphs for shipping days, streaks, unique commits, focused code movement, pull requests, issues, and reviews" width="100%" />
</picture>

<sub>Year-by-year history from account creation · giant 100k+ line imports are filtered so ordinary shipping work stays visible</sub>

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

## Share the momentum

The workflow also refreshes a social-ready [`founder-progress.png`](./assets/founder-progress.png) and [`share-copy.txt`](./assets/share-copy.txt). Download both whenever you want to post the latest build streak on X.

<details>
<summary>How this tracker works</summary>

The tracker runs from this repository with a daily GitHub Action. It reads GitHub contribution totals and commit diff statistics, plus aggregate AI agent time from WakaTime. It then produces the profile graphics and machine-readable [`latest.json`](./metrics/latest.json), [`cadence.json`](./metrics/cadence.json), [`history.json`](./metrics/history.json), [`focus.json`](./metrics/focus.json), and [`t3-summary.json`](./metrics/t3-summary.json). Private activity is included only in aggregate. Repository names, project names, file paths, branch names, commit messages, source code, editor or machine identities, and secrets are never written into the generated files or retained in tracker history.

WakaTime is read through a private, read-only OAuth app rather than a personal API key, because WakaTime restricts personal keys to plugin endpoints. Only aggregate hours and AI session counts are stored; project, file, editor, and machine names are discarded before anything is written.

Finished-task counts come from T3 Code's own settled-thread history, which lives only on the machine that runs it. A small local collector reads that database every 30 minutes, reduces it to per-day counts, provider names, and local hour buckets, and publishes only the aggregate ledger as [`t3-tasks.json`](./metrics/t3-tasks.json). The GitHub Action renders the card from that committed ledger, so the public record survives reinstalls and database resets.


The public tracker emphasizes shipping consistency, unique commits, active-product breadth, and focused code movement. It deduplicates identical commits and filters individual 100k+ line imports or generated snapshots from line totals so a handful of bulk operations cannot dominate years of ordinary work. Those commits still count as commits.

Metrics include authored commits from accessible, non-archived repositories on each repository's default branch. Unpushed work and commits that only exist on other branches are not included.

Lines changed are a momentum signal, not a quality score. Shipping useful product remains the goal.

WakaTime history starts when tracking is connected. It measures active editor time, not product quality, customer value, or time spent outside supported editors.

</details>
