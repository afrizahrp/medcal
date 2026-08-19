# Laporan Implementasi: G4 Customer Self-Registration Only

**Tanggal:** 19 Agustus 2026  
**Sifat:** Implementasi sempit — hanya gate registrasi G4.  
**Prompt:** `docs/cursor/plan/Cursor — Implement G4 Customer Self-Registration Only.md`  
**Audit sebelumnya:** `docs/cursor/plan/g4-revision-impact-audit.md`

---

## 1. Files Changed

| File | Perubahan |
|------|-----------|
| `apps/api/src/modules/whitelist/registration-gate.ts` | Logika gate G4 |
| `apps/api/src/modules/whitelist/registration-gate.integration.test.ts` | Tes perilaku G4 |
| `packages/auth/src/index.ts` | Komentar saja |
| `packages/shared/src/utils/index.ts` | Komentar saja |
| `apps/api/package.json` | Tambah dependensi `zod` (bukan perilaku G4; dibutuhkan agar tes gate bisa boot `AppModule` yang memuat `UsersModule`) |

Tidak diubah: `registration-gate.hook.ts`. Helper `isAllowedRegistrationDomain` tetap exact-match domain perusahaan.

---

## 2. G4 Behavior

```text
Internal company email (@kalibrasimedika.co.id)
→ domain + ACTIVE whitelist required

External email (gmail, hospital, dll.)
→ no whitelist required

Registration
→ User only (status default INVITED)

Membership
→ none

Role
→ none
```

Logika gate:

```text
IF email domain == kalibrasimedika.co.id
    THEN require EmailWhitelist ACTIVE
    ELSE allow registration
```

Bukan `domain OR whitelist`. Bukan `domain AND whitelist` untuk semua user.

Sign-up **tidak** membuat `UserMembership` dan **tidak** meng-assign role (termasuk `CUSTOMER`).

---

## 3. Tests

### Ditambah / diubah

File: `apps/api/src/modules/whitelist/registration-gate.integration.test.ts`

- Gmail tanpa whitelist → ALLOW
- `hospital.co.id` tanpa whitelist → ALLOW
- Staf tanpa whitelist → REJECT
- Staf + ACTIVE → ALLOW
- Staf + REVOKED → REJECT
- Normalisasi case/whitespace staf tetap
- Suffix-trick (`kalibrasimedika.co.id.evil.com`) diperlakukan eksternal → ALLOW
- Sign-up Gmail nyata: User ada, `UserMembership` = 0

### Hasil

```text
pnpm test -- src/modules/whitelist/registration-gate.integration.test.ts
  (cwd: apps/api)
  → Test Files 1 passed | Tests 16 passed

pnpm test  (packages/shared)
  → Test Files 3 passed | Tests 15 passed

pnpm test  (packages/auth)
  → Test Files 1 passed | Tests 12 passed

pnpm typecheck  (apps/api, packages/shared, packages/auth)
  → tsc --noEmit exit 0
```

---

## 4. Out of Scope — tidak diubah

- RBAC / `createAccessControl` / guards / `/me` / chat socket
- Users API / membership provisioning / auto-role CUSTOMER
- G1, G2, G3 / semantik `User.status`
- Model / API / UI whitelist / un-revoke
- Schema Prisma / `proxy.ts` / frontend authorization
- Email verification / password reset

---

## 5. Remaining Issues

- `zod` sebelumnya tidak ada di `apps/api` meski `users.controller.ts` mengimpornya; tes gate gagal load `AppModule` sampai dependensi ditambah. Peer warning: `better-call` minta `zod@^4`, workspace memakai `^3.24.2`.
- Tipe `INVALID_DOMAIN` masih ada di gate/hook tetapi tidak lagi dikembalikan (email eksternal diizinkan). Tidak dihapus supaya diff tetap sempit.
- Tanpa email verification, registrasi publik bisa menghasilkan akun spam. Tidak memberi akses aplikasi.

---

## 6. Constraint yang tetap berlaku

```text
REGISTRATION
    ≠
PROVISIONING
    ≠
ROLE ASSIGNMENT
```

Siapa pun boleh membuat akun dengan email eksternal. Tidak ada yang mendapat akses aplikasi hanya karena register. Akses tetap:

```text
User
  → Admin provisioning
  → UserMembership
  → UserMembership.role
  → Permission
```
