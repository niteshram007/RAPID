#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${APP_ROOT:-/home/user/rapid/current}"
FRONTEND_ENV="${FRONTEND_ENV:-/home/user/rapid/shared/frontend.env}"
BACKEND_ENV="${BACKEND_ENV:-/home/user/rapid/shared/backend.env}"
FRONTEND_PM2_APP="${FRONTEND_PM2_APP:-rapid-frontend}"
BACKEND_PM2_APP="${BACKEND_PM2_APP:-rapid-backend}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://127.0.0.1:8000/api/health}"

if [[ ! -f "$FRONTEND_ENV" ]]; then
  echo "Missing frontend env file: $FRONTEND_ENV" >&2
  exit 1
fi

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "Missing backend env file: $BACKEND_ENV" >&2
  exit 1
fi

if [[ -z "${NEXT_DEPLOYMENT_ID:-}" ]]; then
  NEXT_DEPLOYMENT_ID="rapid-$(date +%Y%m%d%H%M%S)"
fi
export NEXT_DEPLOYMENT_ID

frontend_secret="$(grep -E '^RAPID_BACKEND_SHARED_SECRET=' "$FRONTEND_ENV" | tail -n1 | cut -d= -f2- || true)"
backend_secret="$(grep -E '^RAPID_BACKEND_SHARED_SECRET=' "$BACKEND_ENV" | tail -n1 | cut -d= -f2- || true)"
if [[ -n "$frontend_secret" || -n "$backend_secret" ]]; then
  if [[ "$frontend_secret" != "$backend_secret" ]]; then
    echo "Shared secret mismatch between frontend and backend env files." >&2
    exit 1
  fi
fi

if grep -qE '^NEXT_DEPLOYMENT_ID=' "$FRONTEND_ENV"; then
  sed -i "s/^NEXT_DEPLOYMENT_ID=.*/NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID/" "$FRONTEND_ENV"
else
  printf '\nNEXT_DEPLOYMENT_ID=%s\n' "$NEXT_DEPLOYMENT_ID" >> "$FRONTEND_ENV"
fi

echo "Deploying with NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID"

pushd "$APP_ROOT" >/dev/null
set -a
source "$FRONTEND_ENV"
set +a
npm run build

pm2 restart "$BACKEND_PM2_APP" "$FRONTEND_PM2_APP" --update-env

backend_ready=false
for _ in {1..20}; do
  if curl -fsS "$BACKEND_HEALTH_URL" >/tmp/rapid-backend-health.json; then
    backend_ready=true
    break
  fi
  sleep 2
done
if [[ "$backend_ready" != true ]]; then
  echo "Backend health check did not pass within timeout: $BACKEND_HEALTH_URL" >&2
  exit 1
fi

frontend_ready=false
for _ in {1..20}; do
  if curl -fsSI "http://127.0.0.1:${FRONTEND_PORT}" >/tmp/rapid-frontend-head.txt; then
    frontend_ready=true
    break
  fi
  sleep 2
done
if [[ "$frontend_ready" != true ]]; then
  echo "Frontend health check did not pass within timeout: http://127.0.0.1:${FRONTEND_PORT}" >&2
  exit 1
fi

head -n 1 /tmp/rapid-frontend-head.txt
popd >/dev/null

echo "Deployment and smoke checks completed."
