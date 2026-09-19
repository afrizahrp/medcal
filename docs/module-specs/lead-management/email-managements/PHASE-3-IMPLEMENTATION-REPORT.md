# EMAIL → LEAD MANAGEMENT
# PHASE 3 IMPLEMENTATION REPORT

**STATUS:** PHASE 3 IMPLEMENTED (Portal UI mailbox + compose baseline)  
**TANGGAL:** 20 Agustus 2026  
**BASELINE:** `LOCKED-FINAL-IMPLEMENTATION-PLAN-EMAIL-LEAD-MANAGEMENT.md`  
**PRIOR PHASE:** `PHASE-2-IMPLEMENTATION-REPORT.md` (APPROVED)  
**MODE:** STRICT IMPLEMENTATION (dengan penyesuaian UX tambahan berdasarkan instruksi user)

---

## 1. Ringkasan eksekutif

Phase 3 mengaktifkan Portal Email Management di `apps/portal`:

- navigasi Email via Menu Registry (`leads.email`)
- halaman mailbox: Inbox, Sent, Drafts, Trash
- detail email (read/unread, metadata, body aman/sanitized, thread parent link)
- search, pagination, loading/empty/error state
- permission-aware UI (`email:read`, `email:delete`, `email:send`, `email:manage`)
- aksi per-baris (delete/restore/permanent delete) mengikuti UX referensi easy-app
- compose baseline + reply entry-point (plain textarea, kirim & simpan draft)

Backend API Phase 2 tetap menjadi authority; tidak ada perubahan Prisma schema dan tidak ada redesign backend.

---

## 2. Scope yang terealisasi

## 2.1 Mailbox UI (Phase 3A core)

| Item | Status |
|------|--------|
| Email navigation/menu | YA |
| Inbox | YA |
| Sent | YA |
| Drafts | YA |
| Trash | YA |
| Email list | YA |
| Email detail | YA |
| Conversation display (parent context) | YA (single parent context) |
| Read/unread | YA |
| Pagination | YA |
| Loading/empty/error states | YA |
| Permission-aware UI | YA |

## 2.2 UX extension (atas permintaan user setelah checkpoint)

| Item | Status |
|------|--------|
| Folder tabs icon-only + tooltip | YA |
| Active folder icon disabled (seperti breadcrumb current item) | YA |
| Row action delete di list | YA |
| Row action restore/permanent delete di Trash | YA |
| Compose button + FAB ala referensi easy-app | YA |
| Compose page (plain textarea) | YA |
| Reply entry ke compose via query params | YA |

---

## 3. Implemented detail

## 3.1 Routing & page structure

```
apps/portal/src/app/management/email/
├── page.tsx                         # redirect ke /email/inbox
├── inbox/page.tsx
├── sent/page.tsx
├── drafts/page.tsx
├── trash/page.tsx
├── compose/page.tsx
├── compose/compose-page-client.tsx
├── [id]/page.tsx
├── email-page-client.tsx
├── email-ui.tsx
└── use-emails-query.ts
```

URL publik tetap `/email/*` (dengan host rewrite lewat `apps/portal/src/proxy.ts` ke group `management`).

## 3.2 Permission behavior

| Permission | Perilaku UI |
|---|---|
| `email:read` | akses menu Email, mailbox pages, detail, read/unread, sync inbox |
| `email:send` | Compose button/FAB, halaman compose, kirim dan simpan draft |
| `email:delete` | delete per-baris, restore, permanent delete, tombol trash/restore detail |
| `email:manage` | belum ada control association interaktif khusus di UI (backend siap) |

Me capability diperluas/terpakai di portal:

- `apps/portal/src/lib/use-require-session.ts`
- `apps/api/src/modules/me/me.controller.ts` (Phase 2)

## 3.3 API integration yang dipakai UI

| Endpoint | Pemakaian |
|---|---|
| `GET /emails` | list per folder + search/status/page/pageSize/sort |
| `GET /emails/statistics` | counters folder/unread |
| `GET /emails/:id` | detail |
| `PATCH /emails/:id` | read/unread toggle |
| `DELETE /emails/:id` | move to trash |
| `POST /emails/:id/restore` | restore |
| `DELETE /emails/:id/permanent` | permanent delete dari Trash |
| `POST /emails/sync` | manual inbox sync |
| `POST /emails` | send compose |
| `POST /emails/draft` | save draft |

## 3.4 Detail page behavior

- breadcrumbs konsisten dengan layout Inbox
- card width dibuat konsisten dengan halaman list (`w-full px-4 ...`)
- metadata: dari/kepada/cc/waktu/status/lead atau suggested lead
- auto mark-as-read saat membuka email unread
- parent conversation context via `parentEmail`
- body render aman:
  - plain text bila `textBody` tersedia
  - HTML disanitasi via `apps/portal/src/lib/sanitize-html.ts` (`isomorphic-dompurify`)

## 3.5 List UX behavior

- desktop table + mobile list
- unread styling
- row action:
  - Inbox/Sent/Drafts: move to Trash
  - Trash: restore + permanent delete
- folder nav pakai ikon + tooltip + badge count
- ikon folder aktif menjadi disabled/non-clickable

---

## 4. File changes (Phase 3)

## 4.1 New files

| Path |
|------|
| `apps/portal/src/app/management/email/page.tsx` |
| `apps/portal/src/app/management/email/inbox/page.tsx` |
| `apps/portal/src/app/management/email/sent/page.tsx` |
| `apps/portal/src/app/management/email/drafts/page.tsx` |
| `apps/portal/src/app/management/email/trash/page.tsx` |
| `apps/portal/src/app/management/email/[id]/page.tsx` |
| `apps/portal/src/app/management/email/email-page-client.tsx` |
| `apps/portal/src/app/management/email/email-ui.tsx` |
| `apps/portal/src/app/management/email/use-emails-query.ts` |
| `apps/portal/src/app/management/email/compose/page.tsx` |
| `apps/portal/src/app/management/email/compose/compose-page-client.tsx` |
| `apps/portal/src/lib/sanitize-html.ts` |

## 4.2 Modified files

| Path | Area |
|------|------|
| `apps/portal/src/lib/use-require-session.ts` | capabilities email* |
| `apps/portal/src/components/management/header.tsx` | show email control |
| `apps/portal/src/components/management/header-controls.tsx` | email icon/link |
| `apps/portal/src/app/management/page.tsx` | dashboard shortcut email |
| `apps/portal/src/components/management/icons.tsx` | folder action icons |
| `apps/portal/package.json` | add `isomorphic-dompurify` |
| `pnpm-lock.yaml` | dependency lock update |

## 4.3 Backend stabilization during Phase 3

| Path | Perubahan |
|------|-----------|
| `apps/api/src/modules/emails/emails.service.ts` | explicit `@Inject(...)` DI |
| `apps/api/src/modules/emails/imap-sync.service.ts` | explicit `@Inject(...)` DI |

Tujuan: memperbaiki runtime error `Cannot read properties of undefined (reading 'findSuggestion')` pada `GET /emails/:id`.

---

## 5. Validation

| Check | Result | Catatan |
|---|---|---|
| `pnpm --filter @medcal/portal typecheck` | PASS | setelah perubahan UI email |
| `pnpm --filter @medcal/portal build` | PASS | route email ter-generate |
| `pnpm --filter @medcal/portal lint` | PASS* | script saat ini `lint portal skipped` |
| `ReadLints` pada file email yang diubah | PASS | tidak ada lint baru |
| `pnpm --filter @medcal/api typecheck` | FAIL (pre-existing) | blocked by issue lama `packages/shared/src/http/api-fetch.ts` |
| runtime detail email (`GET /emails/:id`) | PASS | setelah fix DI backend |

---

## 6. Deviations & notes

## 6.1 Deviasi dari checkpoint 3A awal

Pada checkpoint awal, compose/reply diminta ditunda ke 3B.  
Namun setelah itu ada instruksi user eksplisit untuk UX yang mengarah ke compose flow; maka diimplementasikan:

- compose page baseline
- reply entry-point dari detail
- compose button + FAB

Ini dicatat sebagai **scope extension by user request**, bukan perubahan arsitektur.

## 6.2 Hal yang tetap tidak dilakukan

- tidak ada perubahan Prisma schema
- tidak ada backend architecture redesign
- tidak ada permission baru selain 4 permission locked
- tidak ada deployment production / SSH / migration production
- tidak ada commit git

---

## 7. Known limitations (pasca Phase 3)

1. Thread UI masih berbasis parent context (`parentEmail`) dan belum thread tree penuh.
2. Lead association interaktif (confirm/change/remove/dismiss suggestion UI) belum dibuat sebagai flow dedicated.
3. Attachment/rich text editor tetap tidak diimplementasikan.
4. Monorepo typecheck penuh masih terblokir issue lama `api-fetch.ts` (di luar scope phase ini).

---

## 8. Git status (saat laporan ditulis)

Working tree masih dirty lintas Phase 1/2/3 dan dokumen.  
Tidak ada commit dilakukan.

---

## 9. Konfirmasi akhir

- Menu Email aktif via registry dan gated permission
- Mailbox + detail + read/unread + pagination berjalan
- UX icon nav + row delete/restore sesuai permintaan
- Compose baseline tersedia (plain textarea, send/draft)
- Backend tetap authority, tanpa perubahan arsitektur inti

---

**Phase 3 IMPLEMENTED sesuai kebutuhan aktual sesi ini.**  
*Document: PHASE-3-IMPLEMENTATION-REPORT*

