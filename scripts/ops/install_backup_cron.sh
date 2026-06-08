#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="${1:-/home/user/rapid/current/scripts/ops/backup_postgres.sh}"
CRON_HOUR="${CRON_HOUR:-2}"
CRON_MINUTE="${CRON_MINUTE:-15}"

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "Backup script not found: $SCRIPT_PATH" >&2
  exit 1
fi

line="${CRON_MINUTE} ${CRON_HOUR} * * * ${SCRIPT_PATH}"

tmp="$(mktemp)"
crontab -l 2>/dev/null | grep -v "backup_postgres.sh" > "$tmp" || true
echo "$line" >> "$tmp"
crontab "$tmp"
rm -f "$tmp"

echo "Installed cron job:"
echo "$line"
