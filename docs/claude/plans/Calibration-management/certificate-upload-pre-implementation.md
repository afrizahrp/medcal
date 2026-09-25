# AUDIT & DESIGN TASK — CERTIFICATE MANAGEMENT

## Context

Certificate Management / Certificate Upload **BELUM DIIMPLEMENTASIKAN** di MedCal.

Jangan mengasumsikan sudah ada:

- Certificate model
- Certificate API
- Certificate UI
- Certificate storage
- Certificate permission
- Certificate workflow

Task ini adalah:

> **AUDIT EXISTING CODEBASE + DESIGN READINESS**

Bukan implementasi.

### HARD RULE

**DO NOT MODIFY CODE.**

Do not:

- modify Prisma schema
- create migration
- create API
- create UI
- modify existing workflow
- modify permissions
- modify seed
- modify database
- delete/refactor existing code

---

# 1. TARGET BUSINESS FLOW

Flow utama:

```text
Calibration Job
      ↓
Technician / Calibration Process
      ↓
MT / Technical Review
      ↓
QA Approval
      ↓
Certificate finalized / available
```

Namun **Certificate Upload adalah flow independen**:

```text
Calibration Job
      ↓
Upload Certificate
      ↓
Certificate stored
      ↓
Certificate linked to Calibration Job
```

Secara konsep:

```text
                         ┌── Upload Certificate
                         │
Calibration Job ─────────┤
                         │
                         └── MT → QA Approval
                                  ↓
                            Certificate lifecycle
```

## IMPORTANT BUSINESS RULE

Certificate **BOLEH di-upload sebelum QA approval**.

Contoh valid:

```text
Calibration Job
QA = NOT APPROVED
Certificate = UPLOADED
```

Ini bukan error.

QA approval **BUKAN hard prerequisite untuk upload**.

Tetapi:

```text
Upload Certificate
        ≠
QA Approved
```

Upload tidak boleh dianggap otomatis sebagai approval.

---

# 2. AUDIT EXISTING DOMAIN

Sebelum menentukan desain Certificate Management, audit implementation existing.

Cari dan pahami:

```text
CalibrationRequest
CalibrationJob
WorkOrder
Device
Customer
Technician
MT / Technical Review
Quality Review
QA
Approval
Job Status
```

Trace actual relationship.

Contoh:

```text
CalibrationRequest
      ↓
WorkOrder
      ↓
CalibrationJob
```

atau struktur aktual yang digunakan project.

**Jangan mengasumsikan contoh di atas benar.**

Gunakan:

- Prisma schema
- migrations
- service
- controller/API
- frontend
- existing business logic

sebagai source of truth.

---

# 3. AUDIT CALIBRATION JOB LIFECYCLE

Cari seluruh status dan transition Calibration Job.

Dokumentasikan:

```text
Current Status
    ↓
Allowed Transition
    ↓
Actor
    ↓
Validation
```

Fokus pada:

- job creation
- assignment
- technician processing
- completion
- MT review
- technical review
- quality review
- QA approval
- rejection
- revision/return
- finalization

Jawab:

> Pada step mana Certificate secara business context mulai relevan?

Tetapi jangan menjadikan step tersebut sebagai hard prerequisite upload tanpa business rule eksplisit.

---

# 4. AUDIT EXISTING QA FLOW

Trace QA implementation end-to-end:

```text
UI
 ↓
API
 ↓
Service
 ↓
Database
```

Cari:

- QA entity
- review entity
- approval entity
- approval status
- approval timestamp
- approvedBy
- rejection reason
- return/revision flow
- permission
- audit log

Jawab:

1. Siapa yang melakukan MT approval?
2. Siapa yang melakukan QA approval?
3. Apakah MT dan QA merupakan actor/entity berbeda?
4. Apa status Calibration Job setelah QA approval?
5. Apakah QA approval mengubah status job?
6. Apakah QA approval menghasilkan event/side effect?
7. Apakah ada existing document/file attachment mechanism yang bisa dipakai?

---

# 5. AUDIT EXISTING FILE / DOCUMENT INFRASTRUCTURE

Certificate belum ada, tetapi mungkin project sudah mempunyai generic file/document infrastructure.

Cari:

```text
upload
file
attachment
document
storage
S3
local storage
FILES_ROOT
download
signed URL
presigned URL
MIME
multipart
```

Audit:

```text
UI
 ↓
Upload API
 ↓
Storage service
 ↓
Database metadata
```

Tentukan apakah existing infrastructure dapat digunakan oleh Certificate Management.

### IMPORTANT

Jangan membuat storage mechanism baru jika existing infrastructure memang sudah cocok.

Tetapi jangan memaksakan generic attachment model jika kebutuhan Certificate membutuhkan lifecycle, ownership, audit, atau security yang tidak dapat direpresentasikan dengan baik.

---

# 6. AUDIT EXISTING AUDIT LOG

Cari AuditLog implementation yang sudah ada.

Tentukan bagaimana aktivitas business document dicatat.

Audit apakah infrastructure existing dapat mencatat:

```text
CERTIFICATE_UPLOADED
CERTIFICATE_REPLACED
CERTIFICATE_DELETED
CERTIFICATE_DOWNLOADED
CERTIFICATE_APPROVED
CERTIFICATE_REJECTED
```

**Belum perlu menambahkan event apa pun.**

Hanya tentukan apakah infrastructure existing mendukungnya.

---

# 7. AUDIT RBAC

Audit role/permission yang berhubungan dengan:

```text
Calibration Job
Quality Review
QA
Document
File
Download
Upload
Approval
```

Trace:

```text
Role
 ↓
Permission
 ↓
Backend authorization
 ↓
Frontend visibility
```

Jangan menentukan permission hanya berdasarkan nama role.

Gunakan implementation existing.

Kemudian tentukan role mana yang secara business context kemungkinan membutuhkan:

```text
Upload Certificate
View Certificate
Download Certificate
Replace Certificate
Delete Certificate
Approve Certificate
```

**Ini proposal design, bukan perubahan permission.**

---

# 8. DETERMINE CERTIFICATE OWNERSHIP

Ini bagian penting.

Tentukan dari existing domain:

> Certificate sebenarnya milik entity apa?

Evaluasi minimal:

### Option A

```text
Certificate
   ↓
CalibrationJob
```

### Option B

```text
Certificate
   ↓
WorkOrder
```

### Option C

```text
Certificate
   ↓
CalibrationRequest
```

### Option D

Combination / indirect relationship.

Pilih berdasarkan domain existing, bukan berdasarkan asumsi.

Explain:

- why
- traceability
- cardinality
- lifecycle
- query pattern
- download authorization

---

# 9. DETERMINE CARDINALITY

Tentukan apakah:

```text
CalibrationJob 1 : 1 Certificate
```

atau:

```text
CalibrationJob 1 : N Certificate
```

Jangan mengasumsikan 1:1.

Audit kebutuhan:

- re-upload
- replacement
- certificate revision
- corrected certificate
- historical certificate
- multiple certificate documents

Jika belum dapat dipastikan dari existing business rules:

```text
AMBIGUOUS — BUSINESS DECISION REQUIRED
```

Jangan mengarang.

---

# 10. CERTIFICATE LIFECYCLE DESIGN

Buat proposal lifecycle berdasarkan existing QA lifecycle.

Contoh saja — **JANGAN otomatis menggunakan state ini**:

```text
UPLOADED
UNDER_REVIEW
APPROVED
REJECTED
FINAL
```

Gunakan state yang benar-benar diperlukan.

Yang wajib dapat direpresentasikan adalah:

```text
Certificate uploaded
        ↓
QA NOT APPROVED
```

dan:

```text
Certificate uploaded
        ↓
QA APPROVED
```

tanpa membuat data contradiction.

### Critical distinction

Harus jelas perbedaan:

```text
File exists
```

vs

```text
Certificate is approved
```

vs

```text
Certificate is final/issued
```

Jika existing domain belum mempunyai konsep yang cukup untuk membedakan ketiganya, catat sebagai GAP.

---

# 11. PROPOSED DATA MODEL

Setelah audit selesai, buat **proposal model**, bukan migration.

Contoh format:

```text
Certificate
-----------
id
calibrationJobId
...
```

Untuk setiap field jelaskan:

| Field | Purpose | Required? | Source |
| ----- | ------- | --------- | ------ |
| ...   | ...     | ...       | ...    |

Jelaskan:

- PK
- FK
- unique
- index
- status
- timestamps
- uploader
- approver
- storage metadata

Jangan menambahkan field hanya karena "best practice".

---

# 12. PROPOSED FILE MODEL

Bedakan:

```text
Certificate business record
```

dengan:

```text
Physical certificate file
```

Jika memang perlu.

Contoh konsep:

```text
Certificate
    ↓
Certificate File
    ↓
Storage
```

atau jika existing infrastructure sudah cukup:

```text
Certificate
    ↓
Existing Attachment/File
```

Tentukan berdasarkan audit existing infrastructure.

---

# 13. PROPOSED API

Belum membuat endpoint.

Hanya desain contract.

Minimal evaluasi kebutuhan:

```text
POST   /calibration-jobs/:id/certificate
GET    /calibration-jobs/:id/certificate
GET    /certificates/:id
GET    /certificates/:id/download
PATCH  /certificates/:id
DELETE /certificates/:id
```

**Endpoint di atas hanya contoh.**

Jangan otomatis menggunakan URL tersebut.

Gunakan convention existing project.

Untuk setiap proposed endpoint jelaskan:

- purpose
- actor
- permission
- validation
- QA dependency
- expected response
- error cases

---

# 14. CRITICAL API RULE

Upload API harus memungkinkan:

```text
Calibration Job
QA = NOT APPROVED
        ↓
Upload Certificate
        ↓
SUCCESS
```

Tidak boleh:

```text
QA = NOT APPROVED
        ↓
Upload Certificate
        ↓
403 / 400
```

hanya karena QA belum approved.

Namun API juga tidak boleh mengubah QA status secara implicit:

```text
Upload Certificate
        ↓
QA = APPROVED
```

Tidak boleh.

---

# 15. PROPOSED UI

Audit existing Calibration Job Detail UI.

Tentukan lokasi yang paling natural untuk:

```text
Certificate
```

Contoh:

```text
Calibration Job Detail
 ├── Overview
 ├── Work / Result
 ├── Quality Review
 ├── Certificate
 └── Audit History
```

Tetapi gunakan existing UI architecture.

Tentukan:

- upload button
- current certificate display
- status
- uploader
- upload date
- download
- replace
- delete if allowed
- approval indicator

### Important

UI upload button **tidak boleh otomatis hidden hanya karena QA belum approved**, kecuali ada permission restriction yang memang berasal dari RBAC.

Jika ingin memberikan warning:

```text
QA review belum approved.
Certificate tetap dapat di-upload.
```

itu acceptable.

---

# 16. SECURITY DESIGN

Audit/design minimal:

### Upload

- authentication
- authorization
- MIME validation
- extension validation
- file size
- filename sanitization
- storage path
- path traversal protection

### Download

Pastikan:

```text
User has access to Calibration Job
        ↓
User may access Certificate
```

Jangan mengandalkan certificate ID saja.

Misalnya user tidak boleh:

```text
GET /certificate/123
```

dan memperoleh certificate milik Calibration Job yang tidak boleh dia akses.

---

# 17. EDGE CASES

Analisis expected behavior untuk:

### Case 1

```text
QA NOT APPROVED
Certificate NOT UPLOADED
```

### Case 2

```text
QA NOT APPROVED
Certificate UPLOADED
```

**VALID.**

### Case 3

```text
QA APPROVED
Certificate UPLOADED
```

### Case 4

```text
QA REJECTED
Certificate already uploaded
```

### Case 5

```text
Certificate uploaded
Certificate replaced
```

### Case 6

```text
Calibration Job A
Certificate A

User attempts to access Certificate A through Job B
```

### Case 7

```text
Calibration Job cancelled
Certificate already uploaded
```

### Case 8

```text
QA approved
Certificate does not exist
```

Tentukan apakah kondisi ini:

- valid
- warning
- blocked
- business decision required

Jangan mengarang jika business rule belum tersedia.

---

# 18. IDENTIFY EXISTING PATTERNS TO REUSE

Cari implementation existing yang dapat dijadikan reference, misalnya:

- Quotation PDF
- PO document
- Work Order document
- LK PDF
- file download
- attachment
- AuditLog
- re-auth token
- RBAC
- Calibration Job detail
- Quality Review

Untuk setiap relevant pattern:

```text
Existing Pattern
        ↓
Potentially reusable for Certificate
        ↓
Reason
```

Prioritaskan consistency dengan architecture MedCal yang sudah ada.

---

# 19. GAP ANALYSIS

Buat tabel:

| Area              | Existing | Required for Certificate | Gap |
| ----------------- | -------- | ------------------------ | --- |
| Calibration Job   |          |                          |     |
| QA Flow           |          |                          |     |
| File Storage      |          |                          |     |
| Document Model    |          |                          |     |
| Audit Log         |          |                          |     |
| RBAC              |          |                          |     |
| API Pattern       |          |                          |     |
| UI Pattern        |          |                          |     |
| Download Security |          |                          |     |

Gunakan:

```text
NO GAP
MINOR GAP
MEDIUM GAP
MAJOR GAP
BUSINESS DECISION REQUIRED
```

Rating hanya untuk **technical/design gap**, bukan untuk menilai business decision.

---

# 20. PROPOSED ARCHITECTURE

Setelah audit, buat diagram:

```text
                    Calibration Job
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
      Certificate Upload       MT / QA Workflow
              │                       │
              ▼                       ▼
        Certificate              QA Approval
              │                       │
              └───────────┬───────────┘
                          ▼
                 Certificate Lifecycle
```

Jelaskan titik integrasi tanpa membuat upload dependent terhadap QA.

---

# 21. IMPLEMENTATION PLAN

Berikan urutan implementation yang direkomendasikan, misalnya:

```text
Phase 1 — Database
Phase 2 — Storage
Phase 3 — Backend API
Phase 4 — Authorization
Phase 5 — Calibration Job UI
Phase 6 — QA integration
Phase 7 — Audit Log
Phase 8 — Testing
```

Tetapi sesuaikan dengan architecture existing.

**Jangan melakukan phase tersebut sekarang.**

---

# 22. REQUIRED TEST MATRIX

Buat proposed test matrix.

Minimal:

| Scenario                              | Expected |
| ------------------------------------- | -------- |
| Upload before QA approval             | Allowed  |
| Upload after QA approval              | Allowed  |
| Upload without permission             | Rejected |
| Download authorized certificate       | Allowed  |
| Download unauthorized certificate     | Rejected |
| Wrong Calibration Job                 | Rejected |
| Invalid file                          | Rejected |
| Oversized file                        | Rejected |
| QA rejection after upload             | Defined  |
| Certificate missing after QA approval | Defined  |

---

# 23. FINAL REPORT

Output harus berakhir dengan:

## CERTIFICATE MANAGEMENT READINESS AUDIT

### Existing Certificate Implementation

```text
NOT IMPLEMENTED
```

### Existing Infrastructure Relevant to Certificate

[list]

### Recommended Certificate Ownership

[conclusion / ambiguity]

### Recommended Cardinality

[conclusion / ambiguity]

### Upload Dependency on QA

```text
INDEPENDENT
```

### QA Relationship

[explanation]

### Required Components

[list]

### Existing Components Reusable

[list]

### Gaps

[list]

### Business Decisions Still Required

[list]

### Recommended Implementation Sequence

[list]

### Code Changes

```text
NONE
```

---

# FINAL HARD RULE

**THIS IS AN AUDIT + DESIGN TASK ONLY.**

Do not modify:

- Prisma schema
- migrations
- API
- service
- controller
- frontend
- seed
- permissions
- database
- storage

Do not create files unless explicitly required for the audit report.

Do not implement Certificate Management.

Do not invent missing business rules.

If something cannot be determined from the existing codebase, explicitly mark:

```text
BUSINESS DECISION REQUIRED
```

The most important business rule is:

> **Certificate Upload is available from Calibration Job independently of QA approval. QA approval is part of the certificate lifecycle, not a hard prerequisite for uploading the certificate.**
