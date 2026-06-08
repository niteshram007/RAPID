# Production Security and Ops

This app now sends baseline security headers directly from Next.js and includes daily database backup scripts in `scripts/ops/`. Use the reverse proxy layer to enforce the same policy at the edge.

## What changed in code

- `next.config.ts`
  - Enables response compression.
  - Enables App Router `sri` hashes for script integrity.
  - Adds `Strict-Transport-Security`.
  - Adds a tighter `Content-Security-Policy`.
  - Adds `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and `Cross-Origin-Resource-Policy`.
  - Adds long-lived caching for `/_next/static/*` and `/icons/*`.
  - Forces `sw.js` and the manifest to revalidate.
- `scripts/ops/backup_postgres.sh`
  - Adds secure file permissions with `umask 077`.

## NGINX

Update the active site block on the production server:

```nginx
server {
    listen 443 ssl http2;
    server_name rapid.mindteck.com;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-site" always;

    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location /icons/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location = /sw.js {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Apply and validate:

```bash
sudo cp /etc/nginx/sites-available/rapid /etc/nginx/sites-available/rapid.$(date +%Y%m%d_%H%M%S).bak
sudo nano /etc/nginx/sites-available/rapid
sudo nginx -t
sudo systemctl reload nginx
curl -I https://rapid.mindteck.com/
curl -I https://rapid.mindteck.com/_next/static/
```

## Apache

If Apache is in front of the app instead of NGINX, use:

```apache
Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
Header always set Cross-Origin-Opener-Policy "same-origin"
Header always set Cross-Origin-Resource-Policy "same-site"
```

Apply and validate:

```bash
sudo apachectl -t
sudo systemctl reload apache2
curl -I https://rapid.mindteck.com/
```

## Daily database backup

Install the backup job:

```bash
cd /home/user/rapid/current
chmod +x scripts/ops/backup_postgres.sh scripts/ops/install_backup_cron.sh
CRON_HOUR=2 CRON_MINUTE=15 ./scripts/ops/install_backup_cron.sh /home/user/rapid/current/scripts/ops/backup_postgres.sh
crontab -l
```

Environment expected by the backup script:

```bash
export RAPID_DATABASE_URL="postgresql://user:password@host:5432/dbname"
export BACKUP_DIR="/var/backups/rapid"
export LOG_FILE="/var/log/rapid-db-backup.log"
export RETENTION_DAYS="14"
```

Manual backup test:

```bash
/home/user/rapid/current/scripts/ops/backup_postgres.sh
ls -lh /var/backups/rapid
tail -n 20 /var/log/rapid-db-backup.log
```

Restore validation:

```bash
gunzip -c /var/backups/rapid/rapid_YYYYMMDD_HHMMSS.sql.gz | head
sha256sum -c /var/backups/rapid/rapid_YYYYMMDD_HHMMSS.sql.gz.sha256
```

## Notes

- `unsafe-eval` is not allowed in production CSP. It remains allowed only in local development where React debugging needs it.
- `unsafe-inline` is still allowed for `style-src` because the current frontend uses inline style attributes in several workspace components. Removing that safely requires a separate refactor.
- HSTS does not require DNS access. It only requires the HTTPS response headers to be served correctly from the app or reverse proxy.
