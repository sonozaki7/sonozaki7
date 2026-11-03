#!/usr/bin/env bash
# Install a macOS launch agent that keeps the T3 Code task ledger in sync.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.qolso.t3-task-tracker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/t3-task-tracker.log"
INTERVAL="${T3_TRACKER_INTERVAL:-1800}"
TRACKER_HOME="${T3_TRACKER_HOME:-$HOME/.local/share/t3-task-tracker}"

# macOS blocks background jobs from reading Desktop and Documents, so the launch
# agent publishes from a small self-updating clone outside those protected folders.
if [ ! -d "$TRACKER_HOME/.git" ]; then
  mkdir -p "$(dirname "$TRACKER_HOME")"
  git clone --quiet https://github.com/sonozaki7/sonozaki7.git "$TRACKER_HOME"
else
  git -C "$TRACKER_HOME" pull --rebase --autostash --quiet origin main >/dev/null 2>&1 || true
fi

chmod +x "$REPO/scripts/sync-t3.sh" "$TRACKER_HOME/scripts/sync-t3.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<PLIST_END
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$TRACKER_HOME/scripts/sync-t3.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$TRACKER_HOME</string>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST_END

launchctl bootout "gui/$UID" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
launchctl enable "gui/$UID/$LABEL"

echo "Installed $LABEL"
echo "  runs every $((INTERVAL / 60)) minutes from $TRACKER_HOME/scripts/sync-t3.sh"
echo "  source checkout stays at $REPO"
echo "  log: $LOG"
echo "Remove with: launchctl bootout gui/$UID \"$PLIST\" && rm \"$PLIST\""
