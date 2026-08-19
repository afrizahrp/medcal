# G4 Revision Impact Audit

**Tanggal:** 19 Agustus 2026  
**Sifat:** AUDIT + DECISION REVISION ONLY — tidak ada perubahan kode, schema, migrasi, atau perilaku registrasi.  
**Sumber kebenaran:** implementasi di repositori, bukan dokumen lama.

---

## 1. Decision Status

```text
G1 = LOCKED
G2 = LOCKED
G3 = LOCKED
G4 = REVISED
```

```text
G4:
CUSTOMER may self-register with their own email.
EmailWhitelist is NOT required for CUSTOMER registration.
Registration does NOT create application access.
Admin provisioning remains mandatory.
```

**G4 lama (dicabut):** B — onboarding CUSTOMER via whitelist per-email.

**G4 baru:** self-registration CUSTOMER tanpa `EmailWhitelist`. Email/domain **tidak** menentukan role. Role otoritatif tetap `UserMembership.role`.

**Yang tidak berubah:**

- G1: registrasi ≠ provisioning. Sign-up tidak membuat membership.
- G2: `SUPERADMIN` hanya bootstrap CLI.
- G3: disable = `User.status = DISABLED` (hanya `DISABLED` yang dicek di guard).
- `EmailWhitelist` **tidak dihapus**. Masih dipakai untuk gate staf (domain perusahaan + baris ACTIVE), sampai keputusan terpisah mengubahnya.

**Catatan nama di kode (bukan di prompt):** status default adalah `INVITED`, bukan `INVITED`. Tidak ada field `INVITED`.

---

## 2. Current Registration Gate

Satu jalur untuk **semua** sign-up. Tidak ada cabang staff vs customer.

### 2.1 Alur aktual

```text
authClient.signUp.email()
  → Better Auth signUpEmail
  → databaseHooks.user.create.before
  → RegistrationGateHook.beforeUserCreate
  → getRegistrationRejectionReason(email)
       1. isAllowedRegistrationDomain(email)
          domain persis === kalibrasimedika.co.id
          gagal → INVALID_DOMAIN
       2. EmailWhitelist.findUnique(normalized email)
          tidak ada ATAU status !== ACTIVE → NOT_WHITELISTED
  → keduanya lolos → User dibuat (status default INVITED)
  → UserMembership TIDAK dibuat
```

### 2.2 File, fungsi, kondisi

| Langkah | File | Fungsi / hook | Kondisi |
|---|---|---|---|
| Domain lock | `packages/shared/src/utils/index.ts` | `isAllowedRegistrationDomain` | `emailDomain(email) === "kalibrasimedika.co.id"` (exact match, bukan substring) |
| Gate AND | `apps/api/src/modules/whitelist/registration-gate.ts` | `evaluateRegistration` | domain **dan** baris `EmailWhitelist` `ACTIVE` |
| Hook Better Auth | `apps/api/src/modules/whitelist/registration-gate.hook.ts` | `RegistrationGateHook.beforeUserCreate` (`@BeforeCreate("user")`) | throw `APIError FORBIDDEN` `REGISTRATION_INVALID_DOMAIN` / `REGISTRATION_NOT_WHITELISTED` |
| Wiring | `packages/auth/src/index.ts` | `betterAuth({ databaseHooks: {} })` | hook Nest di-wire karena `databaseHooks` ada (boleh kosong) |
| Sign-up UI | `apps/portal/src/app/sign-in/register/page.tsx` | `authClient.signUp.email({ email, password, name })` | tidak ada picker role, tidak ada cek domain di klien |
| Default status | `packages/db/prisma/schema.prisma` | `User.status UserStatus @default(INVITED)` | Better Auth **tidak** set `additionalFields` untuk status |

### 2.3 Jawaban pertanyaan audit

| # | Pertanyaan | Jawaban dari kode |
|---|---|---|
| 1 | Bisakah `customer@gmail.com` register hari ini? | **Tidak.** Domain gagal dulu (`INVALID_DOMAIN`), meski email itu di-whitelist. Tes: `registration-gate.integration.test.ts` menolak gmail meski ada baris ACTIVE. |
| 2 | Bisakah `customer@hospital.co.id` register hari ini? | **Tidak.** Domain bukan `kalibrasimedika.co.id`. Whitelist tidak menolong. |
| 3 | Apakah gate butuh domain **dan** whitelist? | **Ya.** Keduanya, untuk setiap sign-up. |
| 4 | Apakah ada pembedaan staff vs customer di registrasi? | **Tidak.** Satu gate, satu form. `isPublicEmailDomain` dipakai di matching lead (`contact-messages.service.ts`), **bukan** di registrasi. |
| 5 | Bisakah gate diubah agar customer eksternal bisa register tanpa melemahkan kontrol staf? | **Ya, secara teknis.** Pola minimum: jika domain perusahaan → tetap whitelist; jika domain lain → izinkan tanpa whitelist. Itu **tidak** memberi role/membership. Keputusan produk: apakah staf tetap di-gate whitelist (disarankan: ya). |
| 6 | Apakah Better Auth hanya membuat `User` dan membership kosong? | **Ya.** `userMembership.create` hanya di `bootstrap-superadmin.ts` dan `users.service.ts` `assignMembership`. Tidak ada hook after-create. |
| 7 | Apakah role/membership ter-assign saat registrasi? | **Tidak.** Form tidak mengirim role. Tidak ada inferensi domain → CUSTOMER. |

### 2.4 Setelah register (hari ini, jika gate lolos)

- Session Better Auth biasanya terbentuk.
- `GET /me` → 403 (tidak ada membership).
- Layout management/client → halaman Forbidden (UX, bukan bypass).
- `CompanyRoleGuard` / chat socket → 403 / disconnect.
- `GET /users` **tidak** menampilkan user tanpa membership; admin melihat mereka di `GET /users/without-membership` (halaman Assign).

---

## 3. Old G4 Assumptions

Asumsi lama: **CUSTOMER → harus `EmailWhitelist` (dan domain perusahaan) sebelum register.**

| Lokasi | Isi |
|---|---|
| `docs/cursor/plan/forensic-audit-user-management-rbac.md` bagian 15 | G4 **LOCKED (B)** whitelist per-email; domain + whitelist untuk semua termasuk customer |
| File yang sama bagian 13 langkah 1 dan 6 | `G4=B`; “Un-revoke whitelist + UI whitelist (G4 whitelist per-email)” |
| `docs/cursor/plan/implementation-report-user-management.md` §2, §11.3 | G4 = whitelist per-email; alur customer = whitelist → register → assign CUSTOMER |
| `packages/auth/src/access-control.ts` komentar | “locked 2026-08-19 G1-G4” (G4 lama tersirat) |
| `packages/auth/src/access-control.test.ts` | describe “locked 2026-08-19 G1-G4” |
| `apps/api/src/modules/whitelist/registration-gate.ts` komentar | “Registration gate (F4, locked): both must hold” — domain **dan** whitelist untuk setiap user |
| `apps/api/src/modules/whitelist/registration-gate.integration.test.ts` | menolak gmail meski whitelist ACTIVE; menolak company-domain tanpa whitelist |
| `packages/shared/src/utils/registration-domain.test.ts` | menolak `user@gmail.com` |
| `packages/auth/src/index.ts` | “Locked decision: whitelist-gated registration, no email verification step.” |
| `apps/api/src/bootstrap-superadmin.ts` | bootstrap melewati gate F4 yang sama (domain + whitelist) — tetap valid untuk SUPERADMIN, bukan G4 customer |

**Bukan asumsi G4 (jangan diubah karena G4):** UI whitelist, API whitelist, permission `whitelist:manage`, domain lock staf, G1/G2/G3.

---

## 4. Impact Assessment

| Area | Klasifikasi | Alasan |
|---|---|---|
| Registration gate (`registration-gate.ts` + hook) | **NEEDS CHANGE** | Hari ini menolak semua email non-perusahaan. G4 baru butuh customer eksternal lolos tanpa whitelist. |
| `isAllowedRegistrationDomain` | **NEEDS CHANGE** (pemakaian di gate) | Fungsi exact-match tetap berguna untuk **staf**. Gate harus tidak menerapkannya ke customer. |
| Tes gate + `registration-domain.test.ts` | **NEEDS CHANGE** | Tes yang mengunci “gmail selalu ditolak” akan salah di bawah G4 baru. |
| Better Auth (`packages/auth/src/index.ts`) | **NEEDS CHANGE** (komentar saja) | Tidak auto-assign role. Komentar “whitelist-gated registration” menjadi tidak akurat untuk semua user. `requireEmailVerification: false` tetap. |
| `User.status` | **NO CHANGE** | Default `INVITED` sudah benar untuk akun baru. G3 hanya menolak `DISABLED`. Jangan menambah semantik `INVITED` di tugas G4. |
| `UserMembership` saat sign-up | **NO CHANGE** | Sudah kosong. Harus tetap kosong. |
| Users API `POST /users/:id/memberships` | **NO CHANGE** | Sudah jalur provision admin; schema role sudah termasuk `CUSTOMER`; menolak `SUPERADMIN` (G2). |
| `GET /users` vs `GET /users/without-membership` | **NO CHANGE** (perilaku) / **catatan UX** | User customer yang baru register hanya muncul di Assign, bukan di list utama. Cukup untuk G1/G4. |
| Role CUSTOMER | **NO CHANGE** | Enum + grant kosong sudah ada. Jangan diisi otomatis saat register. |
| EmailWhitelist API/UI | **NO CHANGE** | Tetap untuk staf / F4. Jangan dihapus. Un-revoke tetap GAP terpisah. |
| Frontend register | **NO CHANGE** (keamanan) / opsional copy | Tidak ada role picker. Tidak ada batasan domain di UI (server yang menolak). Copy “pending approval” boleh menyusul. |
| Redirect setelah sign-up ke `/` | **NO CHANGE** (keamanan) | `/me` 403 → Forbidden. Bukan grant akses. |
| Menu / `proxy.ts` | **NO CHANGE** | Bukan security. |
| Backend authorization (`CompanyRoleGuard`, `/me`, chat socket) | **NO CHANGE** | Sudah menolak tanpa membership. Inilah yang membuat G4 baru aman. |
| Tes permission users/membership | **NO CHANGE** | Tidak meng-encode whitelist customer. |
| Audit + implementation report | **NEEDS CHANGE** | Mencatat G4=B lama. **Jangan diedit di tugas audit ini** — daftar di bagian 3. |
| Email verification | **UNVERIFIED / out of scope** | `requireEmailVerification: false`. Membuka registrasi publik menambah spam/akun palsu. Bukan bagian G4 ini. |

---

## 5. Security Verification

### Yang sudah ditegakkan hari ini

```text
external email registration
    ↓
(diblokir gate — belum bisa terjadi)
```

Jika gate dilonggarkan sesuai G4, rantai **yang sudah ada** tetap:

```text
User dibuat (INVITED)
    ↓
tidak ada UserMembership
    ↓
GET /me → 403
CompanyRoleGuard → 403
chat socket → NO_MEMBERSHIP
layout → Forbidden
    ↓
NO application authorization
```

**Bukan** “siapa pun yang register menjadi CUSTOMER.” Role hanya muncul setelah admin `assignMembership(..., "CUSTOMER")`.

### Yang tidak boleh diubah saat implementasi G4

- Jangan hook after-create yang mengisi membership.
- Jangan inferensi `gmail` / domain rumah sakit → `CUSTOMER`.
- Jangan terima `role` dari body sign-up.
- Jangan anggap `User.status = INVITED` sebagai izin aplikasi (G3: hanya `DISABLED` yang memblokir jika membership ada).

### Gap yang sudah ada (bukan diperkenalkan G4)

1. `INVITED` + membership yang sudah ada **boleh** akses (guard hanya cek `DISABLED`). Ini G3, bukan G4.
2. Laporan implementasi §11.1 keliru: “status `INVITED` akan diblock oleh guard” — **tidak** di kode.
3. Tanpa email verification, membuka registrasi publik = akun `User` spam. Tidak memberi akses aplikasi, tetapi mengisi tabel User. Keputusan produk terpisah.
4. `User.email` `VarChar(50)` bisa menolak email institusi yang panjang. Bukan blocker G4, perlu disadari.

---

## 6. Recommended Change Set (jangan diimplementasikan sekarang)

Perubahan **minimum** agar G4 baru benar, tanpa melemahkan gate staf, tanpa auto-provision:

1. **`registration-gate.ts`**  
   - Jika domain === `kalibrasimedika.co.id` → tetap wajib `EmailWhitelist` ACTIVE (staf).  
   - Jika domain lain → izinkan (tanpa whitelist).  
   - Jangan hapus `EmailWhitelist`.

2. **Tes**  
   - Izinkan `user@gmail.com` dan `user@hospital.co.id` tanpa whitelist.  
   - Tetap tolak `staf@kalibrasimedika.co.id` tanpa whitelist.  
   - Tetap tolak company-domain + REVOKED.  
   - Sign-up gmail: User terbuat, **nol** baris `UserMembership`.  
   - Setelah sign-up gmail, `hasPermission` / guard tetap 403 tanpa membership.

3. **Komentar** di `packages/auth/src/index.ts` dan `registration-gate.ts` — whitelist-gated **hanya staf**, bukan semua registrasi.

4. **Dokumen** (tugas terpisah): forensic audit bagian 15 G4 = REVISED; implementation report §2 / §11.3; hapus “G4=B” di sequence.

5. **Jangan:** plugin Better Auth admin/organization, `User.role`, auto-assign CUSTOMER, hapus UI/API whitelist, authz di `proxy.ts`, email verification/invitation/password reset (out of scope).

---

## 7. Open Decisions

Hanya yang benar-benar belum dikunci oleh G4 baru:

1. **Gate staf setelah G4** — Pertahankan “domain perusahaan AND whitelist” untuk `@kalibrasimedika.co.id`? Prompt mengizinkan whitelist tetap untuk staf. Default yang selaras dengan “jangan melemahkan kontrol staf”: **ya, pertahankan.** Perlu konfirmasi eksplisit sebelum implementasi.

2. **Email verification untuk registrasi publik** — G4 tidak mewajibkannya. Membuka Gmail tanpa verifikasi adalah risiko spam/akun, bukan grant akses. Boleh menyusul.

3. **Un-revoke whitelist** — tetap GAP lama; tidak memblokir G4 baru.

Bukan keputusan terbuka:

- Auto-role CUSTOMER saat register → **dilarang**.
- Registration = provisioning → **dilarang** (G1).
- Hapus `EmailWhitelist` → **dilarang** oleh prompt ini.

---

## 8. Constraint

```text
REGISTRATION
    ≠
PROVISIONING
    ≠
ROLE ASSIGNMENT
```

Administrator tetap otoritas akses aplikasi. G4 yang direvisi **bukan** “siapa pun yang register otomatis menjadi CUSTOMER.”
