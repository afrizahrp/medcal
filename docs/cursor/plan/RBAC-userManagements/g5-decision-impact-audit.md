# G5 Decision Lock + Impact Audit

**Tanggal:** 19 Agustus 2026  
**Sifat:** AUDIT + DECISION DOCUMENTATION ONLY — tidak ada perubahan kode, schema, migrasi, tes, atau UI.  
**Nama di schema:** `UserStatus = INVITED | ACTIVE | DISABLED`. Di dokumen ini `INVITED` = `INVITED` Prisma.

---

## 1. Decision Status

```text
G1 = LOCKED    registrasi ≠ provisioning
G2 = LOCKED    SUPERADMIN hanya bootstrap CLI
G3 = LOCKED    disable = User.status = DISABLED; session tidak di-revoke
G4 = REVISED   customer self-register tanpa whitelist
G5 = LOCKED    akses aplikasi = ACTIVE AND membership
```

**G5 tidak mencabut G3.** G5 **memperketat** G3: selain menolak `DISABLED`, `INVITED` juga bukan state terotorisasi.

```text
Akses aplikasi memerlukan KEDUANYA:
  1. User.status === ACTIVE
  2. UserMembership valid untuk COMPANY_ID
```

| status | membership | akses hari ini (G3) | akses G5 |
|--------|------------|---------------------|----------|
| INVITED | tidak ada | NO (tidak ada membership) | NO |
| INVITED | ada | **YES (GAP)** | **NO** |
| ACTIVE | tidak ada | NO | NO |
| ACTIVE | ada | YES | YES |
| DISABLED | tidak ada | NO | NO |
| DISABLED | ada | NO | NO |

Aturan penting:

> `INVITED` **bukan** state aplikasi yang terotorisasi. Jangan anggap `INVITED + membership` cukup untuk otorisasi.

---

## 2. Lifecycle yang dikunci

```text
REGISTER
   ↓
User.status = INVITED
   ↓
NO UserMembership
   ↓
NO application access
   ↓
Admin provisioning
   ↓
UserMembership created
   ↓
User.status = ACTIVE
   ↓
Application access
```

Disable:

```text
ACTIVE
   ↓
Admin disables user
   ↓
User.status = DISABLED
   ↓
NO application access
   (UserMembership tetap)
```

Re-enable:

```text
DISABLED
   ↓
Admin enables user
   ↓
User.status = ACTIVE
   ↓
Existing UserMembership remains
   ↓
Application access restored
```

Provisioning secara konseptual:

```text
User.status = INVITED
        ↓
Admin assigns Company + Role
        ↓
UserMembership created
        ↓
User.status = ACTIVE
```

---

## 3. Perilaku aktual vs G5

### 3.1 Authorization — NEEDS CHANGE (fase implementasi terpisah)

Tiga titik yang sama: hanya menolak `DISABLED`, **bukan** `INVITED`.

**`CompanyRoleGuard`** — `apps/api/src/common/guards/company-role.guard.ts`

```49:51:apps/api/src/common/guards/company-role.guard.ts
    if (membership.user.status === "DISABLED") {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
```

**`MeController`** — `apps/api/src/modules/me/me.controller.ts`

```34:36:apps/api/src/modules/me/me.controller.ts
    if (membership.user.status === "DISABLED") {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
```

**`chat-socket-auth`** — `apps/api/src/modules/chat/chat-socket-auth.ts`

```105:107:apps/api/src/modules/chat/chat-socket-auth.ts
  if (membership.user.status === "DISABLED") {
    throw new ChatSocketAuthError("USER_DISABLED", "User account is disabled");
  }
```

Akibat: `INVITED + membership` lolos `GET /me`, REST ber-`@RequirePermission`, dan chat socket.

### 3.2 Provisioning — NEEDS CHANGE

**`UsersService.assignMembership`** — `apps/api/src/modules/users/users.service.ts`

Hanya `prisma.userMembership.create`. **Tidak** set `status = ACTIVE`.

**`UsersService.updateStatus`** — file yang sama

Menerima `INVITED | ACTIVE | DISABLED`, tetapi query mensyaratkan membership di company ini (`memberships: { some: { companyId } }`). Jadi:

- User baru (`INVITED`, tanpa membership) tidak bisa di-`PATCH /users/:id/status` sampai membership ada.
- Admin assign membership → user tetap `INVITED` + membership → **akses terbuka di G3**.
- Aktivasi `ACTIVE` adalah langkah UI terpisah, tidak atomik.

**UI** — `apps/portal/src/app/management/users/[id]/page.tsx` dan `.../users/assign/page.tsx`: dua aksi terpisah (assign role vs ganti status). Tidak ada transaksi “provision = membership + ACTIVE”.

### 3.3 Bootstrap SUPERADMIN — NO CHANGE

`apps/api/src/bootstrap-superadmin.ts` sudah set `User.status = ACTIVE` lalu membuat membership SUPERADMIN. Selaras G5.

### 3.4 Registrasi G4 — NO CHANGE

Sign-up tetap `User` default `INVITED` (Prisma `@default(INVITED)`), tanpa membership. Sudah benar untuk G1+G4+G5.

### 3.5 Disable / re-enable — NO CHANGE (perilaku)

`PATCH /users/:id/status` ke `DISABLED` / `ACTIVE` tidak menghapus membership. Session Better Auth tidak di-revoke (G3). Selaras G5.

### 3.6 List users — NO CHANGE / catatan UX

`GET /users` hanya user **dengan** membership. Calon user `INVITED` tanpa membership hanya di `GET /users/without-membership`. Cukup untuk alur provision.

### 3.7 Dokumentasi yang keliru

`docs/cursor/plan/implementation-report-user-management.md` §11.1 mengklaim guard memblokir `INVITED`. **Kode tidak melakukan itu.** Klaim itu menjadi benar hanya setelah G5 diimplementasikan.

---

## 4. Klasifikasi dampak (untuk fase implementasi terpisah)

| Area | Status G5 |
|------|-----------|
| `CompanyRoleGuard` | NEEDS CHANGE — tolak selain `ACTIVE` |
| `MeController` | NEEDS CHANGE — sama |
| `chat-socket-auth` | NEEDS CHANGE — sama |
| `assignMembership` | NEEDS CHANGE — set `ACTIVE` atomik dengan create membership **atau** dokumentasikan dua langkah wajib |
| `updateStatus` | NO CHANGE / kecil — disable/re-enable sudah benar; “aktifkan” tanpa membership sudah tertutup query |
| Bootstrap | NO CHANGE |
| Registration gate G4 | NO CHANGE |
| Access control catalog | NO CHANGE |
| Users list/UI | NEEDS CHANGE ringan — copy/UX: assign = activate; INVITED + membership = belum akses |
| Tes guard/service | NEEDS CHANGE — kasus `INVITED + membership → 403` |
| Schema Prisma | NO CHANGE — enum sudah cukup |
| Session revoke | NO CHANGE — tetap G3 |
| Forensic audit bagian 15 | NEEDS CHANGE — catat G5 LOCKED (dokumentasi, bukan kode) |

**Jangan** (saat implementasi nanti): inferensi role dari email, hapus whitelist, auto-membership saat register, `User.role` paralel, plugin Better Auth admin/organization.

---

## 5. Keputusan terbuka sebelum implementasi G5

Hanya satu yang memengaruhi desain API:

**Apakah `POST /users/:id/memberships` secara atomik set `User.status = ACTIVE`?**

- Ya (disarankan, sesuai teks G5): satu aksi admin = akses.
- Tidak: admin wajib `PATCH status` terpisah; risiko lupa = user tetap `INVITED` (aman di G5, buruk di UX).

Disable/re-enable tetap `PATCH /status`. Tidak perlu keputusan baru.

---

## 6. Constraint

```text
REGISTRATION ≠ PROVISIONING ≠ ROLE ASSIGNMENT
INVITED ≠ authorized
ACTIVE + membership = authorized
DISABLED = no access (membership may remain)
```

G1–G4 tidak dibuka kembali oleh G5.
