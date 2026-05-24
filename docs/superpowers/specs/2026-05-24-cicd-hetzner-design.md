# CI/CD: GitHub Actions → Hetzner

## Goal

Auto-deploy dynoRun (React/Vite SPA) to a cheap Hetzner server on every push to `main`. Access the running app from a phone via `http://<server-ip>` — no domain required.

## Infrastructure

- **Server**: `cax11` (ARM, 2 cores, 4 GB RAM, 40 GB disk), Debian 12, location `nbg1`
- **Created via**: `hcloud server create` using existing context `swiss-event`
- **SSH key**: generated locally, public key passed at server creation
- **Web server**: nginx, serves `/var/www/dynorun/` on port 80
- **Deploy user**: `deploy` (non-root), owns `/var/www/dynorun/`

## Repository

- New GitHub repo: `gtklne/dynoRun` (public)
- Local repo gets `origin` remote pointing to GitHub
- Initial push of current codebase

## CI/CD Pipeline

File: `.github/workflows/deploy.yml`

Trigger: push to `main`

Steps:
1. Checkout code
2. `npm ci`
3. `npm run build` → `dist/`
4. rsync `dist/` → `deploy@<host>:/var/www/dynorun/` over SSH

GitHub Actions secrets:
- `DEPLOY_SSH_KEY`: private key (ed25519)
- `DEPLOY_HOST`: server IPv4

## Access

`http://<server-ip>` — open in mobile browser, no domain or HTTPS needed.
