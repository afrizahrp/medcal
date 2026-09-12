# AUTH ARCHITECTURE AUDIT — STAFF vs CUSTOMER PORTAL

## ⚠️ STRICT MODE: AUDIT & DESIGN ONLY

**DO NOT MODIFY ANY CODE.**

Jangan:

- membuat file baru
- mengubah file existing
- menghapus file
- refactor
- melakukan migration
- menjalankan automated fix
- mengubah Better Auth configuration
- mengubah route
- mengubah database schema

Jangan melakukan implementasi apa pun.

Saya hanya ingin:

1. audit architecture existing
2. memahami coupling yang ada
3. membandingkan opsi desain
4. merekomendasikan architecture terbaik
5. membuat implementation plan

Saya akan memberikan approval terpisah sebelum coding dilakukan.

---

# 1. BUSINESS CONTEXT

Aplikasi memiliki dua jenis user dengan dua business context yang berbeda:

## A. INTERNAL STAFF

Digunakan oleh staff internal perusahaan.

Entry point yang diinginkan:

```text
apps.kalibrasimedika.co.id
```

Registration rule:

```text
email domain harus @kalibrasimedika.co.id
AND
EmailWhitelist harus ACTIVE
```

Staff tidak boleh melakukan internal registration menggunakan email domain eksternal.

---

## B. CUSTOMER PORTAL

Digunakan oleh customer eksternal.

Entry point yang diinginkan:

```text
portal.kalibrasimedika.co.id
```

Registration rule:

```text
email domain bebas
```

Contoh:

```text
customer@gmail.com          → ALLOW
user@company.com            → ALLOW
customer@othercompany.com   → ALLOW
user@kalibrasimedika.co.id → ALLOW
```

Customer Portal tidak boleh dibatasi oleh `EmailWhitelist`.

---

# 2. DESIGN DIRECTION YANG SEDANG SAYA EVALUASI

Saya sedang mempertimbangkan untuk **memisahkan entry point authentication Staff dan Customer Portal**, termasuk login/register page, karena keduanya merupakan dua business context yang berbeda.

Contoh:

```text
apps.kalibrasimedika.co.id
├── sign-in
└── sign-in/register

portal.kalibrasimedika.co.id
├── sign-in
└── sign-in/register
```

Namun:

**Saya TIDAK ingin membuat dua authentication system.**

Underlying authentication infrastructure sebisa mungkin tetap shared:

```text
                    Better Auth
                        │
          ┌─────────────┴─────────────┐
          │                           │
     Staff Entry Point         Customer Entry Point
          │                           │
       Staff UI                    Portal UI
       Staff Policy              Customer Policy
          │                           │
          └─────────────┬─────────────┘
                        │
                 Shared User/Session
```

Shared infrastructure yang ingin dipertahankan sebisa mungkin:

- Better Auth
- User
- Account
- Session
- password authentication
- email verification
- password reset
- session management
- common authentication primitives

Yang boleh berbeda:

- entry point
- registration UI
- registration policy
- authorization/onboarding policy
- staff whitelist requirement
- customer onboarding behavior

---

# 3. IMPORTANT: AUDIT IMPLEMENTASI YANG SEKARANG

Sebelum membuat proposal baru, audit terlebih dahulu implementasi existing.

Saat ini Cursor sebelumnya sudah membuat implementation berdasarkan:

```text
Origin
  ↓
Registration Context
  ↓
INTERNAL_STAFF / CUSTOMER_PORTAL
```

dengan komponen seperti:

- `registration-context.ts`
- `registration-context.store.ts`
- `registration-context.hook.ts`
- `registration-gate.ts`
- `registration-gate.hook.ts`

dan perubahan terkait Better Auth hooks.

**Jangan menganggap implementasi tersebut benar hanya karena test pass.**

Audit apakah machinery tersebut sebenarnya muncul karena kita memaksakan:

```text
one registration page
+
one registration endpoint
+
two different business policies
```

---

# 4. AUDIT CURRENT AUTH ARCHITECTURE

Cari dan petakan seluruh authentication flow.

Audit:

- Better Auth configuration
- auth package
- API auth routes
- sign-in
- sign-up
- registration page
- login page
- session creation
- session validation
- user creation
- account creation
- email verification
- password reset
- email change
- account linking
- membership creation
- role assignment
- permission assignment
- `EmailWhitelist`
- internal staff guards
- customer portal guards
- middleware/proxy
- hostname/subdomain handling

Cari semua reference terhadap:

```text
EmailWhitelist
registration-gate
registration-context
Better Auth
sign-up
sign-in
membership
role
permission
INTERNAL_STAFF
CUSTOMER
portal
apps
```

---

# 5. BUILD THE CURRENT ARCHITECTURE MAP

Sebelum memberikan recommendation, tampilkan architecture map aktual.

Minimal:

```text
Browser
  ↓
Frontend
  ↓
Proxy / Middleware
  ↓
API
  ↓
Better Auth
  ↓
User / Account / Session
  ↓
Membership
  ↓
Role / Permission
```

Tunjukkan di mana:

- Staff vs Customer sekarang dibedakan
- EmailWhitelist sekarang diterapkan
- registration context sekarang diterapkan
- role assignment dilakukan
- authorization dilakukan

Jika ada perbedaan antara apps dan portal, tunjukkan secara eksplisit.

---

# 6. KEY QUESTION

Jawab pertanyaan fundamental berikut:

> Apakah Staff dan Customer memang sebaiknya menggunakan SATU registration page dan SATU business registration flow?

Jangan mengasumsikan jawabannya YES.

Bandingkan dua pendekatan:

### Current approach

```text
ONE PAGE
ONE ENDPOINT
ONE REGISTRATION FLOW
        ↓
determine context
        ↓
Staff OR Customer
```

versus:

### Proposed approach

```text
STAFF APP
    ↓
STAFF AUTH ENTRY POINT
    ↓
STAFF REGISTRATION POLICY

CUSTOMER PORTAL
    ↓
CUSTOMER AUTH ENTRY POINT
    ↓
CUSTOMER REGISTRATION POLICY

             ↓
      Shared Better Auth
             ↓
      Shared User/Session
```

Evaluasi mana yang lebih maintainable.

---

# 7. ARCHITECTURE OPTIONS

Saya ingin minimal empat opsi dianalisis.

## OPTION A — Current Single Entry Point

```text
apps + portal
      ↓
same auth page
      ↓
same registration endpoint
      ↓
Origin determines context
```

Evaluasi:

- security
- maintainability
- complexity
- coupling
- testing
- future extensibility
- risk of accidental policy leakage

---

## OPTION B — Separate UI / Entry Point, Shared Better Auth

Contoh:

```text
apps.kalibrasimedika.co.id
    ↓
staff sign-in/register

portal.kalibrasimedika.co.id
    ↓
customer sign-in/register

             ↓
       Shared Better Auth
```

Evaluasi secara detail.

Pertanyaan penting:

> Apakah kita dapat memiliki dua frontend auth entry point tanpa membuat dua auth implementation?

---

## OPTION C — Separate Registration Endpoints, Shared Authentication

Misalnya:

```text
/api/auth/staff-sign-up
/api/auth/customer-sign-up
```

tetapi tetap menggunakan shared Better Auth/User/Session infrastructure.

Evaluasi:

- apakah Better Auth mendukung architecture seperti ini secara clean
- apakah custom endpoint justru menambah complexity
- apakah ini benar-benar diperlukan
- apakah ada risiko duplicate auth logic

---

## OPTION D — Separate Entry Point + Explicit Registration Intent

Misalnya Staff registration memiliki server-controlled registration intent/invitation/token, sedangkan Customer registration unrestricted.

Evaluasi apakah ini lebih secure daripada Origin-based context.

---

# 8. SECURITY ANALYSIS

Ini bagian yang sangat penting.

Jangan hanya menilai berdasarkan UI.

Untuk setiap architecture, analisis:

### Attack 1

User membuka:

```text
portal.kalibrasimedika.co.id
```

dan mendaftar dengan:

```text
attacker@gmail.com
```

Expected:

```text
Customer account
```

### Attack 2

User mencoba mendaftar sebagai staff dengan:

```text
attacker@gmail.com
```

Expected:

```text
REJECT
```

### Attack 3

User mencoba bypass melalui direct HTTP request.

Contoh:

```text
curl
Postman
custom HTTP client
```

Expected:

```text
Tidak dapat memperoleh INTERNAL_STAFF access
```

### Attack 4

Customer menggunakan:

```text
employee@kalibrasimedika.co.id
```

melalui portal.

Expected:

```text
Customer registration tetap ALLOW
```

### Attack 5

Customer mencoba mendapatkan:

```text
INTERNAL_STAFF membership
```

Expected:

```text
REJECT
```

### Attack 6

Existing customer mencoba upgrade account menjadi internal staff.

Audit:

- membership assignment
- invitation
- admin assignment
- role assignment
- email change
- account linking

---

# 9. MAINTAINABILITY ANALYSIS

Saya ingin kamu menilai secara khusus:

> Berapa banyak konsep tambahan yang harus dipahami developer baru?

Bandingkan:

```text
registrationContext
Origin
context store
context hook
registration gate
registration gate hook
EmailWhitelist
role guard
```

dengan architecture yang memisahkan entry point.

Pertanyaan:

> Apakah pemisahan UI/route akan membuat codebase lebih sederhana karena policy sudah jelas berdasarkan entry point?

Jangan menilai hanya dari jumlah file.

Nilai juga:

- cognitive load
- coupling
- debugging
- testing
- onboarding developer
- future changes
- kemungkinan bug

---

# 10. FUTURE EXTENSIBILITY

Bayangkan nanti ada:

```text
INTERNAL STAFF
CUSTOMER
TECHNICIAN
PARTNER
VENDOR
```

Jika tetap menggunakan satu registration page:

```text
registrationContext =
  STAFF
  CUSTOMER
  TECHNICIAN
  PARTNER
  VENDOR
```

Apa konsekuensinya?

Bandingkan dengan:

```text
apps.*
portal.*
technician.*
partner.*
vendor.*
```

Apakah separate entry points akan lebih scalable?

Jangan otomatis menyimpulkan separate hostname lebih baik. Berikan analisis objektif.

---

# 11. AUTHENTICATION vs AUTHORIZATION

Pisahkan dengan tegas tiga konsep:

### Authentication

```text
Who are you?
```

### Registration policy

```text
Who is allowed to create an account through this entry point?
```

### Authorization

```text
What can this user access after login?
```

Jelaskan apakah kita benar-benar perlu membuat distinction Staff/Customer di authentication layer, atau cukup di registration policy + membership/authorization layer.

---

# 12. DATABASE / DOMAIN MODEL IMPACT

Audit apakah pemisahan entry point membutuhkan perubahan:

- User
- Account
- Session
- Membership
- Role
- Permission
- EmailWhitelist

Jangan membuat schema change jika tidak diperlukan.

Jika tidak diperlukan, katakan secara eksplisit:

```text
NO DATABASE CHANGE REQUIRED
```

---

# 13. BETTER AUTH IMPACT

Audit secara khusus bagaimana Better Auth sekarang digunakan.

Saya ingin tahu apakah proposed architecture dapat:

```text
Staff UI
    ↓
shared Better Auth

Customer UI
    ↓
shared Better Auth
```

tanpa:

- duplicate auth configuration
- duplicate session handling
- duplicate password logic
- duplicate account logic
- duplicate verification logic

Jika ada constraint dari Better Auth yang membuat desain ini sulit, jelaskan secara konkret berdasarkan codebase yang ditemukan.

---

# 14. RECOMMENDED ARCHITECTURE

Setelah seluruh audit, pilih **SATU architecture recommendation**.

Jangan memberikan recommendation berupa:

> "tergantung kebutuhan."

Saya ingin keputusan.

Recommendation harus menjawab:

1. Apakah Staff dan Customer sebaiknya memiliki login/register page terpisah?
2. Apakah route/hostname perlu berbeda?
3. Apakah endpoint Better Auth perlu berbeda?
4. Apakah Better Auth tetap shared?
5. Dimana `EmailWhitelist` harus diterapkan?
6. Dimana Staff authorization harus diterapkan?
7. Dimana Customer authorization harus diterapkan?
8. Apakah `registration-context.*` machinery masih diperlukan?
9. Apakah Origin masih diperlukan sebagai security mechanism?
10. Apakah database schema perlu berubah?

---

# 15. TARGET ARCHITECTURE DIAGRAM

Berikan diagram final yang jelas.

Contoh format:

```text
                ┌─────────────────────┐
                │    Better Auth      │
                │   Shared Auth Core  │
                └──────────┬──────────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
      INTERNAL STAFF              CUSTOMER PORTAL
             │                           │
       apps.kalibrasi...            portal.kalibrasi...
             │                           │
       Staff Login/Register         Customer Login/Register
             │                           │
       Staff Registration           Customer Registration
           Policy                       Policy
             │                           │
       EmailWhitelist                    │
             │                           │
             └─────────────┬─────────────┘
                           │
                         User
                           │
                      Membership
                           │
                    Role / Permission
```

Sesuaikan diagram dengan hasil audit aktual, jangan sekadar mengikuti contoh.

---

# 16. MIGRATION / IMPLEMENTATION PLAN

Setelah recommendation, buat implementation plan **tanpa melakukan implementasi**.

Urutkan:

```text
Phase 1 — ...
Phase 2 — ...
Phase 3 — ...
```

Untuk setiap phase sebutkan:

- file yang kemungkinan berubah
- file yang kemungkinan dihapus
- file yang tetap dipertahankan
- database impact
- auth impact
- test impact
- migration risk

---

# 17. ROLLBACK / EXISTING IMPLEMENTATION

Karena implementation sebelumnya sudah menambahkan:

- registration context resolver
- context store
- context hook
- registration gate changes
- Origin-based context

audit apakah komponen tersebut:

1. tetap diperlukan
2. perlu disederhanakan
3. dapat dihapus
4. perlu dipertahankan sebagai defense-in-depth

**Jangan menghapusnya sekarang.**

Hanya rekomendasikan.

---

# 18. FINAL VERDICT

Akhiri dengan format:

## Architecture Decision

```text
RECOMMENDATION:
<ONE CLEAR RECOMMENDATION>
```

## Why

maksimal 5 alasan utama.

## Security

```text
Staff cannot bypass internal registration policy
Customer can freely register
Customer cannot obtain internal authorization
```

## Maintainability

Jelaskan kenapa architecture ini paling mudah dipelihara.

## Complexity

Bandingkan dengan current Origin/context-based implementation.

## Code Changes

Berikan daftar perubahan yang diperlukan, tetapi **JANGAN MELAKUKAN PERUBAHAN**.

---

# ABSOLUTE RULE

Sekali lagi:

**AUDIT + ARCHITECTURE DESIGN ONLY.**

Tidak boleh:

- edit code
- create file
- delete file
- refactor
- migrate
- install dependency
- change configuration
- run fix

Bahkan jika kamu menemukan bug atau security issue, **hanya laporkan**.

Saya akan memberikan approval eksplisit setelah membaca architecture recommendation.