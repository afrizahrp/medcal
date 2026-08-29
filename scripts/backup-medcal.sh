#!/usr/bin/env bash
#
# MedCal combined backup — PostgreSQL dump + file store, as ONE evidence set.
#
# The certificate/evidence PDFs in the file store and the FileObject rows in
# Postgres only make sense together: a DB restored without its files (or vice
# versa) breaks calibration-evidence traceability. This script captures both
# in one run so their timestamps line up.
#
# This is a RUNBOOK helper, not a service. It does NOT push anything off-site
# and does NOT install a schedule — those are deliberate operational decisions
# (see docs/Deployment/file-storage-and-backup.md, "Open operational decisions").
#
# Usage:
#   FILES_DIR=/srv/medcal/files \
#   DATABASE_URL='postgresql://user:pass@localhost:5432/pkmdb' \
#   BACKUP_DIR=/srv/medcal/backups \
#   scripts/backup-medcal.sh
#
set -euo pipefail

FILES_DIR="${FILES_DIR:-/srv/medcal/files}"
BACKUP_DIR="${BACKUP_DIR:-/srv/medcal/backups}"
DATABASE_URL="${DATABASE_URL:?set DATABASE_URL to the native Postgres connection string}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
dest="${BACKUP_DIR}/${ts}"
mkdir -p "${dest}"

echo "[backup] ${ts}  ->  ${dest}"

# 1. Database first (it holds the authoritative FileObject rows).
echo "[backup] pg_dump ..."
pg_dump --format=custom --no-owner --dbname="${DATABASE_URL}" --file="${dest}/postgres.dump"

# 2. File store. Capture AFTER the dump so files are >= DB snapshot: an extra
#    file with no row is harmless (orphan sweep / integrity check finds it);
#    a row with no file is the real hazard, and this ordering avoids it.
echo "[backup] tar file store ..."
if [ -d "${FILES_DIR}" ]; then
  tar --create --gzip --file="${dest}/files.tgz" --directory="${FILES_DIR}" .
else
  echo "[backup] WARNING: ${FILES_DIR} does not exist — no file store to back up" >&2
fi

# 3. Manifest — records what was captured and when, for restore verification.
{
  echo "created_utc=${ts}"
  echo "files_dir=${FILES_DIR}"
  echo "postgres_dump=postgres.dump"
  echo "files_archive=files.tgz"
  [ -f "${dest}/files.tgz" ] && echo "files_sha256=$(sha256sum "${dest}/files.tgz" | cut -d' ' -f1)"
  echo "postgres_sha256=$(sha256sum "${dest}/postgres.dump" | cut -d' ' -f1)"
} > "${dest}/manifest.txt"

echo "[backup] done. Copy ${dest} off-VPS (see runbook)."
