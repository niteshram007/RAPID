#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_DIR="${APP_DIR:-/home/user/rapid/current}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/rapid}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
LOG_FILE="${LOG_FILE:-/var/log/rapid-db-backup.log}"

if [[ -n "${ENV_FILE:-}" ]]; then
  ENV_FILE="$ENV_FILE"
elif [[ -f "$APP_DIR/.env.local" ]]; then
  ENV_FILE="$APP_DIR/.env.local"
else
  ENV_FILE="$APP_DIR/.env"
fi

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

DB_URL="${RAPID_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "${DB_URL}" ]]; then
  echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') ERROR missing RAPID_DATABASE_URL/DATABASE_URL" >> "$LOG_FILE"
  exit 1
fi

timestamp="$(date -u +'%Y%m%d_%H%M%S')"
tmp_file="$(mktemp "${BACKUP_DIR}/rapid_${timestamp}.sql.gz.tmp.XXXXXX")"
final_file="${BACKUP_DIR}/rapid_${timestamp}.sql.gz"

echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') INFO backup start file=${final_file}" >> "$LOG_FILE"
if pg_dump --no-owner --format=plain "$DB_URL" | gzip -9 > "$tmp_file"; then
  mv "$tmp_file" "$final_file"
  chmod 600 "$final_file"
  sha256sum "$final_file" > "${final_file}.sha256"
  echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') INFO backup complete file=${final_file}" >> "$LOG_FILE"
else
  rm -f "$tmp_file"
  echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') ERROR backup failed" >> "$LOG_FILE"
  exit 1
fi

find "$BACKUP_DIR" -type f -name "rapid_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name "rapid_*.sql.gz.sha256" -mtime +"$RETENTION_DAYS" -delete
echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') INFO retention complete days=${RETENTION_DAYS}" >> "$LOG_FILE"
