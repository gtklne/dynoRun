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
- Web server: nginx (`/etc/nginx/sites-enabled/dynorun`), port 80 default server, SPA fallback to `/index.html`
- No backend service deployed yet (no systemd unit for dynorun, no docker)
- Deploy user: `deploy` (`/home/deploy`), used to rsync built frontend into `/var/www/dynorun`
