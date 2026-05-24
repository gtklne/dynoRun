# CI/CD: GitHub Actions → Hetzner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-deploy the dynoRun React/Vite SPA to a Hetzner server on every push to `main`, accessible via `http://<server-ip>` from a phone.

**Architecture:** GitHub Actions builds `dist/` on push to `main` and rsyncs it over SSH to a `deploy` user on a Hetzner `cax11` ARM server. nginx serves the static files on port 80. No domain or TLS required.

**Tech Stack:** hcloud CLI, GitHub Actions, rsync/SSH, nginx (Debian 12), Vite/React (existing)

---

## File Structure

| Path | Action | Purpose |
|---|---|---|
| `.github/workflows/deploy.yml` | Create | GitHub Actions workflow: build + rsync |
| `~/.ssh/dynorun_deploy` | Create (local, not committed) | Ed25519 deploy private key |
| `~/.ssh/dynorun_deploy.pub` | Create (local, not committed) | Ed25519 deploy public key |

---

### Task 1: Generate SSH deploy key pair

**Files:**
- Create: `~/.ssh/dynorun_deploy` (local only — never commit)

- [ ] **Step 1: Generate the key**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/dynorun_deploy -N "" -C "dynorun-deploy"
```

Expected output:
```
Your identification has been saved in /Users/jnothstein/.ssh/dynorun_deploy
Your public key has been saved in /Users/jnothstein/.ssh/dynorun_deploy.pub
```

- [ ] **Step 2: Verify both files exist**

```bash
ls -la ~/.ssh/dynorun_deploy ~/.ssh/dynorun_deploy.pub
```

Expected: both files present, private key is `600`.

- [ ] **Step 3: Upload public key to Hetzner**

```bash
hcloud ssh-key create --name dynorun-deploy --public-key-from-file ~/.ssh/dynorun_deploy.pub
```

Expected output:
```
SSH key 1234567 created
```

---

### Task 2: Create the Hetzner server

**Files:** none (cloud resource)

- [ ] **Step 1: Create the server**

```bash
hcloud server create \
  --name dynorun-prod \
  --type cax11 \
  --image debian-12 \
  --location nbg1 \
  --ssh-key dynorun-deploy
```

Expected output includes:
```
Server 12345678 created
IPv4: <ip-address>
```

- [ ] **Step 2: Note the server's IPv4 address**

```bash
hcloud server describe dynorun-prod --output json | python3 -c "import sys,json; print(json.load(sys.stdin)['public_net']['ipv4']['ip'])"
```

Save this IP — you'll need it in Tasks 4 and 5.

- [ ] **Step 3: Wait for server to be reachable**

```bash
ssh -i ~/.ssh/dynorun_deploy -o StrictHostKeyChecking=no root@<ip> "echo ok"
```

Expected: `ok`. Retry after 10 seconds if it fails (server is still booting).

---

### Task 3: Bootstrap the server

**Files:** none (remote configuration)

Run all steps as root via SSH. Replace `<ip>` with the server IP from Task 2.

- [ ] **Step 1: Install nginx**

```bash
ssh -i ~/.ssh/dynorun_deploy root@<ip> "apt-get update -qq && apt-get install -y nginx"
```

Expected: ends with `Setting up nginx`.

- [ ] **Step 2: Create the deploy user and web directory**

```bash
ssh -i ~/.ssh/dynorun_deploy root@<ip> "
  useradd -m -s /bin/bash deploy &&
  mkdir -p /var/www/dynorun &&
  chown deploy:deploy /var/www/dynorun &&
  mkdir -p /home/deploy/.ssh &&
  chmod 700 /home/deploy/.ssh &&
  chown deploy:deploy /home/deploy/.ssh
"
```

Expected: no output (all commands succeed silently).

- [ ] **Step 3: Authorize the deploy key for the deploy user**

```bash
cat ~/.ssh/dynorun_deploy.pub | ssh -i ~/.ssh/dynorun_deploy root@<ip> \
  "tee /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys"
```

Expected: the public key line is printed back.

- [ ] **Step 4: Verify SSH login as deploy user works**

```bash
ssh -i ~/.ssh/dynorun_deploy deploy@<ip> "echo ok"
```

Expected: `ok`.

- [ ] **Step 5: Write the nginx site config**

```bash
ssh -i ~/.ssh/dynorun_deploy root@<ip> "cat > /etc/nginx/sites-available/dynorun << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/dynorun;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF"
```

Expected: no output.

- [ ] **Step 6: Enable the site and disable the nginx default**

```bash
ssh -i ~/.ssh/dynorun_deploy root@<ip> "
  ln -sf /etc/nginx/sites-available/dynorun /etc/nginx/sites-enabled/dynorun &&
  rm -f /etc/nginx/sites-enabled/default &&
  nginx -t && systemctl reload nginx
"
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`.

- [ ] **Step 7: Place an index.html placeholder so nginx serves something**

```bash
ssh -i ~/.ssh/dynorun_deploy deploy@<ip> "echo '<h1>deploying...</h1>' > /var/www/dynorun/index.html"
```

- [ ] **Step 8: Verify nginx is serving on port 80**

```bash
curl -s http://<ip>/ | head -5
```

Expected: `<h1>deploying...</h1>`

---

### Task 4: Create GitHub repo and push

**Files:** none (GitHub resource + git remote)

- [ ] **Step 1: Commit the plan file**

```bash
git -C /Users/jnothstein/Documents/websites/dynoRun add docs/superpowers/plans/2026-05-24-cicd-hetzner.md &&
git -C /Users/jnothstein/Documents/websites/dynoRun commit -m "docs: add CI/CD implementation plan"
```

- [ ] **Step 2: Create the GitHub repo**

```bash
gh repo create gtklne/dynoRun --public --description "GPS-assisted dyno run app"
```

Expected: repo URL printed.

- [ ] **Step 3: Add the remote and push**

```bash
git -C /Users/jnothstein/Documents/websites/dynoRun remote add origin https://github.com/gtklne/dynoRun.git &&
git -C /Users/jnothstein/Documents/websites/dynoRun push -u origin main
```

Expected: `Branch 'main' set up to track remote branch 'main' from 'origin'.`

---

### Task 5: Add GitHub Actions secrets

**Files:** none (GitHub secrets)

Replace `<ip>` with the server IP from Task 2.

- [ ] **Step 1: Add the SSH private key secret**

```bash
gh secret set DEPLOY_SSH_KEY --repo gtklne/dynoRun < ~/.ssh/dynorun_deploy
```

Expected: `✓ Set secret DEPLOY_SSH_KEY for gtklne/dynoRun`

- [ ] **Step 2: Add the server IP secret**

```bash
gh secret set DEPLOY_HOST --repo gtklne/dynoRun --body "<ip>"
```

Expected: `✓ Set secret DEPLOY_HOST for gtklne/dynoRun`

- [ ] **Step 3: Verify both secrets exist**

```bash
gh secret list --repo gtklne/dynoRun
```

Expected: `DEPLOY_SSH_KEY` and `DEPLOY_HOST` both listed.

---

### Task 6: Write the GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the workflows directory**

```bash
mkdir -p /Users/jnothstein/Documents/websites/dynoRun/.github/workflows
```

- [ ] **Step 2: Write the workflow file**

Create `.github/workflows/deploy.yml` with this exact content:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npm run build

      - name: Set up SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H ${{ secrets.DEPLOY_HOST }} >> ~/.ssh/known_hosts

      - name: Deploy
        run: |
          rsync -rlgoDzv --delete dist/ deploy@${{ secrets.DEPLOY_HOST }}:/var/www/dynorun/
```

- [ ] **Step 3: Commit and push**

```bash
git -C /Users/jnothstein/Documents/websites/dynoRun add .github/workflows/deploy.yml &&
git -C /Users/jnothstein/Documents/websites/dynoRun commit -m "ci: add GitHub Actions deploy workflow" &&
git -C /Users/jnothstein/Documents/websites/dynoRun push
```

---

### Task 7: Verify the pipeline end-to-end

- [ ] **Step 1: Watch the workflow run**

```bash
gh run watch --repo gtklne/dynoRun
```

Or open `https://github.com/gtklne/dynoRun/actions` on your phone to follow progress.

Expected: all steps green, deploy step completes without error.

- [ ] **Step 2: Confirm the app is live**

```bash
curl -s http://<ip>/ | head -5
```

Expected: HTML containing `<div id="root">` (the Vite output, not the placeholder).

- [ ] **Step 3: Open on phone**

Navigate to `http://<ip>/` in your phone's browser.

Expected: the dynoRun app loads and is usable.
