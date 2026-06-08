# Rapid - Revenue Analysis and Performance Intelligence Dashboard

Phase 1 now includes:

- A Power BI-inspired landing page
- A seeded superuser admin dashboard
- User creation, deletion, role assignment, temporary-password recovery, and MFA reset flows
- Microsoft Authenticator-compatible TOTP enrollment and verification
- A file-backed RBAC store in `data/rbac-store.json`
- PostgreSQL-backed workbook ingestion for revenue dashboard data

## Run locally

```bash
npm install
npm run dev
pip install -r requirements.txt
npm run dev:backend
```

Open `http://localhost:3000`.

`npm run dev:backend` now starts the FastAPI backend together with a persistent
local PostgreSQL instance under `.local/postgres-data` and wires
`RAPID_DATABASE_URL` automatically. Use `npm run dev:backend:raw` only if you
already have PostgreSQL running and want to provide the connection string
yourself.

## Production deployment hardening

Use `scripts/ops/deploy_with_build_id.sh` on the server to enforce consistent
deployment IDs and smoke checks:

```bash
APP_ROOT=/home/user/rapid/current \
FRONTEND_ENV=/home/user/rapid/shared/frontend.env \
BACKEND_ENV=/home/user/rapid/shared/backend.env \
bash scripts/ops/deploy_with_build_id.sh
```

The script:
- sets `NEXT_DEPLOYMENT_ID` for build/runtime parity,
- validates shared-secret parity between frontend and backend env files,
- rebuilds the frontend,
- restarts PM2 services atomically,
- runs backend/frontend health checks.

## Seeded superuser

- Email: `nitesh.r@mindteck.us`
- Password: you are my baby

On first login, the app will ask you to enroll Microsoft Authenticator using
the QR code shown on `/login/totp`. Users created by admin receive a temporary
password and must create a permanent password on first sign-in.

## Current phase scope

- Public landing page
- Superuser login with TOTP
- User management and access control
- Executive protected route
- Role creation and assignment

## Next phase ideas already reflected in the code

- Geo Head and Practice Head role expansion
- Data upload workflows
- ML forecast and insight layers
- Export, alerting, and natural language analytics
