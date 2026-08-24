Saya ingin kamu menganalisis dan menentukan desain autentikasi/registrasi untuk membedakan **Internal Staff** dan **Customer Portal User**.

## Business Rule

Aplikasi memiliki 2 konteks user:

### 1. Internal Staff
User internal perusahaan.

- Hanya boleh menggunakan email dengan domain:
  `@kalibrasimedika.co.id`
- Email dengan domain lain harus ditolak saat registrasi.
- Aturan ini harus enforced di backend/server-side, bukan hanya frontend.
- User tidak boleh bisa bypass restriction hanya dengan memanipulasi request/API/client state.

### 2. Customer Portal
User customer eksternal.

- Boleh menggunakan email dari domain apa pun.
- Tidak boleh dibatasi oleh whitelist domain internal.
- Contoh:
  - `customer@gmail.com` → allowed
  - `user@company.com` → allowed
  - `user@kalibrasimedika.co.id` → technically allowed sebagai email, tetapi konteksnya harus tetap Customer Portal jika user memang mendaftar melalui portal customer.

## Masalah yang perlu diselesaikan

Saat ini terdapat konsep `EmailWhitelist` untuk autentikasi internal staff.

Saya ingin memastikan sistem dapat membedakan:

`Internal Staff Registration`
vs
`Customer Portal Registration`

sehingga rule domain hanya diterapkan pada internal staff dan **tidak secara tidak sengaja membatasi customer portal**.

## Yang saya minta kamu lakukan

### Step 1 — Audit existing implementation

Jangan langsung melakukan perubahan kode.

Cari dan pahami terlebih dahulu:

- flow registrasi internal staff
- flow registrasi customer portal
- penggunaan `EmailWhitelist`
- Better Auth configuration
- API/route yang menangani registration
- middleware/auth guard yang relevan
- bagaimana aplikasi saat ini membedakan internal application dengan customer portal
- apakah terdapat hostname/subdomain/path/application context yang sudah bisa digunakan sebagai discriminator
- bagaimana session/user identity dibuat dan disimpan

Cari seluruh reference terhadap:

- `EmailWhitelist`
- registration/signup
- Better Auth
- staff/internal user
- portal/customer user
- role/membership
- application context
- hostname/subdomain jika ada

### Step 2 — Tentukan discriminator yang paling aman

Tentukan bagaimana sistem seharusnya mengetahui bahwa sebuah registration request berasal dari:

`INTERNAL_STAFF`
atau
`CUSTOMER_PORTAL`

Prioritaskan discriminator yang **server-trusted**.

Contoh kandidat yang perlu kamu evaluasi:

- hostname/subdomain
- route/API endpoint
- application identifier
- explicit server-side registration context
- Better Auth configuration/context
- atau mekanisme lain yang sudah digunakan oleh project

Jangan mengandalkan:

- hidden input
- localStorage
- client-side flag
- request body yang bebas dimanipulasi user

jika informasi tersebut digunakan untuk security enforcement tanpa validasi server-side.

### Step 3 — Tentukan rule enforcement

Desired behavior:

```text
Internal Staff Registration
        ↓
Server identifies context = INTERNAL_STAFF
        ↓
Check email domain
        ↓
@kalibrasimedika.co.id → ALLOW
other domain             → REJECT
```

Sedangkan:

```text
Customer Portal Registration
        ↓
Server identifies context = CUSTOMER_PORTAL
        ↓
No internal-domain restriction
        ↓
Any valid email domain → ALLOW
```

### Step 4 — Perhatikan security edge cases

Analisis juga kasus berikut:

1. Staff mencoba signup melalui Customer Portal agar bisa bypass domain restriction.
2. Customer menggunakan email `@kalibrasimedika.co.id`.
3. User memanipulasi request body agar `applicationType/context` berubah.
4. User memanggil API registration secara langsung tanpa melalui UI.
5. User mencoba menggunakan endpoint registration internal dari luar aplikasi.
6. Jika aplikasi menggunakan beberapa hostname/subdomain, apakah hostname cukup reliable sebagai security boundary?
7. Apakah `EmailWhitelist` sebaiknya tetap menjadi mekanisme authorization tambahan setelah domain validation?
8. Apakah rule ini sebaiknya diterapkan saat signup saja, atau juga saat email/account linking/change email?

### Step 5 — Jangan mengubah arsitektur yang tidak perlu

Saya tidak ingin solusi yang hanya menambahkan:

```ts
if (!email.endsWith("@kalibrasimedika.co.id")) {
   throw ...
}
```

secara global karena itu berpotensi memblokir Customer Portal.

Saya ingin rule diterapkan berdasarkan **registration context yang benar**.

Pertahankan arsitektur existing sebanyak mungkin.

## Output yang saya inginkan

Sebelum coding, berikan analisis dengan format:

### 1. Current Architecture
Jelaskan bagaimana flow auth/registration saat ini bekerja.

### 2. Current Problem
Jelaskan titik dimana `EmailWhitelist` saat ini berpotensi tidak bisa membedakan internal staff vs customer portal.

### 3. Recommended Design
Tentukan discriminator yang paling aman untuk membedakan:

- `INTERNAL_STAFF`
- `CUSTOMER_PORTAL`

Jelaskan alasannya.

### 4. Security Analysis
Jelaskan bagaimana desain tersebut mencegah staff bypass restriction melalui customer portal atau direct API call.

### 5. Required Code Changes
Sebutkan file/module/function yang perlu diubah dan perubahan yang diperlukan.

### 6. Test Matrix
Buat test case minimal:

| Context | Email | Expected |
|---|---|---|
| Internal Staff | `staff@kalibrasimedika.co.id` | ALLOW |
| Internal Staff | `staff@gmail.com` | REJECT |
| Internal Staff | `staff@othercompany.com` | REJECT |
| Customer Portal | `customer@gmail.com` | ALLOW |
| Customer Portal | `customer@othercompany.com` | ALLOW |
| Customer Portal | `user@kalibrasimedika.co.id` | ALLOW |

Tambahkan test untuk direct API request dan attempt to manipulate context.

### 7. Implementation Plan
Berikan langkah implementasi paling minimal dan aman.

**PENTING:**
Untuk tahap pertama, **jangan melakukan perubahan kode**.

Tampilkan hasil audit dan rekomendasi desain terlebih dahulu. Setelah saya approve desainnya, baru implementasikan.