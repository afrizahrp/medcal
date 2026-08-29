# File Storage & Backup (Generic File Infrastructure — Phase 1)

Companion to `implementation_report_file_infrastructure_phase1.md`. Covers the
operational side of the file store: where bytes live, how they are backed up,
how a restore is performed, and what is still an open operational decision.

---

## 1. What is stored

- **Binaries** — the actual uploaded files (initially: reference-equipment
  calibration certificate PDFs). One file per `FileObject` row.
- **Metadata** — `FileObject` rows in the native PostgreSQL database
  (`companyId`, `ownerType`, `ownerId`, `storageKey`, `mimeType`, `sizeBytes`,
  `originalName`, `checksum` (sha256), `uploadedByUserId`, `createdAt`,
  `updatedAt`).

The binary and its row are **one evidence set**. Neither is usable without the
other. Always back them up together.

## 2. Where files live

| Environment | Location |
|---|---|
| Dev | `FILES_ROOT` in `.env` — default `./.data/files` (gitignored) |
| Production | Container path `FILES_ROOT=/data/files`, bind-mounted from the host dir `MEDCAL_FILES_DIR` (default `/srv/medcal/files`) — see `docker-compose.prod.yml`, `api` service `volumes:` |

Key layout on disk: `{companyId}/{ownerType}/{ownerId}/{fileId}.{ext}`
(e.g. `PKM/EQUIPMENT_CALIBRATION/<recordId>/<uuid>.pdf`). Temp files during
upload: `<root>/.tmp/`.

The store is **never** exposed by Nginx or a static route. Every read/write
goes through authenticated `apps/api` endpoints (`POST /files`, `GET /files/:id`,
`DELETE /files/:id`), authorized through the owning business record.

## 3. Production prerequisites (hard gate)

Before enabling upload in production:

1. Host dir `MEDCAL_FILES_DIR` exists and is writable by the container user
   (`medcal`, uid from `apps/api/Dockerfile`). `mkdir -p /srv/medcal/files &&
   chown` as appropriate.
2. `docker-compose.prod.yml` `api` service has the bind mount (done in this
   phase).
3. `.env.production` sets `FILES_ROOT=/data/files` and `MEDCAL_FILES_DIR`.
4. Nginx `api.` vhost sets `client_max_body_size 25m` (done in the
   `infra/nginx/*.conf.example`; the VPS operator still applies it manually,
   same as the rest of that file).
5. A working combined backup + a tested restore (sections 4–5).

## 4. Backup

`scripts/backup-medcal.sh` captures both halves in one run:

```
FILES_DIR=/srv/medcal/files \
DATABASE_URL='postgresql://USER:PASS@HOST:5432/pkmdb' \
BACKUP_DIR=/srv/medcal/backups \
scripts/backup-medcal.sh
```

Order: **Postgres dump first, file tar second.** This guarantees
`files >= DB snapshot`. A file with no row is harmless (see the integrity check
below); a row with no file is the failure this ordering prevents.

Each run writes `BACKUP_DIR/<UTC timestamp>/` containing `postgres.dump`,
`files.tgz`, and `manifest.txt` (with sha256s).

## 5. Restore runbook

1. Stop `apps/api` (`docker compose -f docker-compose.prod.yml stop api`).
2. Restore the database:
   `pg_restore --clean --no-owner --dbname="$DATABASE_URL" postgres.dump`
3. Restore files: empty `MEDCAL_FILES_DIR`, then
   `tar xzf files.tgz -C /srv/medcal/files`.
4. Start `apps/api`.
5. Run the integrity check (section 6). Expect:
   - **Rows whose binary is missing** → real data loss. The file tar predates
     the DB dump, or the tar is incomplete. Restore from an older, consistent
     pair.
   - **Binaries with no row** → benign. They are inert (nothing references
     them). Optionally delete them (`FilesService` orphan handling / a manual
     sweep of keys with no matching `FileObject`).

### If DB and file backup timestamps differ

- **Files newer than DB** (normal, given the backup order): acceptable. Extra
  binaries are orphans; the integrity check flags them; they can be swept.
- **Files older than DB**: some `FileObject` rows will have no binary — evidence
  loss. Do not accept this restore; use an earlier consistent pair.

## 6. Integrity check

`FilesService.verifyIntegrity(companyId, fileId)` re-hashes the stored binary
and compares it to `FileObject.checksum`. There is no public route (by design).
Use it from a small script / REPL against the running app for a post-restore
sweep or a periodic health check. It returns `{ ok, expected, actual }` or
`{ ok: false, reason: "BYTES_MISSING" }`.

## 7. Open operational decisions (NOT decided here)

The repository does not contain enough information to safely fix these — they
are for the VPS operator / product owner:

1. **Off-VPS destination** for `BACKUP_DIR/<ts>/` (another host, external disk,
   object storage). None is configured; `backup-medcal.sh` deliberately does
   not push anywhere.
2. **Schedule & retention** — how often the script runs (cron/systemd timer),
   how many timestamped folders to keep, RPO/RTO targets.
3. **Backup ownership** — who runs it, who verifies restores.
4. **Disk quota / monitoring** for `MEDCAL_FILES_DIR` on the VPS.
5. **Whether production is live yet** — deployment docs say "validated locally,
   not deployed." If not yet deployed, the store + backup should be part of the
   first real deploy rather than retrofitted.

Until 1–3 exist, treat production certificate upload as **not enabled**; a
metadata-only "certificate pending upload" state is acceptable in the interim
(the structured record, once Phase 2B exists, is authoritative regardless).
