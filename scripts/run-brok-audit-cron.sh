#!/usr/bin/env zsh
set -euo pipefail

cd /Users/animesh/.superset/projects/broksearch

export PATH="/opt/homebrew/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export BROK_AUDIT_BASE_URL="${BROK_AUDIT_BASE_URL:-https://www.brok.fyi}"
export BROK_AUDIT_DOCS_URL="${BROK_AUDIT_DOCS_URL:-https://docs.brok.fyi}"
export BROK_AUDIT_DIR="${BROK_AUDIT_DIR:-.brok-audits}"
export BROK_AUDIT_RAILWAY="${BROK_AUDIT_RAILWAY:-true}"
export BROK_AUDIT_UNTIL="${BROK_AUDIT_UNTIL:-2026-05-20T09:00:00-07:00}"

mkdir -p "$BROK_AUDIT_DIR"

now_epoch="$(date +%s)"
until_epoch="$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "${BROK_AUDIT_UNTIL/-07:00/-0700}" +%s 2>/dev/null || echo 0)"

if [[ "$until_epoch" != "0" && "$now_epoch" -gt "$until_epoch" ]]; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") audit window ended at $BROK_AUDIT_UNTIL" >> "$BROK_AUDIT_DIR/cron.log"
  exit 0
fi

lock_dir="$BROK_AUDIT_DIR/.lock"
if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") previous audit still running" >> "$BROK_AUDIT_DIR/cron.log"
  exit 0
fi

cleanup() {
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT

started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "$started_at audit start" >> "$BROK_AUDIT_DIR/cron.log"

if bun x --yes tsx --env-file=.env.local scripts/audit-brok-platform.ts >> "$BROK_AUDIT_DIR/cron.log" 2>&1; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") audit pass" >> "$BROK_AUDIT_DIR/cron.log"
else
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") audit fail; see $BROK_AUDIT_DIR/latest.md" >> "$BROK_AUDIT_DIR/cron.log"
fi
