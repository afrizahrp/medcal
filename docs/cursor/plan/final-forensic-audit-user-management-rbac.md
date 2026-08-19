# Audit Forensik Final — User Management + RBAC

**Tanggal:** 19 Agustus 2026  
**Sifat:** READ-ONLY. Sumber kebenaran = kode repo saat ini. Laporan lama hanya sejarah.  
**Kode tidak diubah dalam tugas audit ini.**

---

## Verdict

**User Management + RBAC secara arsitektur sudah lengkap terhadap G1–G5.** Fondasi autentikasi/otorisasi konsisten. Produk UM operasional (list, provision, status, role, whitelist UI) ada.

**Belum “selesai operasional penuh”** jika standarnya mencakup: tes HTTP 401/403 untuk users, un-revoke whitelist, proteksi SUPERADMIN terakhir, dan permission bisnis untuk SUPERVISOR/TECHNICIAN/FINANCE (masih `{}` — keputusan produk, bukan cacat G1–G5).

Tidak ada temuan yang membatalkan G1–G5.

---

## G1–G5 vs kode

| Gate | Keputusan | Kode | Hasil |
|------|-----------|------|--------|
| **G1** | Register ≠ provision | Sign-up Better Auth; default `INVITED`; tidak ada hook membership | **PASS** |
| **G2** | SUPERADMIN hanya bootstrap | Zod assign/update menolak `SUPERADMIN`; service 403; bootstrap `findFirst` | **PASS API.** Residual: tidak ada unique DB; disable SUPERADMIN terakhir tidak dilindungi |
| **G3** | Disable = `DISABLED`; session tidak di-revoke | Guard/me/socket menolak non-`ACTIVE` (termasuk `DISABLED`); tidak ada revoke session | **PASS** |
| **G4** | Customer self-register tanpa whitelist | Domain non-perusahaan diizinkan; `@kalibrasimedika.co.id` wajib whitelist ACTIVE | **PASS** |
| **G5** | Akses = `ACTIVE` AND membership | Guard, `/me`, socket: `status !== "ACTIVE"` → 403; `assignMembership` set `ACTIVE` jika `INVITED` | **PASS** |

Lifecycle yang ditegakkan:

```text
REGISTER → User INVITED, no membership → no access
Admin assignMembership → membership + ACTIVE (jika INVITED) → access
ACTIVE → PATCH DISABLED → no access, membership tetap
DISABLED → PATCH ACTIVE → access kembali
INVITED + membership (tanpa ACTIVE) → no access
```

Assign **tidak** mengaktifkan `DISABLED` (tidak bisa bypass disable).

---

## 1. Authentication

| Item | Perilaku |
|------|----------|
| Better Auth in-process Nest | Ya. Tidak ada plugin `admin` / `organization` |
| Session | Cookie; `/me`, guard, socket memakai `auth.api.getSession` |
| Sign-up | Form portal; **tidak** mengirim role |
| Default status | Prisma `@default(INVITED)` |
| Email verification | `requireEmailVerification: false` (keputusan lama, bukan G5) |

---

## 2. User / membership

- `User.status`: `INVITED | ACTIVE | DISABLED`
- `UserMembership`: unique `(userId, companyId)`, `role`, **tanpa** status membership
- Runtime tenant: `process.env.COMPANY_ID` saja
- `GET /users` hanya user **dengan** membership
- Calon user: `GET /users/without-membership` (`take: 50`)

---

## 3. RBAC

Otoritas: `UserMembership.role` + `hasPermission` + `CompanyRoleGuard`. Bukan `User.role`, bukan JWT claim.

| Role | Permission aktual |
|------|-------------------|
| SUPERADMIN | contactMessage:read, whitelist:manage, lead:read/update, chat:read/reply/close, users:read/manage, membership:manage |
| ADMIN | sama minus whitelist:manage dan users:manage; **punya** users:read + membership:manage |
| SUPERVISOR / TECHNICIAN / FINANCE / CUSTOMER | `{}` |

**Kode mati:** `AUTH_ROLES` / `assertRole` di `packages/auth/src/index.ts` — tidak dipakai otorisasi.

---

## 4. Enforcement path

```text
request → AuthGuard (session)
       → CompanyRoleGuard jika @RequirePermission
       → COMPANY_ID env → UserMembership
       → User.status === ACTIVE
       → hasPermission(role, resource, action)
       → request.companyId
```

`GET /me` **tidak** memakai decorator permission; cek membership + `ACTIVE` manual (pintu masuk app).

Chat socket: pola yang sama (`USER_DISABLED` / `USER_NOT_ACTIVE`).

Guard tanpa `@RequirePermission` = pass-through (risiko lama, LOW).

---

## 5. User Management API

| Endpoint | Permission | Catatan |
|----------|------------|---------|
| `GET /users` | users:read | Scoped membership company |
| `GET /users/without-membership` | membership:manage | Max 50 |
| `GET /users/:id` | users:read | 404 lintas company |
| `PATCH /users/:id/status` | users:manage | SUPERADMIN only; tidak hapus membership |
| `POST /users/:id/memberships` | membership:manage | G5 aktivasi INVITED; G2 tolak SUPERADMIN |
| `PATCH /users/:id/memberships` | membership:manage | Tidak bisa ubah/dari SUPERADMIN |
| `DELETE /users/:id/memberships` | membership:manage | SUPERADMIN dilindungi |

Tidak ada: invite email, create-user-by-admin (akun hanya sign-up), password reset, hapus User.

---

## 6. Menu (UX only)

`nav-config.ts` filter **role**, bukan permission. Komentar: bukan security.

- Users: SUPERADMIN, ADMIN
- Whitelist: SUPERADMIN
- Dashboard management: SUPERADMIN, ADMIN, SUPERVISOR, TECHNICIAN, FINANCE (bukan CUSTOMER)

`proxy.ts` = split host, bukan authz.

**UX, bukan bypass:** CUSTOMER `ACTIVE`+membership bisa masuk shell management (`/me` 200); nav hampir kosong; API bisnis 403. ADMIN melihat editor status di UI tetapi `PATCH status` 403 (`users:manage` hanya SUPERADMIN).

---

## 7. Tenant

`companyId` tidak dari klien. Lead/contact/chat tetap `findFirst({ id, companyId })`. Internal: `x-internal-secret` + `COMPANY_ID` env, bukan `x-company-id`.

`EmailWhitelist` global per database (disengaja F4).

---

## 8. Privilege / SUPERADMIN

| Kasus | Hasil |
|-------|--------|
| Body role SUPERADMIN | 400/403 API |
| Spoof company_id | Diabaikan |
| IDOR resource | 404 |
| API tanpa UI | Guard jalan |
| DISABLED / INVITED | 403 di me/guard/socket |
| SUPERADMIN kedua via UM | Ditolak |
| SUPERADMIN kedua via SQL | Mungkin — tidak ada unique constraint |
| Disable SUPERADMIN terakhir | **Bisa** via `PATCH status` — tidak ada guard “last superadmin” |
| Self-escalation | Tidak ada endpoint role pada diri sendiri di luar membership API (ADMIN tidak bisa promote ke SUPERADMIN) |

Bootstrap: domain lock + `findFirst` SUPERADMIN + whitelist upsert + sign-up + `ACTIVE` + membership. Bukan unique DB.

---

## 9. EmailWhitelist

- Permission `whitelist:manage` — SUPERADMIN
- Create API **hanya** domain perusahaan (staf). Customer G4 **tidak** butuh baris ini
- Revoke ada; **un-revoke tidak ada** (GAP lama)
- Revoke id tidak ada → Prisma throw (risiko 500, LOW)
- UI management ada

---

## 10. Temuan (lapor saja)

| ID | Severity | Temuan |
|----|----------|--------|
| F1 | LOW | Unique SUPERADMIN per company hanya di script bootstrap, bukan DB |
| F2 | LOW | SUPERADMIN terakhir bisa di-`DISABLED` via API |
| F3 | MEDIUM | `PATCH contact-messages/:id/status` memakai `contactMessage:read` (write via read) — keputusan lama Decision 4 |
| F4 | MEDIUM | Un-revoke whitelist tidak ada |
| F5 | LOW | `without-membership` `take: 50` — user ke-51+ tidak tampil di assign |
| F6 | LOW | Tidak ada tes HTTP 401/403 users; G5 diuji di service, bukan e2e `/me` |
| F7 | INFO | SUPERVISOR/TECHNICIAN/FINANCE permission `{}` |
| F8 | INFO | Menu ≠ permission; ADMIN UI status vs 403; CUSTOMER shell management |
| F9 | INFO | `AUTH_ROLES` mati; `User.email` VarChar(50); tidak ada email verification |
| F10 | INFO | `PATCH status` mengizinkan set `INVITED` pada user yang sudah ber-membership (akses hilang, membership tetap) |

IDOR tenant pada path yang ada: **tertutup**.

---

## 11. Tes (saat ini)

Ada: `hasPermission` (termasuk users/membership), registration gate G4, users service (termasuk G5 INVITED→ACTIVE dan DISABLED tidak auto-enable), chat socket security, lead/contact service tenant.

Tidak ada: HTTP 401/403 REST RBAC users/whitelist; e2e `INVITED+membership` → `GET /me` 403.

---

## 12. Apakah UM+RBAC “complete”?

**Complete terhadap keputusan terkunci G1–G5: ya**, dengan sisa residual di bagian 10.

**Jangan redesign:** Better Auth, `UserMembership.role`, `createAccessControl`, `CompanyRoleGuard`, `COMPANY_ID` env, G4 split domain, G5 `ACTIVE`+membership.

Pekerjaan lanjutan (jika diinginkan, bukan bagian audit ini): tes HTTP, un-revoke whitelist, proteksi last-SUPERADMIN, unique DB SUPERADMIN, permission role non-admin, Decision 4 contact-message write.
