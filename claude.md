commit and push after every implementation

# Production server (Hetzner)

- hcloud context: `swiss-event` (already active)
- Server name: `dynorun-prod` (Hetzner Cloud, `cax11` ARM, Debian 12, Falkenstein)
- Public IPv4: `138.199.154.225`
- SSH key (local): `~/.ssh/dynorun_deploy` (matches Hetzner key `dynorun-deploy`)
- SSH as root: `ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225`
- SSH as deploy: `ssh -i ~/.ssh/dynorun_deploy deploy@138.199.154.225`
- List/inspect server: `hcloud server list` / `hcloud server describe dynorun-prod`

## Deployment layout

- Web root: `/var/www/dynorun` (owned by `deploy:deploy`) — static SPA build (`index.html` + `assets/`)
- Web server: nginx (`/etc/nginx/sites-enabled/dynorun`), HTTPS on port 443, SPA fallback to `/index.html`, `/api/` proxied to `:3000`
- API service: `dynorun-api` systemd unit, Node.js Hono server at `/opt/dynorun-api/`, reads `/etc/dynorun.env`
- Database: PostgreSQL 16 in Docker (`docker exec postgres psql -U dynorun -d dynorun`), data at `/var/lib/pg-data`
- Deploy user: `deploy` (`/home/deploy`), used to rsync built frontend into `/var/www/dynorun`
- **Deploy = `git push origin main`** → GitHub Actions builds frontend + API, rsyncs both to server, runs `drizzle-kit push` against Postgres to apply schema changes, then restarts `dynorun-api`.

## Database migrations

- Source of truth: `server/src/schema.ts` (drizzle-orm).
- On every deploy, the workflow rsyncs `schema.ts` + `drizzle.config.ts` to the server and runs `npx drizzle-kit push` as root (so it can source `/etc/dynorun.env`). Additive changes (new tables, new columns, new indexes) apply automatically. Destructive changes (drop column, rename) require `--force` and will fail in CI — apply those manually first via `docker exec postgres psql -U dynorun -d dynorun`.
- To preview migrations locally: `cd server && DATABASE_URL=... npx drizzle-kit push --verbose` (read-only with `--dry-run` is not supported by drizzle-kit; use a scratch DB if you want to test).

## Public URL & TLS

- App lives at **https://wasgoht.ch** (apex). `www.wasgoht.ch`, any plain-HTTP URL, and bare-IP HTTP all 301 to the apex.
- TLS: Let's Encrypt cert covering `wasgoht.ch` + `www.wasgoht.ch`, renewed automatically by `certbot.timer` (runs twice daily).
- DNS: managed in Hetzner DNS (`dns.hetzner.com`), zone `wasgoht.ch`, A records for `@` and `www` → `138.199.154.225`.
- nginx config: `/etc/nginx/sites-enabled/dynorun` (3 server blocks: HTTP→HTTPS catch-all, HTTPS www→apex, HTTPS apex serving the SPA + `/api/` proxy to `localhost:3000`). Backup of pre-rewrite config: `/root/dynorun.nginx.bak`.
- Secure Context APIs (`crypto.randomUUID`, `crypto.subtle`, Service Workers, Geolocation on mobile) now work since the origin is HTTPS.
