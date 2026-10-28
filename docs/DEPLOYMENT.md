# Deploying USM Orbit to a VPS

Target: one Linux VPS (2 vCPU / 4 GB RAM is plenty for a beta) running Docker. The stack is PostgreSQL 16, the USM Orbit app (Next.js standalone, non-root) and Caddy, which terminates HTTPS with automatic Let's Encrypt certificates.

## 1. Prepare the server
```bash
# Ubuntu example
curl -fsSL https://get.docker.com | sh
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
git clone https://github.com/satya928/USMorbit.git /opt/usm-orbit && cd /opt/usm-orbit
```
Create a DNS **A record** for your domain (e.g. `app.example.com`) pointing at the server.

## 2. Configure
```bash
cp .env.production.example .env
openssl rand -base64 32   # use as POSTGRES_PASSWORD
nano .env                 # DOMAIN, POSTGRES_PASSWORD, optional AI_API_KEY
chmod 600 .env
```
Secrets live only in `.env` on the server (or your secret manager). Never commit it.

## 3. Migrate and start
```bash
docker compose build
docker compose --profile tools run --rm migrate      # applies drizzle/ migrations
docker compose up -d
docker compose ps && curl -fsS https://$DOMAIN/api/health
```

### First administrator
For a **demo instance**, set `DEMO_MODE=true` and `ALLOW_DEMO_SEED=true` in `.env`, then:
```bash
docker compose --profile tools run --rm migrate npm run db:seed
```
For a **pilot customer instance**, do not seed demo data. Provision the tenant and its first administrator:
```bash
docker compose --profile tools run --rm migrate npm run tenant:create -- \
  --name "Acme Facilities" --admin-email ops@acme.example --admin-name "Jo Smith" --timezone Australia/Sydney
```
This creates default categories and SLA presets and prints a one-time temporary password (the admin must change it at first sign-in). The admin then adds sites and invites users from *Settings → Users & roles*.

## 4. Upgrades
```bash
cd /opt/usm-orbit && git pull
docker compose build
docker compose --profile tools run --rm migrate
docker compose up -d
```
Migrations are additive SQL files in `drizzle/`; take a backup before upgrading.

## 5. Backups and restore
`deploy/backup.sh` writes a `pg_dump` (custom format) and a tarball of private file storage, keeping 14 days by default.
```bash
sudo crontab -e
15 2 * * * cd /opt/usm-orbit && ./deploy/backup.sh >> /var/log/usm-orbit-backup.log 2>&1
```
Copy `/var/backups/usm-orbit` off the server (e.g. `rclone` to object storage) — a backup on the same disk is not a backup.

**Restore**
```bash
docker compose stop app
docker compose exec -T db pg_restore -U orbit -d orbit --clean --if-exists < /var/backups/usm-orbit/db-YYYYMMDDTHHMMSSZ.dump
docker compose run --rm --no-deps --user root -v /var/backups/usm-orbit:/backup --entrypoint sh app \
  -c "rm -rf /data/storage/* && tar xzf /backup/storage-YYYYMMDDTHHMMSSZ.tgz -C /data"
docker compose start app
```
Test a restore on a scratch server before inviting pilot customers.

## 6. Operations checklist
- HTTPS only (Caddy redirects HTTP; HSTS enabled). Session cookies are `Secure` in production.
- Health check: `GET /api/health` (used by the container healthcheck).
- Logs: `docker compose logs -f app` — errors are logged without request bodies or secrets.
- Scaling beyond one instance requires shared file storage (S3-compatible) and a shared rate-limit store; see README "Known limitations".
- Data export: reports export CSV; a full tenant export is a `pg_dump` filtered by `tenant_id` (operator task in the beta).
- Data deletion: archive records in-app; permanent tenant deletion is an operator task (delete child tables by `tenant_id`, then the tenant — see `resetDemoData` in `src/db/seed.ts` for the order).
