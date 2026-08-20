# EMAIL → LEAD MANAGEMENT
# PHASE 1 IMPLEMENTATION REPORT

**STATUS:** PHASE 1 COMPLETE (foundation + local Email migration) — STOPPED (awaiting Phase 2 instruction)  
**TANGGAL:** 20 Agustus 2026  
**BASELINE:** `LOCKED-FINAL-IMPLEMENTATION-PLAN-EMAIL-LEAD-MANAGEMENT.md`  
**MODE:** STRICT IMPLEMENTATION — no architectural expansion  

---

## 1. Ringkasan eksekutif

Phase 1 (Foundation) mengimplementasikan fondasi Email → Lead Management sesuai locked plan:

- skema env IMAP + SMTP
- empat permission Email
- model Prisma `Email` beserta relasi
- enhancement SMTP di `packages/notifications`
- Zod schemas Email di `packages/shared`
- seed Menu Registry untuk `leads.email` (file seed; `seed:menu` belum dijalankan)
- `.env.example` tanpa credential nyata
- verifikasi read-only DB lokal **GREEN** (`pkmdb` @ `localhost:5432`)
- migrasi `20260820121500_add_email_system` **applied** ke Postgres native lokal (bukan VPS/production)

Tidak ada EmailsModule, IMAP sync, Portal UI, atau deployment. Phase 2 **belum** dimulai.

---

## 2. Locked plan yang diikuti

Dokumen otoritas:

`docs/cursor/plan/email-managements/LOCKED-FINAL-IMPLEMENTATION-PLAN-EMAIL-LEAD-MANAGEMENT.md`

Hard lock yang dipatuhi di Phase 1:

| Lock | Status |
|------|--------|
| Single Email model | YA |
| `suggestedLeadId` vs `leadId` terpisah | YA |
| `leadId` default null (tidak auto-assign) | YA |
| Tepat 4 permission: read/send/delete/manage | YA |
| SMTP hanya di `packages/notifications` | YA |
| TLS `rejectUnauthorized` default true | YA |
| Tidak ada queue/worker/cron/attachment | YA |
| Tidak ada production deploy | YA |

---

## 3. Implemented

### 3.1 Config / env schema

**File:** `packages/config/src/index.ts`

Variabel yang ditambahkan ke `envSchema` (semua IMAP/SMTP **optional** agar env tanpa mailbox tetap bisa parse):

| Variabel | Default | Catatan |
|----------|---------|---------|
| `IMAP_HOST` | — | optional |
| `IMAP_PORT` | `993` | coerce number |
| `IMAP_TLS` | `true` | string `"true"` → boolean |
| `IMAP_USER` | — | optional |
| `IMAP_PASS` | — | optional, tidak di-hardcode |
| `IMAP_TLS_REJECT_UNAUTHORIZED` | `true` | hanya `false` jika eksplisit |
| `SMTP_HOST` | — | optional |
| `SMTP_PORT` | `465` | coerce number |
| `SMTP_SECURE` | `true` | string `"true"` → boolean |
| `SMTP_USER` | — | optional |
| `SMTP_PASS` | — | optional, tidak di-hardcode |
| `SMTP_FROM` | — | optional |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | `true` | hanya `false` jika eksplisit |

TLS: `IMAP_TLS_REJECT_UNAUTHORIZED` dan `SMTP_TLS_REJECT_UNAUTHORIZED` di-transform dengan `v !== "false"`, jadi default verifikasi sertifikat **aktif**. Tidak menyalin `rejectUnauthorized: false` dari server-bi-erp.

### 3.2 Email permissions

**File:** `packages/auth/src/access-control.ts`

Catalog:

```typescript
email: ["read", "send", "delete", "manage"]
```

Role grants (sesuai locked plan §5.4):

| Role | Grants |
|------|--------|
| SUPERADMIN | `email: ["read", "send", "delete", "manage"]` |
| ADMIN | `email: ["read", "send", "delete", "manage"]` |
| SUPERVISOR / TECHNICIAN / FINANCE / CUSTOMER | tidak diberi email\* |

Tidak diperkenalkan: `email:compose`, `email:reply`, `email:assign`, `email:associate`, `email:draft`, `email:sync`, `email:manage-mailbox`.

### 3.3 Prisma Email model

**File:** `packages/db/prisma/schema.prisma`

Enum baru:

```prisma
enum EmailFolder {
  INBOX
  SENT
  DRAFTS
  TRASH
}

enum EmailStatus {
  UNREAD
  READ
}
```

Model `Email` sesuai locked plan §3.1:

- `messageId` unique (IMAP dedup / RFC Message-ID)
- `parentEmailId` = MedCal cuid (internal thread)
- `rfcInReplyTo` / `rfcReferences` = header RFC (bukan threading MedCal)
- `suggestedLeadId` = suggestion sistem saja
- `leadId` = asosiasi yang dikonfirmasi staf saja
- `contactMessageId`, `sentByUserId`
- timestamps: `sentAt`, `receivedAt`, `readAt`, `deletedAt`

Relasi yang ditambahkan (tanpa meredesain domain existing):

| Model | Relasi |
|-------|--------|
| `Company` | `emails Email[]` |
| `User` | `sentEmails Email[] @relation("EmailSender")` |
| `Lead` | `suggestedInEmails` + `emails` (`EmailSuggestion` / `EmailAssociation`) |
| `ContactMessage` | `emails Email[]` |

Index: `(companyId, folder)`, `(companyId, status)`, `(companyId, leadId)`, `(companyId, suggestedLeadId)`, `(companyId, createdAt)`, `messageId`, `contactMessageId`, `parentEmailId`.

`onDelete`: Company Cascade; Lead/ContactMessage/parent Email SetNull.

### 3.4 Menu Registry seed

**File:** `packages/db/prisma/seed-menu.ts`

Entry `leads.email` diubah dari placeholder menjadi gate permission Email:

| Field | Sebelum | Sesudah |
|-------|---------|---------|
| `isActive` | `false` | `true` |
| `viewResource` | `lead` | `email` |
| `viewAction` | `read` | `read` |
| `href` | `/email` | `/email` (tidak berubah) |
| `order` | `2` | `2` (tidak berubah) |

Seed **belum** dijalankan. `DATABASE_URL` lokal sudah tersedia; `pnpm --filter @medcal/db seed:menu` masih opsional sebelum Phase 3. Phase 3 Portal yang menampilkan menu di UI. Tabel `Menu` di DB lokal tetap 9 baris (nilai seed `leads.email` aktif/`viewResource=email` belum di-upsert ke DB).

### 3.5 SMTP di packages/notifications

**File:** `packages/notifications/src/email/index.ts`  
**Dep:** `nodemailer` + `@types/nodemailer` di `packages/notifications/package.json`

Stub `sendEmail` diganti implementasi Nodemailer **satu batas SMTP**:

- `SendEmailInput`: `to`, `cc`, `bcc`, `subject`, `html`, `text`, `replyTo`, `inReplyTo`, `references`
- `SendEmailResult`: `messageId`, `accepted`, `rejected`
- `SmtpConfig`: host/port/secure/user/pass/from + `rejectUnauthorized` default **true**
- `sendEmail(input, config)` — throw `EMAIL_NOT_CONFIGURED` jika host/user/pass kosong
- `verifySmtpConnection(config)` — helper verify, tidak mengirim email

Tidak ada implementasi SMTP kedua di EmailsModule (EmailsModule belum ada; Phase 2).

### 3.6 Shared Zod schemas

**File:** `packages/shared/src/schemas/index.ts`

| Export | Fungsi |
|--------|--------|
| `emailListQuerySchema` | list: folder/status/isStarred/leadId + pagination/search/sort |
| `EMAIL_SORTABLE_FIELDS` | `createdAt`, `sentAt`, `receivedAt`, `subject` |
| `emailComposeSchema` | send: to/cc/bcc/subject/body + parentEmailId/contactMessageId/leadId |
| `emailDraftSchema` | draft: field opsional |
| `emailUpdateSchema` | status, isStarred, `leadId` nullable, `suggestedLeadId` nullable |

`leadId` nullable di update schema mendukung confirm / change / remove. Persistensi `leadId` tetap hanya via aksi staf di Phase 2 (`email:manage`).

### 3.7 `.env.example`

IMAP + SMTP placeholder lengkap. **Password dikosongkan** (sebelumnya ada nilai nyata di working copy `.env.example`; dihapus agar tidak ter-commit).

`SMTP_FROM` diset ke `"MedCal <info@kalibrasimedika.co.id>"` sesuai locked plan §7.3.

Production `.env` **tidak** diubah. Tidak ada hardcode credential di kode.

---

## 4. Files changed

### Phase 1 (implementasi)

| Path | Jenis |
|------|--------|
| `packages/config/src/index.ts` | modified |
| `packages/auth/src/access-control.ts` | modified |
| `packages/db/prisma/schema.prisma` | modified |
| `packages/db/prisma/seed-menu.ts` | modified |
| `packages/notifications/package.json` | modified |
| `packages/notifications/src/email/index.ts` | modified |
| `packages/shared/src/schemas/index.ts` | modified |
| `.env.example` | modified |
| `pnpm-lock.yaml` | modified (pnpm install nodemailer) |
| `packages/db/prisma/migrations/20260820121500_add_email_system/` | **new** (SQL Email-only, applied ke `pkmdb` lokal) |

### Tidak diubah oleh Phase 1 (out of scope Phase 1)

| Path | Alasan |
|------|--------|
| `apps/api/src/modules/emails/**` | Phase 2 |
| `apps/api/src/app.module.ts` | Phase 2 |
| `apps/api/src/modules/me/me.controller.ts` | Phase 2 |
| `apps/api/src/modules/leads/leads.controller.ts` | Phase 2 |
| `apps/portal/src/app/management/email/**` | Phase 3 |
| `.env.production.example` | tidak diisi credential; tidak dimodifikasi Phase 1 |
| production env / DB | dilarang |

### Unrelated / sudah ada sebelum Phase 1

| Path | Catatan |
|------|---------|
| `docs/cursor/plan/email-managements/` | dokumen plan (untracked) |
| `.env.production.example` | modified di working tree, **bukan** hasil Phase 1 |
| `.gitignore` | modified di working tree, **bukan** hasil Phase 1 |

Tidak ada commit Git (tidak diminta).

---

## 5. Database / migration

### 5.1 Local database verification (read-only, sebelum migrate)

Sumber URL: root `.env` yang dipakai `apps/api` (`--env-file=../../.env`). **Tidak diubah.** Bukan VPS, bukan Docker production.

| Field | Nilai |
|-------|--------|
| host | `localhost` |
| port | `5432` |
| database | `pkmdb` |
| user | `postgres` |
| verdict | **GREEN** — existing MedCal development database |

Schema existing terkonfirmasi: `User`, `UserMembership`, `Menu`, `Lead`, `ContactMessage`, Better Auth (`Session`/`Account`/`Verification`), plus domain lain. Tidak ada tabel `Role`/`Permission` (RBAC MedCal = enum `MembershipRole` + `UserMembership` + catalog kode + `Menu`). Tabel `Email` **belum** ada sebelum migrasi ini.

Sampel count sebelum/sesudah migrate (tidak berubah kecuali `Email` baru = 0): `Lead` 1421, `ContactMessage` 30, `User` 2, `Company` 1, `Menu` 9.

### 5.2 Migration applied (local only)

| Item | Nilai |
|------|--------|
| Nama folder migrasi | `20260820121500_add_email_system` |
| Path | `packages/db/prisma/migrations/20260820121500_add_email_system/migration.sql` |
| Applied ke | Postgres native lokal `pkmdb` @ `localhost:5432` |
| Applied at | 2026-08-20 12:31:42 +07 (`_prisma_migrations`) |
| SQL reviewed | **PASS** |
| Additive-only (SQL yang di-apply) | **YES** |
| Destructive operations in applied SQL | **NO** |
| Production / VPS | **TIDAK** di-apply |
| `prisma migrate dev` di production | **TIDAK** dipakai |
| Auto-rollback diklaim | **TIDAK** |

### 5.3 Mengapa bukan `migrate:dev` sampai selesai

Perintah yang diminta:

`pnpm --filter @medcal/db migrate:dev -- --name add_email_system`

Hasil:

1. Gagal di lingkungan **non-interactive** (Prisma Migrate Dev membutuhkan TTY).
2. Auto-diff Prisma juga berisi **ALTER tidak terkait**: `ChatMessage.seq` BigInt → Integer/SERIAL (27 baris non-null). Locked plan: STOP jika destruktif / unrelated.

Koreksi implementasi (bukan ubah arsitektur Email):

1. Review `prisma migrate diff` (dari DB hidup → `schema.prisma`).
2. Tulis `migration.sql` **hanya** operasi Email (enum + table + unique + index + FK).
3. Apply ke DB **lokal** dengan `prisma migrate deploy`.
4. `prisma generate`.

ALTER `ChatMessage.seq` **tidak** dimasukkan. Setelah migrate, kolom `ChatMessage.seq` tetap `bigint` di database.

### 5.4 SQL yang di-apply (ringkas)

1. `CREATE TYPE "EmailFolder" AS ENUM ('INBOX', 'SENT', 'DRAFTS', 'TRASH');`
2. `CREATE TYPE "EmailStatus" AS ENUM ('UNREAD', 'READ');`
3. `CREATE TABLE "Email" (...);` — kolom locked plan §3.1
4. Unique `"Email_messageId_key"`
5. Index: `(companyId, folder)`, `(companyId, status)`, `(companyId, leadId)`, `(companyId, suggestedLeadId)`, `(companyId, createdAt)`, `messageId`, `contactMessageId`, `parentEmailId`
6. FK: `Company` CASCADE; `Lead` ×2 SET NULL; `ContactMessage` SET NULL; `User` (sentBy) SET NULL; `Email` parent SET NULL

Tidak ada `DROP TABLE`, `DROP COLUMN`, atau ALTER pada Lead / ContactMessage / User / Company / Menu.

### 5.5 Post-apply schema check

| Item | Status |
|------|--------|
| Email table | YES (0 row) |
| EmailFolder | YES |
| EmailStatus | YES |
| expected indexes | YES |
| expected foreign keys | YES |
| Lead / ContactMessage / User / Company / Menu preserved | YES |

---

## 6. SMTP implementation (Phase 1)

| Aspek | Keputusan |
|-------|-----------|
| Lokasi | `packages/notifications/src/email/index.ts` saja |
| Library | nodemailer |
| TLS | `tls.rejectUnauthorized: config.rejectUnauthorized ?? true` |
| Kredensial | dari `SmtpConfig` (env), tidak di-log |
| Hasil sukses | mengembalikan RFC `messageId` untuk persistensi Phase 2 |
| Config kosong | throw `EMAIL_NOT_CONFIGURED` |
| Integrasi nyata ke Hostinger | **belum diuji** (IMAP/SMTP pass kosong) |

---

## 7. Lead matching (Phase 1 — schema only)

Tidak ada `LeadSuggestionService` di Phase 1.

Yang dikunci di schema:

- `suggestedLeadId` dan `leadId` kolom terpisah
- keduanya nullable
- tidak ada default selain null
- tidak ada trigger/DB logic yang mengisi `leadId`

Konfirmasi staf, matching exact email, dan tes suggestion adalah **Phase 2**.

---

## 8. Permission / Menu Registry

### Permission

Tepat empat: `email:read`, `email:send`, `email:delete`, `email:manage`.

Lead association akan memakai `email:manage` (bukan `email:send`) — enforcement endpoint di Phase 2.

### Menu

Seed `leads.email` mengarah ke `viewResource: "email"`, `viewAction: "read"`.  
`seed:menu` belum dijalankan.

---

## 9. Environment variables

Diimplementasikan di schema + `.env.example`. Placeholder, tanpa password.

Integrasi IMAP/SMTP nyata **membutuhkan credential lokal** yang tidak tersedia di sesi ini.

Tidak dimodifikasi:

- production environment variables
- file `.env` production
- secret di git (password yang sempat ada di `.env.example` dihapus)

---

## 10. Validation

| Check | Hasil | Catatan |
|-------|--------|---------|
| lint (turbo, 10 packages) | **PASS** | script lint banyak yang skip-by-design |
| `prisma format` | **PASS** | |
| `prisma generate` | **PASS** | |
| typecheck `@medcal/config` | **PASS** | |
| typecheck `@medcal/auth` | **PASS** | |
| typecheck `@medcal/notifications` | **PASS** | |
| typecheck `@medcal/shared` | **PASS** | |
| typecheck monorepo (`pnpm typecheck`) | **FAIL** | error **pre-existing**, bukan Phase 1 |
| build | **TIDAK DIJALANKAN** | diblokir typecheck monorepo |
| tests | **N/A** | tidak ada tes Email Phase 1; EmailsModule belum ada |
| IMAP/SMTP live | **TIDAK DIJALANKAN** | credential kosong; Phase 2+ |
| local Email migration apply + verify | **PASS** | `pkmdb` lokal; lihat §5 |

### Kegagalan typecheck yang **bukan** Phase 1

`@medcal/web-api` / `packages/shared/src/http/api-fetch.ts:29`:

- `Property 'message' does not exist on type '{}'`
- argumen `unknown` ke konstruktor `ApiError`

File ini **tidak diubah** di Phase 1. Tidak diperbaiki (out of scope locked plan).

IDE Prisma lint “datasource url no longer supported” merujuk Prisma 7; repo memakai Prisma **6.19.3**. Bukan blocker generate v6.

---

## 11. Security

| Kontrol | Phase 1 |
|---------|---------|
| TLS verify default on | YA |
| Tidak copy `rejectUnauthorized: false` | YA |
| Credential tidak di-hardcode | YA |
| Password dihapus dari `.env.example` | YA |
| Tidak log password | YA (tidak ada logger credential) |
| companyId isolation | schema siap; query di Phase 2 |
| HTML sanitization | Phase 3 (portal display) |
| Production deploy | **tidak dilakukan** |

---

## 12. Deviations

**NONE** terhadap locked architecture Email (single model, empat permission, SMTP di notifications, tidak auto-assign Lead, tidak production deploy).

Koreksi implementasi (bukan architectural deviation):

1. **SMTP_PASS dihapus dari `.env.example`** — locked plan menuntut tidak commit password nyata.
2. **`prisma migrate dev` tidak selesai** — non-interactive + auto-diff berisi ALTER `ChatMessage.seq`. SQL Email-only di-apply ke **lokal** via `prisma migrate deploy`.
3. **ALTER `ChatMessage.seq` tidak di-apply** — drift Int vs bigint, di luar locked Email plan. Schema Prisma masih `Int`; DB tetap `bigint`.
4. **Typecheck monorepo FAIL** — pre-existing `packages/shared/src/http/api-fetch.ts`; tidak disentuh.

---

## 13. Scope check

| Pertanyaan | Jawaban |
|------------|---------|
| LOCKED PLAN diikuti | **YES** |
| EmailsModule / IMAP sync / Portal | **TIDAK** (benar untuk Phase 1) |
| Automatic Lead assignment | **TIDAK** |
| Automatic Lead creation | **TIDAK** |
| Background IMAP / cron / queue | **TIDAK** |
| Attachment / rich text | **TIDAK** |
| SMTP kedua di EmailsModule | **TIDAK** |
| Production migration / SSH / deploy | **TIDAK** |
| Git commit | **TIDAK** |

---

## 14. Known limitations (setelah Phase 1)

1. Tabel `Email` **sudah ada** di `pkmdb` lokal (kosong). Belum ada di production.
2. Drift `ChatMessage.seq` (Prisma `Int` vs DB `bigint`) masih ada; tidak diperbaiki di Phase 1.
3. Seed menu (`leads.email` aktif / `viewResource=email`) belum di-upsert ke DB.
4. `sendEmail` belum dipanggil dari Nest (Phase 2).
5. Tidak ada tes unit SMTP/IMAP/permission Email (Phase 2/4).
6. Integrasi Hostinger belum terverifikasi.
7. Typecheck monorepo masih gagal karena issue lama di `api-fetch.ts`.

---

## 15. Prerequisites sebelum Phase 2

Selesai untuk lokal:

1. `DATABASE_URL` development (root `.env`) — dipakai, tidak diubah.
2. Migrasi Email applied ke `pkmdb` lokal.
3. SQL reviewed, additive-only.
4. `prisma generate` setelah migrate.

Masih opsional / belum:

5. `pnpm --filter @medcal/db seed:menu` (aktifkan menu Email di DB).
6. Isi `IMAP_*` / `SMTP_*` di `.env` lokal (jangan commit) untuk tes live Phase 2+.
7. Jangan mulai Phase 2 sampai instruksi eksplisit.
8. Production: nanti `prisma migrate deploy` saja (Phase 5) — **belum** dijalankan.

---

## 16. Konfirmasi locked constraints

- tidak ada automatic Lead assignment
- tidak ada automatic Lead creation
- IMAP sync masih **belum diimplementasi** (manual-only akan di Phase 2)
- tepat empat Email permissions
- SMTP tetap di `packages/notifications`
- tidak ada attachments
- tidak ada production deployment

---

## 17. Git status (saat laporan ini ditulis)

```
 M .env.example
 M .env.production.example          # unrelated to Phase 1
 M .gitignore                      # unrelated to Phase 1
 M packages/auth/src/access-control.ts
 M packages/config/src/index.ts
 M packages/db/prisma/schema.prisma
 M packages/db/prisma/seed-menu.ts
 M packages/notifications/package.json
 M packages/notifications/src/email/index.ts
 M packages/shared/src/schemas/index.ts
 M pnpm-lock.yaml
?? docs/cursor/plan/email-managements/
?? packages/db/prisma/migrations/20260820121500_add_email_system/
```

Branch: `main`. Tidak ada commit Phase 1 (tidak diminta).

---

**Phase 1 COMPLETE** (kode foundation + migrasi Email di DB lokal `pkmdb`).  
**Jangan mulai Phase 2 sampai diinstruksikan.**

*Document: PHASE-1-IMPLEMENTATION-REPORT*  
*Last updated: 20 Agustus 2026 (post-migration checkpoint)*
