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
- **Deploy = `git push origin main`** → GitHub Actions builds frontend + API, rsyncs both to server, restarts `dynorun-api`.

## Public URL & TLS

- App lives at **https://wasgoht.ch** (apex). `www.wasgoht.ch`, any plain-HTTP URL, and bare-IP HTTP all 301 to the apex.
- TLS: Let's Encrypt cert covering `wasgoht.ch` + `www.wasgoht.ch`, renewed automatically by `certbot.timer` (runs twice daily).
- DNS: managed in Hetzner DNS (`dns.hetzner.com`), zone `wasgoht.ch`, A records for `@` and `www` → `138.199.154.225`.
- nginx config: `/etc/nginx/sites-enabled/dynorun` (3 server blocks: HTTP→HTTPS catch-all, HTTPS www→apex, HTTPS apex serving the SPA + `/api/` proxy to `localhost:3000`). Backup of pre-rewrite config: `/root/dynorun.nginx.bak`.
- Secure Context APIs (`crypto.randomUUID`, `crypto.subtle`, Service Workers, Geolocation on mobile) now work since the origin is HTTPS.
