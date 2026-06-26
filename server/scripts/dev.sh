#!/usr/bin/env bash
# Dev entrypoint for the API server. Ensures the SSH tunnel to prod Postgres
# (localhost:5433 → dynorun-prod:5432) is up before starting tsx, because
# DATABASE_URL points at :5433. Without it, every DB query — including the
# better-auth magic-link verification write — fails with a silent 500.
set -euo pipefail
cd "$(dirname "$0")/.."

TUNNEL_PID=""
if nc -z localhost 5433 2>/dev/null; then
  echo "→ DB tunnel already up on :5433"
else
  echo "→ Starting SSH tunnel to prod Postgres on :5433"
  ssh -N -L 5433:localhost:5432 dynorun-prod &
  TUNNEL_PID=$!
  for _ in $(seq 1 20); do
    nc -z localhost 5433 2>/dev/null && break
    sleep 0.5
  done
  if ! nc -z localhost 5433 2>/dev/null; then
    echo "✗ Tunnel failed to open on :5433 — check 'ssh dynorun-prod'" >&2
    exit 1
  fi
  echo "→ Tunnel up (pid $TUNNEL_PID)"
fi

# Only tear down the tunnel if we started it.
cleanup() { [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true; }
trap cleanup EXIT

exec tsx watch --env-file-if-exists=.env src/index.ts
