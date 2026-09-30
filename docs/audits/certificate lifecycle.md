# Audit: Certificate Lifecycle, Numbering, QR Code & CalibrationJob Integration

## Context

Medcal saat ini memiliki model `Certificate` yang antara lain memiliki:

```prisma
model Certificate {
  id                      String                   @id @default(cuid())
  companyId               String
  customerId              String
  deviceId                String
  calibrationJobId        String                   @unique
  qualityReviewId         String?
  number                  String
  verificationToken       String?                 @unique
  status                  CertificateStatus        @default(DRAFT)
  billingStatus           CertificateBillingStatus @default(UNBILLED)
  issuedAt                DateTime?
  validUntil              DateTime?
  supersedesCertificateId String?
  revokeReason            String?
  pdfFileObjectId         String?
  createdByUserId         String?
  updatedByUserId         String?
  createdAt               DateTime                @default(now())
  updatedAt               DateTime                @updatedAt
}
```

### Current reality

Saat ini Certificate **belum dibuat/generate oleh system**.

User mengunggah certificate yang sebelumnya dibuat di luar system. Identifier/nomor certificate saat ini pada dasarnya mengikuti / dibentuk dari **nama file yang di-upload**.

Ke depan, requirement-nya akan berubah:

> Certificate akan dibuat/dikeluarkan oleh Medcal system, sehingga system harus dapat memberikan human-readable Certificate Number.

Target format:

```text
CRT/2026/09/00001
```

Format ini hanya contoh. Audit harus menentukan apakah architecture saat ini sudah mendukung numbering seperti ini dengan benar dan apa yang perlu diperbaiki.

Selain itu Certificate akan memiliki QR Code untuk public verification.

---

# Tujuan Audit

Lakukan **audit komprehensif terhadap implementasi Certificate saat ini**, khususnya:

1. Certificate lifecycle
2. Relationship Certificate ↔ CalibrationJob
3. `CertificateStatus`
4. Human-readable Certificate Number
5. `verificationToken`
6. QR Code
7. Certificate PDF
8. Existing upload flow
9. Future system-generated certificate flow
10. Revision / supersede / revoke behavior
11. Consistency dan integrity antara Certificate dan CalibrationJob

**Jangan melakukan implementasi/perubahan code.**

Ini adalah audit architecture + implementation terlebih dahulu.

---

# 1. Audit Current Certificate Flow

Trace secara actual dari source code:

```text
CalibrationJob
    ↓
Certificate creation / upload
    ↓
Certificate record
    ↓
Certificate PDF
    ↓
Certificate number
    ↓
QR Code
    ↓
Verification
```

Identifikasi:

- entry point
- API/server action
- service/use-case
- database mutation
- UI/page
- upload mechanism
- PDF handling
- QR generation
- verification endpoint/page jika sudah ada
- authorization boundary yang relevan
- background job/event jika ada

Jangan hanya membaca Prisma schema.

Cari actual implementation dan caller-nya.

Output:

```text
Current Certificate Flow
```

dengan file path dan function/component penting.

---

# 2. Audit Current Certificate Upload Model

Karena saat ini certificate dibuat di luar system dan user cukup upload file, audit:

### A. Bagaimana Certificate dibuat ketika upload?

Tentukan:

- kapan row `Certificate` dibuat
- bagaimana `number` diisi
- apakah `number` diambil dari filename
- apakah filename divalidasi
- apakah number dapat diedit
- apakah duplicate number mungkin terjadi
- bagaimana system menangani filename yang tidak mengikuti format
- apakah upload dapat dilakukan tanpa CalibrationJob
- apakah satu CalibrationJob dapat memiliki lebih dari satu Certificate

### B. Audit filename → Certificate number

Cari seluruh logic yang menganggap:

```text
filename == certificate number
```

dan identifikasi dependency yang akan rusak ketika Certificate Number nanti **dibentuk oleh system**.

---

# 3. Audit Certificate ↔ CalibrationJob

Ini bagian penting.

Schema saat ini memiliki:

```prisma
calibrationJobId String @unique
```

yang berarti secara database:

> satu CalibrationJob hanya dapat memiliki satu Certificate.

Audit apakah business logic saat ini memang mengasumsikan hal tersebut.

Telusuri:

- siapa yang membuat Certificate
- apakah Certificate hanya boleh berasal dari CalibrationJob tertentu
- apakah CalibrationJob harus berada pada status tertentu sebelum Certificate dibuat
- apakah QualityReview harus selesai terlebih dahulu
- apakah CalibrationJob dapat menghasilkan Certificate ketika belum completed
- apakah Certificate dapat dibuat sebelum calibration selesai
- apakah Certificate dapat dibuat ulang
- bagaimana revision bekerja
- bagaimana superseding certificate bekerja

Buat diagram:

```text
CalibrationJob
      │
      ├── QualityReview
      │
      └── Certificate
```

dan jelaskan lifecycle aktualnya berdasarkan code.

---

# 4. Audit `CertificateStatus`

Temukan definisi aktual:

```text
CertificateStatus
```

Jangan berasumsi enum hanya berdasarkan Prisma model.

Audit:

- seluruh enum value
- seluruh tempat status dibaca
- seluruh tempat status ditulis
- transition antar status
- siapa/flow yang dapat melakukan transition
- apakah transition memiliki invariant
- apakah transition enforced di server atau hanya UI
- apakah status memiliki konsekuensi terhadap PDF
- apakah status memiliki konsekuensi terhadap QR verification
- apakah status memiliki konsekuensi terhadap billing
- apakah status memiliki konsekuensi terhadap CalibrationJob

Buat transition matrix:

| Current | Possible Next | Trigger | Enforcement |
| ------- | ------------- | ------- | ----------- |
| ...     | ...           | ...     | ...         |

Identifikasi transition yang:

- valid
- ambigu
- tidak mungkin
- belum memiliki guard
- dapat menghasilkan inconsistent state

---

# 5. Audit Future Human-Readable Certificate Number

Requirement baru:

```text
CRT/2026/09/00001
```

Tujuan:

- human readable
- sequential
- mudah disebutkan oleh customer/internal user
- dapat digunakan pada PDF
- dapat digunakan sebagai reference certificate
- tidak bergantung pada filename
- memiliki uniqueness guarantee

Audit apakah field:

```prisma
number String
@@unique([companyId, number])
```

sudah cukup.

Periksa secara khusus:

### Number generation

Bagaimana seharusnya system menghasilkan:

```text
CRT/2026/09/00001
CRT/2026/09/00002
CRT/2026/09/00003
```

Audit terhadap:

- concurrent certificate creation
- race condition
- transaction boundary
- retry
- failed transaction
- rollback
- duplicate number
- multiple application instances
- multiple users creating certificate simultaneously

Jangan sekadar menyarankan:

```text
SELECT MAX(number) + 1
```

Audit apakah pendekatan semacam itu sudah/belum digunakan dan apa risikonya.

### Scope numbering

Tentukan berdasarkan existing architecture apakah sequence seharusnya:

```text
global
```

atau:

```text
per company
```

atau:

```text
per year
```

atau:

```text
per month
```

Jangan mengambil keputusan tanpa evidence.

Jika belum ada business rule yang cukup, tandai sebagai:

```text
OPEN DECISION
```

dan jelaskan konsekuensinya.

---

# 6. Audit `verificationToken`

Audit seluruh penggunaan:

```prisma
verificationToken String? @unique
```

Cari:

- generation
- storage
- regeneration
- exposure
- lookup
- verification endpoint
- QR generation
- QR rendering
- QR scanning flow
- apakah token predictable
- apakah token immutable
- apakah token dibuat saat DRAFT atau ISSUED
- apakah token tetap sama setelah revision
- apakah token berubah ketika certificate superseded
- apakah token masih valid ketika certificate revoked

Secara khusus jawab:

> Apakah `verificationToken` saat ini sudah tepat digunakan sebagai public identifier untuk QR?

Jika tidak, jelaskan secara konkret.

---

# 7. Audit QR Code

Cari seluruh implementation QR Code pada Certificate.

Audit:

### QR payload

Apa sebenarnya yang disimpan di QR saat ini?

Misalnya:

```text
certificate ID
certificate number
verification token
URL
PDF URL
atau lainnya
```

Tentukan actual implementation.

### QR lifecycle

Audit:

- kapan QR dibuat
- siapa yang membuat
- apakah QR embedded ke PDF
- apakah QR dibuat client-side/server-side
- apakah QR dapat berubah
- apakah QR dibuat sebelum certificate issued
- apakah QR tetap valid setelah certificate superseded/revoked

### Future requirement

Target architecture yang perlu dievaluasi:

```text
QR
 ↓
public verification URL
 ↓
verificationToken
 ↓
Certificate
 ↓
current status
```

Jangan langsung mengubah implementation.

Nilai apakah architecture existing sudah mendukung pola tersebut.

---

# 8. Audit Certificate Verification Page / Endpoint

Jika sudah ada, audit secara actual.

Jika belum ada, nyatakan bahwa component tersebut belum tersedia.

Audit:

- route
- authentication requirement
- authorization
- token lookup
- certificate status evaluation
- revoked handling
- superseded handling
- expired handling
- invalid token handling
- information exposure
- PDF access
- customer/device information exposure

Tujuannya adalah memastikan QR tidak sekadar:

```text
"certificate exists"
```

tetapi dapat menjawab:

```text
Certificate valid?
Certificate expired?
Certificate revoked?
Certificate superseded?
```

tanpa membocorkan data internal yang tidak diperlukan.

---

# 9. Audit Certificate PDF

Audit bagaimana PDF certificate saat ini diperlakukan.

Karena ke depan certificate akan **generated by system**, periksa:

- apakah PDF generation infrastructure sudah ada
- apakah existing PDF hanya file upload
- apakah template certificate sudah ada
- apakah number bisa di-render
- apakah QR bisa di-render
- apakah issuedAt bisa di-render
- apakah validUntil bisa di-render
- apakah certificate revision bisa direpresentasikan
- apakah PDF immutable setelah issued

Bedakan:

```text
Uploaded external certificate
```

vs.

```text
System-generated certificate
```

dan jelaskan gap architecture antara keduanya.

---

# 10. Audit Revision / Supersede

Schema memiliki:

```prisma
supersedesCertificateId String?

supersedes       Certificate?
supersededBy     Certificate[]
```

Audit actual implementation.

Pertanyaan:

- kapan certificate dianggap revision
- apakah revision membuat Certificate row baru
- apakah nomor baru dibuat
- apakah verificationToken baru dibuat
- apa yang terjadi pada certificate lama
- status certificate lama berubah menjadi apa
- apakah QR certificate lama tetap dapat di-scan
- apakah halaman verification menjelaskan bahwa certificate sudah superseded
- apakah CalibrationJob tetap menunjuk certificate lama atau terbaru

Buat lifecycle example berdasarkan implementation aktual.

---

# 11. Audit Revoke

Audit:

```prisma
revokeReason String?
```

Cari actual revoke implementation.

Pastikan diketahui:

- siapa yang dapat revoke
- status sebelum revoke
- status setelah revoke
- apakah PDF masih downloadable
- apakah QR masih resolve
- apa yang ditampilkan kepada public
- apakah revoke immutable
- apakah revoke dapat dibatalkan

Jika belum ada implementation, tandai sebagai gap.

---

# 12. Audit Data Integrity

Cari kemungkinan inconsistent state seperti:

### Case A

```text
CalibrationJob = COMPLETED
Certificate = DRAFT
```

### Case B

```text
Certificate = ISSUED
CalibrationJob belum selesai
```

### Case C

```text
Certificate = ISSUED
verificationToken = null
```

### Case D

```text
Certificate = ISSUED
pdfFileObjectId = null
```

### Case E

```text
Certificate = SUPERSEDED
supersedesCertificateId = null
```

### Case F

```text
Certificate = REVOKED
revokeReason = null
```

### Case G

```text
Certificate memiliki number duplicate
```

### Case H

```text
CalibrationJob memiliki Certificate lebih dari satu
```

dan case lain yang ditemukan dari actual architecture.

Untuk masing-masing:

```text
Condition
Risk
Current protection
Missing protection
```

---

# 13. Audit Migration Path

Ini sangat penting karena system saat ini sudah memiliki certificate lama yang di-upload.

Audit bagaimana architecture dapat menangani dua generasi:

### Legacy

```text
External PDF
+
filename-derived number
```

### Future

```text
CalibrationJob
 ↓
System-generated Certificate
 ↓
System-generated Number
 ↓
QR
 ↓
Verification
 ↓
System-generated PDF
```

Tentukan apakah perlu membedakan:

```text
source = UPLOADED
source = GENERATED
```

atau apakah existing fields sudah cukup.

Jangan menambahkan field hanya karena terlihat bagus; berikan recommendation berdasarkan evidence.

---

# 14. Output yang Saya Inginkan

Buat audit report dengan struktur:

## Executive Summary

Ringkas kondisi architecture saat ini dan kesiapan menuju system-generated certificate.

## 1. Current Architecture

Diagram actual flow.

## 2. Certificate Lifecycle

Actual lifecycle dan status transition.

## 3. CalibrationJob Relationship

Actual relationship + integrity assumptions.

## 4. Certificate Numbering

Current behavior + requirement `CRT/YYYY/MM/NNNNN` + architecture gap.

## 5. QR & Verification

Current implementation + security + lifecycle behavior.

## 6. PDF

Current upload architecture vs future generated PDF.

## 7. Revision / Supersede / Revoke

Actual implementation dan gap.

## 8. Data Integrity Audit

Potential inconsistent states.

## 9. Legacy → System Generated Migration

Recommended migration strategy.

## 10. Architecture Gaps

Prioritize:

```text
CRITICAL
HIGH
MEDIUM
LOW
```

## 11. Open Decisions

Hanya keputusan yang memang membutuhkan business/product decision.

Contoh:

```text
- Numbering scope: company vs global
- Number reset policy
- Whether revised certificate gets a new number
- Whether legacy uploaded certificates receive QR
- Whether public verification exposes PDF
```

## 12. Recommended Target Architecture

Gambarkan target flow tanpa melakukan implementation:

```text
CalibrationJob
      ↓
Quality Review
      ↓
Certificate Creation
      ↓
Atomic Number Generation
      ↓
Certificate Issued
      ↓
PDF Generation
      ↓
QR Generation
      ↓
Public Verification
```

---

# Important Audit Rules

1. **Audit first. Do not modify code.**
2. Jangan membuat asumsi berdasarkan nama file saja; trace actual code.
3. Jangan menganggap `CertificateStatus` berdasarkan nama yang terlihat di schema. Temukan enum dan seluruh usage.
4. Jangan menganggap QR sudah aman hanya karena menggunakan token.
5. Jangan mengusulkan `MAX(number) + 1` sebagai numbering mechanism.
6. Periksa concurrency dan transaction boundary.
7. Bedakan dengan jelas:

   - current behavior
   - architectural gap
   - recommendation
   - open business decision

8. Semua finding harus menyebutkan:

   - file path
   - relevant function/component
   - evidence
   - impact

9. Jangan implementasikan fix.
10. Fokus audit harus mencakup **end-to-end lifecycle**, bukan hanya UI Certificate.

## Final Question

Di akhir audit, jawab secara eksplisit:

> **Apakah architecture Certificate saat ini sudah memiliki fondasi yang benar untuk beralih dari "user upload external certificate" menjadi "Medcal system generates and issues Certificate with human-readable number + QR verification", atau terdapat architectural blocker yang harus diperbaiki terlebih dahulu?**

Berikan alasan teknis dan evidence dari code.
