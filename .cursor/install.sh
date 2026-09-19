#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the medcal monorepo.
# Runs once at environment-build time (or per just-in-time boot). It must be
# safe to re-run: every step checks for existing state before creating it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PGDATA="${PGDATA:-$HOME/.local/share/medcal/pgdata}"
PGPORT="${PGPORT:-5432}"
PGBIN=""

log() { printf '[install] %s\n' "$*"; }

# --- 1. System packages: PostgreSQL server (stable system dependency) --------
if ! ls /usr/lib/postgresql/*/bin/pg_ctl >/dev/null 2>&1; then
  log "Installing PostgreSQL..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi
PGBIN="$(dirname "$(ls -1 /usr/lib/postgresql/*/bin/pg_ctl | sort -V | tail -1)")"
log "Using PostgreSQL binaries at $PGBIN"

# --- 2. Node toolchain: pin pnpm via corepack ---------------------------------
corepack enable
corepack prepare pnpm@9.15.9 --activate

# --- 3. Install workspace dependencies ---------------------------------------
log "Installing pnpm dependencies..."
pnpm install --frozen-lockfile

# --- 4. Local environment file -----------------------------------------------
if [ ! -f .env ]; then
  log "Creating .env from .env.example"
  cp .env.example .env
fi

# --- 5. PostgreSQL cluster ----------------------------------------------------
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  log "Initializing PostgreSQL cluster at $PGDATA"
  mkdir -p "$PGDATA"
  "$PGBIN/initdb" -D "$PGDATA" -U postgres >/dev/null
fi

# Start the cluster if it is not already accepting connections.
if ! "$PGBIN/pg_isready" -h localhost -p "$PGPORT" >/dev/null 2>&1; then
  log "Starting PostgreSQL on port $PGPORT"
  "$PGBIN/pg_ctl" -D "$PGDATA" -l /tmp/medcal-postgres.log -o "-p $PGPORT -c unix_socket_directories=/tmp" -w start
fi

# --- 6. Role + databases (idempotent) ----------------------------------------
psql_admin() { "$PGBIN/psql" -h localhost -p "$PGPORT" -U postgres -d postgres "$@"; }

if [ "$(psql_admin -tAc "SELECT 1 FROM pg_roles WHERE rolname='medcal'")" != "1" ]; then
  log "Creating role 'medcal'"
  psql_admin -c "CREATE ROLE medcal LOGIN PASSWORD 'medcal' SUPERUSER;"
fi
for db in medcal medcal_test; do
  if [ "$(psql_admin -tAc "SELECT 1 FROM pg_database WHERE datname='$db'")" != "1" ]; then
    log "Creating database '$db'"
    psql_admin -c "CREATE DATABASE $db OWNER medcal;"
  fi
done

# --- 7. Prisma client + schema migrations ------------------------------------
export DATABASE_URL="${DATABASE_URL:-postgresql://medcal:medcal@localhost:${PGPORT}/medcal?schema=public}"
log "Generating Prisma client"
pnpm --filter @medcal/db generate
log "Applying database migrations"
pnpm --filter @medcal/db exec prisma migrate deploy

# --- 8. Baseline reference data (idempotent upserts) -------------------------
log "Seeding baseline contact topics"
pnpm --filter @medcal/db run seed:contact-topics

log "Bootstrap complete."
