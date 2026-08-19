# Laporan Implementasi: G5 User Activation Lifecycle

**Tanggal:** 19 Agustus 2026  
**Sifat:** Implementasi sempit — otorisasi status + provisioning atomik.  
**Audit sebelumnya:** `docs/cursor/plan/g5-decision-impact-audit.md`

---

## 1. Files Changed

| File | Perubahan |
|------|-----------|
| `apps/api/src/common/guards/company-role.guard.ts` | Tolak selain `ACTIVE` |
| `apps/api/src/modules/me/me.controller.ts` | Tolak selain `ACTIVE` |
| `apps/api/src/modules/chat/chat-socket-auth.ts` | Tolak selain `ACTIVE` (`USER_DISABLED` / `USER_NOT_ACTIVE`) |
| `apps/api/src/modules/users/users.service.ts` | `assignMembership` atomik: membership + `ACTIVE` jika `INVITED` |
| `apps/api/src/modules/users/users.service.test.ts` | Tes G5 provisioning |

Tidak diubah: schema Prisma, RBAC catalog, G1/G2/G3/G4, revoke session, UI, `updateStatus` (disable/re-enable tetap `PATCH /status`).

---

## 2. G5 Behavior

```text
Akses aplikasi
→ User.status === ACTIVE
   AND
   UserMembership valid untuk COMPANY_ID
```

| status | membership | akses |
|--------|------------|--------|
| INVITED | tidak ada | NO |
| INVITED | ada | NO |
| ACTIVE | tidak ada | NO |
| ACTIVE | ada | YES |
| DISABLED | tidak ada | NO |
| DISABLED | ada | NO |

**Provisioning** (`POST /users/:id/memberships`):

```text
INVITED + assign role
→ UserMembership created
→ status = ACTIVE
→ application access
```

**Disable / re-enable** (tidak diubah):

```text
ACTIVE → PATCH status DISABLED → no access, membership tetap
DISABLED → PATCH status ACTIVE → access restored, membership tetap
```

Assign membership **tidak** mengaktifkan ulang user `DISABLED` (hindari bypass disable).

---

## 3. Tests

**Ditambah** di `users.service.test.ts`:

- Assign membership ke user `INVITED` → status menjadi `ACTIVE`
- Assign membership ke user `DISABLED` → status tetap `DISABLED`

**Hasil:**

```text
pnpm test -- src/modules/users/users.service.test.ts
  (cwd: apps/api)
  → Test Files 1 passed | Tests 24 passed

pnpm typecheck  (apps/api)
  → tsc --noEmit exit 0
```

---

## 4. Out of Scope — tidak diubah

- RBAC / `createAccessControl` / permission catalog
- Users API surface (endpoint, DTO) selain perilaku `assignMembership`
- G1 (registrasi ≠ provisioning)
- G2 (SUPERADMIN bootstrap only)
- G3 (disable = `DISABLED`, session tidak di-revoke)
- G4 (self-register email eksternal)
- Schema / migrasi
- UI management users
- Email verification / password reset / un-revoke whitelist

---

## 5. Remaining Issues

- Tidak ada tes HTTP e2e khusus `GET /me` atau guard untuk `INVITED + membership → 403`. Perilaku sudah di kode; tes otomatis saat ini di service layer.
- UI users masih dua kontrol terpisah (status vs role). Setelah G5, assign membership sudah mengaktifkan `INVITED`; admin tidak wajib `PATCH status` untuk kasus itu.
- `INVITED + membership` yang sudah ada di database (data lama, jika ada) akan kehilangan akses sampai admin set `ACTIVE` — sesuai G5.

---

## 6. Constraint yang tetap berlaku

```text
REGISTRATION ≠ PROVISIONING ≠ ROLE ASSIGNMENT
INVITED ≠ authorized
ACTIVE + membership = authorized
DISABLED = no access (membership may remain)
```

Siapa pun boleh punya akun. Tidak ada yang mendapat akses aplikasi hanya karena register atau hanya karena punya membership. Akses tetap:

```text
User.status = ACTIVE
  AND
UserMembership
  → UserMembership.role
  → Permission
```
