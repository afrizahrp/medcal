#!/usr/bin/env bash
# Per-boot reconciliation: ensure PostgreSQL is running against the cluster
# prepared by install.sh. Idempotent and safe to re-run.
set -euo pipefail

PGDATA="${PGDATA:-$HOME/.local/share/medcal/pgdata}"
PGPORT="${PGPORT:-5432}"
PGBIN="$(dirname "$(ls -1 /usr/lib/postgresql/*/bin/pg_ctl | sort -V | tail -1)")"

log() { printf '[start] %s\n' "$*"; }

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  log "PostgreSQL cluster missing at $PGDATA — run .cursor/install.sh first" >&2
  exit 1
fi

if "$PGBIN/pg_isready" -h localhost -p "$PGPORT" >/dev/null 2>&1; then
  log "PostgreSQL already running on port $PGPORT"
else
  log "Starting PostgreSQL on port $PGPORT"
  "$PGBIN/pg_ctl" -D "$PGDATA" -l /tmp/medcal-postgres.log -o "-p $PGPORT -c unix_socket_directories=/tmp" -w start
fi

# Block until the server accepts connections so dependent services start clean.
for _ in $(seq 1 30); do
  if "$PGBIN/pg_isready" -h localhost -p "$PGPORT" >/dev/null 2>&1; then
    log "PostgreSQL is ready."
    exit 0
  fi
  sleep 1
done

log "PostgreSQL did not become ready in time" >&2
exit 1
