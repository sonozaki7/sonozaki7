#!/usr/bin/env bash
# Refresh the local T3 Code task ledger and publish it to the profile repo.
# Designed to run unattended from a macOS launch agent every 30 minutes.
set -euo pipefail

REPO="${T3_TRACKER_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
NODE="$HOME/.local/bin/node"
DATABASE="$HOME/.t3/userdata/statev2.sqlite"

cd "$REPO"

# Pick up the newest collector and assets before running. Offline is fine; the
# locally installed copy still works.
git pull --rebase --autostash --quiet origin main >/dev/null 2>&1 || true

if [ ! -x "$NODE" ]; then
  echo "node not found at $NODE" >&2
  exit 1
fi
if [ ! -f "$DATABASE" ]; then
  echo "T3 database not found at $DATABASE" >&2
  exit 1
fi

"$NODE" scripts/collect-t3.mjs --quiet

if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "not on main; leaving the ledger uncommitted" >&2
  exit 0
fi

git add -- metrics/t3-tasks.json
if git diff --cached --quiet -- metrics/t3-tasks.json; then
  exit 0
fi

git -c user.name="so" -c user.email="38685480+sonozaki7@users.noreply.github.com" \
  commit -m "chore: refresh T3 task metrics" -- metrics/t3-tasks.json
git pull --rebase --autostash --quiet origin main
git push --quiet origin main

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh workflow run founder-progress.yml --ref main >/dev/null 2>&1 || true
fi

echo "T3 task ledger published $(date '+%Y-%m-%d %H:%M:%S')"
