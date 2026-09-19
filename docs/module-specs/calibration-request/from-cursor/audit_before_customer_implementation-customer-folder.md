Audit: Lead + Customer Implementation

Mode: Read-only — tidak ada file yang dimodifikasi.

Sumber kebenaran: [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma), kode runtime di apps/api, apps/portal, packages/db, packages/shared.

1. Existing Architecture

Arsitektur saat ini terbagi menjadi dua lapisan yang tidak seimbang:

flowchart TB
subgraph inbound [Inbound - IMPLEMENTED]
WebForm[Contact Form / WhatsApp / Chat]
WebAPI[web-api public endpoints]
InternalAPI["POST /internal/contact-messages"]
CMS[ContactMessagesService.create]
end

subgraph leadDomain [Lead Domain - IMPLEMENTED]
LeadMatch[lead-matching.ts]
LeadCreate[Lead.create implicit]
LeadAPI[LeadsController / LeadsService]
LeadUI[Portal /management/leads]
end

subgraph customerDomain [Customer Domain - SCHEMA ONLY]
CustomerSchema[Customer + CustomerContact models]
CustMatch[CustomerContact lookup read-only]
CustAPI[NOT IMPLEMENTED]
CustUI[NOT IMPLEMENTED]
end

WebForm --> WebAPI --> InternalAPI --> CMS
CMS --> LeadMatch --> LeadCreate
CMS --> CustMatch
LeadCreate --> LeadAPI --> LeadUI
CustomerSchema -.-> CustMatch

Lead (IMPLEMENTED)

Entitas: Lead dengan snapshot denormalized (name, email, phone, organizationName) dari ContactMessage pertama.

Pembuatan: Implisit saat inbound ContactMessage — tidak ada POST /leads.

Matching: [apps/api/src/modules/leads/lead-matching.ts](apps/api/src/modules/leads/lead-matching.ts) — STRONG (phone+org) auto-attach, POSSIBLE → Needs Review, NONE → Lead baru.

API: [apps/api/src/modules/leads/leads.controller.ts](apps/api/src/modules/leads/leads.controller.ts) — list, detail, needs-review, status, assign, emails.

UI: Portal inbox berbasis ContactMessage di [apps/portal/src/app/management/leads/](apps/portal/src/app/management/leads/) — bukan daftar Lead langsung via GET /leads.

Validasi: Zod di [packages/shared/src/schemas/index.ts](packages/shared/src/schemas/index.ts) — leadListQuerySchema, leadStatusUpdateSchema, leadAssignSchema, contactMessageLeadResolutionSchema.

Customer (SCHEMA ONLY — tidak ada domain layer)

Model Prisma ada dengan relasi ke CalibrationRequest, Quotation, PurchaseOrder, WorkOrder, dll.

Tidak ada modul apps/api/src/modules/customers/.

Tidak ada prisma.customer.create atau customerContact.create di seluruh codebase TypeScript (grep hanya menemukan customerContact.findFirst di ContactMessagesService).

Satu-satunya runtime Customer logic: lookup read-only saat ingest ContactMessage di [apps/api/src/modules/contact-messages/contact-messages.service.ts](apps/api/src/modules/contact-messages/contact-messages.service.ts) baris 107–127.

Canonical creation path

TIDAK ADA. Tidak ada createCustomer(...). Manual creation dan Lead conversion keduanya belum ada, sehingga arsitektur "satu jalur canonical" belum dapat dinilai sebagai sudah diikuti — hanya direncanakan di [docs/cursor/entity-catalog.md](../../../architecture/entity-catalog.md).

2. Lead → Customer Conversion

Status: NOT IMPLEMENTED

Jawaban audit poin-per-poin

Pertanyaan

Temuan

A. Lead punya customerId?

YA — Lead.customerId String? (opsional FK ke Customer)

B. Conversion service/use-case?

NOT IMPLEMENTED — tidak ada convertLead, leadToCustomer, atau endpoint serupa

C. Transaksional?

NOT IMPLEMENTED — tidak ada flow conversion

D. Field Lead yang disalin ke Customer?

NOT IMPLEMENTED — tidak ada mapping yang diimplementasikan

E. Field Lead yang TIDAK disalin?

N/A — tidak ada conversion

F. Satu Lead → banyak Customer?

Schema mengizinkan (tidak ada unique pada customerId), tapi tidak ada enforcement karena conversion tidak ada

G. Banyak Lead → satu Customer?

Schema mendukung (N:0..1 Lead → Customer, Customer.leads[]) — tidak diimplementasikan

H. Apa yang terjadi ke Lead setelah conversion?

NOT IMPLEMENTED — status CONVERTED bisa diset manual via PATCH /leads/:id/status tanpa side-effect apapun

I. Relasi dipertahankan untuk audit?

Schema siap (Lead.customerId), runtime tidak menulis field ini

J. Duplicate Customer terdeteksi?

NOT IMPLEMENTED pada conversion — hanya lookup read-only saat ContactMessage ingest

K. Cara deteksi duplikat?

N/A untuk conversion

L. Company-scoped?

N/A untuk conversion

M. UI "Convert to Customer"?

NOT IMPLEMENTED — UI hanya punya dropdown status CONVERTED sebagai label

N. Contacts disalin?

NOT IMPLEMENTED

O. Address disalin?

NOT IMPLEMENTED — Lead tidak punya field address

P. Tax/legal fields disalin?

NOT IMPLEMENTED — Lead tidak punya legalName/taxId

Flow aktual (bukan conversion)

Inbound ContactMessage → Lead matching (attach/create Lead).

Staff bisa ubah status Lead ke CONVERTED via [LeadsService.updateStatus](apps/api/src/modules/leads/leads.service.ts) — hanya update kolom status, tidak set customerId, tidak buat Customer.

ContactMessage bisa punya matchedCustomerId + matchStatus jika email Lead cocok dengan CustomerContact existing — ini bukan conversion, hanya hint saat ingest.

Enum MatchStatus.CONFIRMED_EXISTING / DISMISSED dan kolom confirmedByUserId/confirmedAt ada di schema tetapi 0 referensi di TypeScript runtime.

3. Manual Customer Creation

Status: NOT IMPLEMENTED

Pertanyaan

Temuan

A. API/service/use-case

NOT IMPLEMENTED

B. Frontend form

NOT IMPLEMENTED — tidak ada /management/customers, hook, atau komponen

C. Required fields

N/A — tidak ada create flow; schema Prisma: companyId, number, name wajib

D. Optional fields

Schema: legalName, taxId, address opsional

E. Validation rules

NOT IMPLEMENTED — tidak ada Zod schema Customer di packages/shared

F. Duplicate prevention

NOT IMPLEMENTED untuk create

G. Company scoping

Schema punya companyId; API belum ada

H. Status default

CustomerStatus @default(ACTIVE) di schema

I. Contact creation

NOT IMPLEMENTED

J. Number generation

NOT IMPLEMENTED di runtime (lihat §4)

K. Authorization

NOT IMPLEMENTED — tidak ada permission customer:read/create/update; hanya customerDashboard:read (portal role CUSTOMER, bukan CRM)

L. Tests

NOT IMPLEMENTED

Shared logic dengan Lead conversion?

TIDAK. Keduanya belum ada; tidak ada fungsi bersama createCustomer(...).

4. Customer Numbering

Jawaban audit

Pertanyaan

Temuan

A. Customer punya field number?

YA — Customer.number String (required di schema Prisma saat ini)

B. Number di-generate di mana?

NOT IMPLEMENTED di runtime production — tidak ada prisma.customer.create

C. Pakai DocumentNumberService?

Infrastruktur YA, wiring TIDAK — service ada di [packages/db/src/document-number/document-number.service.ts](packages/db/src/document-number/document-number.service.ts)

D. DocumentNumberService support CUSTOMER?

YA — enum DocumentType.CUSTOMER, prefix CUS di [document-type-prefix.ts](packages/db/src/document-number/document-type-prefix.ts)

E. Kapan dialokasikan?

NOT IMPLEMENTED — seharusnya saat create/conversion (per entity-catalog), belum di-wire

F. Record Customer tanpa number?

Migration [20260823133000_add_document_numbering](packages/db/prisma/migrations/20260823133000_add_document_numbering/migration.sql) menambah kolom nullable dulu; NOT NULL hanya jika tabel kosong saat migration. Jika ada legacy rows, bisa nullable di DB meski schema Prisma sekarang required

G. Perlu migration/backfill?

Kemungkinan YA jika ada Customer rows legacy tanpa number — perlu verifikasi data produksi

H. API/UI pakai id vs number?

N/A — tidak ada API/UI Customer; downstream schema (Quotation, WorkOrder, dll.) referensi customerId (cuid), bukan number

Format CUS/YYYY/MM/NNNNN

SUDAH DIDUKUNG oleh infrastruktur:

Format: [formatDocumentNumber](packages/db/src/document-number/format-document-number.ts) → {PREFIX}/{YYYY}/{MM}/{NNNNN}

Sequence reset per tahun (bukan per bulan) — diuji di [document-number.service.test.ts](packages/db/src/document-number/document-number.service.test.ts)

companyId scope sequence via unique (companyId, documentType, year) — bukan bagian displayed number

Test: CUSTOMER → "CUS/2026/08/00001"

Kesimpulan numbering: Infrastruktur EXISTING & compliant dengan spesifikasi locked; alokasi ke Customer record NOT IMPLEMENTED.

5. Duplicate Customer Handling

Status: PARTIALLY IMPLEMENTED (read-only hint saat ContactMessage ingest saja)

Existing duplicate rules

ContactMessage ingest ([contact-messages.service.ts](apps/api/src/modules/contact-messages/contact-messages.service.ts)):

Exact email: CustomerContact.email case-insensitive match → matchStatus = EXACT_EMAIL, set matchedCustomerId

Domain candidate: jika domain bukan public email (isPublicEmailDomain) → email endsWith @domain → DOMAIN_CANDIDATE

Company-scoped: semua query filter companyId

Tidak ada duplicate check pada: Customer.name, Customer.legalName, Customer.taxId, phone, address.

Existing unique constraints (Customer)

@@unique([companyId, number]) // hanya nomor bisnis
@@index([companyId, status])
@@index([companyId, name]) // index saja, bukan unique

CustomerContact: @@index([companyId, email]) — bukan unique.

Existing validation

NOT IMPLEMENTED untuk Customer create/update.

Lead duplicate prevention = identity matching antar Lead (bukan Customer).

Behavior saat possible duplicate ditemukan

ContactMessage: set matchStatus + matchedCustomerId — tidak memblokir Lead creation, tidak membuat Customer, tidak ada UI/API untuk confirm/dismiss (CONFIRMED_EXISTING/DISMISSED unused).

Customer create: N/A — belum ada.

Jika ditanya "apakah ada duplicate prevention untuk Customer creation?" → NOT IMPLEMENTED.

6. Lead ↔ Customer Relationship

Prisma (actual)

model Lead {
...
customerId String?
...
customer Customer? @relation(fields: [customerId], references: [id])
...
}

model Customer {
...
leads Lead[]
...
}

Aspek

Cardinality

Lead → Customer

Many-to-one, optional (customerId nullable)

Customer → Leads

One-to-many (leads Lead[])

Required?

Tidak — Lead bisa exist tanpa Customer

Implikasi bisnis

Schema dirancang untuk many Lead → one Customer (riwayat prospect bisa link ke satu org).

Satu Lead tidak dibatasi unique ke satu Customer di DB (tidak ada @@unique pada customerId).

Runtime saat ini: semua Lead customerId = null karena tidak ada yang menulis field ini.

Menghapus Customer yang masih direferensikan Lead → Restrict (default Prisma, tidak ada onDelete pada relasi Lead→Customer).

Lead juga punya calibrationRequests CalibrationRequest[] — jalur langsung Lead→Request dimungkinkan di schema, terpisah dari Customer.

7. Customer Contact Handling

Status: SCHEMA ONLY — creation NOT IMPLEMENTED

Model

model CustomerContact {
id, companyId, customerId, name, email?, phone?, title?, isPrimary @default(false)
customer Customer @relation(..., onDelete: Cascade)
@@index([customerId])
@@index([companyId, email])
}

Pertanyaan

Temuan

Cara contacts dibuat

NOT IMPLEMENTED — tidak ada insert

Lead contact → CustomerContact conversion

NOT IMPLEMENTED — Lead punya scalar name/email/phone, bukan entitas LeadContact

Numbering/identity contacts

Tidak ada — contacts pakai cuid id

Required?

Schema: name required; email/phone optional; tidak ada constraint "minimal 1 contact per Customer"

Duplicate handling

Hanya dipakai untuk lookup exact email saat ContactMessage ingest; tidak ada dedup saat create contact

Scoping

companyId + customerId; tidak ada FK relation ke Company (scalar only)

isPrimary ada di schema tanpa unique partial index — multiple primary contacts dimungkinkan di DB.

8. Company / Tenant Isolation

Schema

Customer.companyId, Lead.companyId, CustomerContact.companyId — semua scoped per company.

Unique (companyId, number) pada Customer — isolasi nomor antar tenant.

API authorization

Single-tenant deployment: companyId dari process.env.COMPANY_ID, bukan dari client ([CompanyRoleGuard](apps/api/src/common/guards/company-role.guard.ts)).

Semua query Lead/ContactMessage: where: { companyId }.

Cross-company access → NotFoundException / empty (diuji di test Lead).

Customer isolation

Customer matching di ContactMessagesService filter companyId — Customer Company A tidak bisa match dari Company B.

Belum ada Customer CRUD untuk diverifikasi end-to-end, tapi pola repo konsisten: @CompanyId() decorator + guard.

Risiko cross-tenant

Low untuk Lead/ContactMessage (implemented & tested).

Customer CRUD belum ada — perlu mengikuti pola yang sama saat implementasi.

9. Existing Tests

Lead (IMPLEMENTED — cakupan kuat)

File

Cakupan

[leads.service.test.ts](apps/api/src/modules/leads/leads.service.test.ts)

findAll, findOne, updateStatus, assignToUser, tenant isolation

[contact-messages.lead-matching.test.ts](apps/api/src/modules/contact-messages/contact-messages.lead-matching.test.ts)

STRONG/POSSIBLE/NONE matching, tenant isolation

[contact-messages.needs-review.test.ts](apps/api/src/modules/contact-messages/contact-messages.needs-review.test.ts)

needs-review, resolveLeadMatch ATTACH/CREATE_NEW

[contact-messages.service.test.ts](apps/api/src/modules/contact-messages/contact-messages.service.test.ts)

Lead side-effect; hanya assert matchStatus NONE

[chat-sessions.service.test.ts](apps/api/src/modules/chat/chat-sessions.service.test.ts)

Chat → Lead pipeline

[lead-suggestion.service.test.ts](apps/api/src/modules/emails/lead-suggestion.service.test.ts)

Email → Lead suggestion

[emails.service.test.ts](apps/api/src/modules/emails/emails.service.test.ts)

Email ↔ Lead association

[access-control.test.ts](packages/auth/src/access-control.test.ts)

lead:read/update/assign permissions

Customer / Conversion (NOT IMPLEMENTED)

0 test untuk Customer CRUD, CustomerContact CRUD, Lead conversion, Lead.customerId, CONVERTED side-effects.

0 test untuk Customer matching (EXACT_EMAIL, DOMAIN_CANDIDATE, public domain exclusion).

Document numbering (IMPLEMENTED — layer db)

File

Cakupan

[format-document-number.test.ts](packages/db/src/document-number/format-document-number.test.ts)

Format CUS/YYYY/MM/NNNNN, validasi

[document-number.service.test.ts](packages/db/src/document-number/document-number.service.test.ts)

allocate CUSTOMER, reset tahun, tenant isolation; concurrency hanya untuk QUOTATION

10. Gaps

Untuk Lead → Customer

Conversion service/use-case transaksional

Endpoint API (mis. POST /leads/:id/convert atau dedicated action)

Penulisan Lead.customerId + set status CONVERTED atomik

Mapping field Lead → Customer (+ CustomerContact)

Alokasi CUS/YYYY/MM/NNNNN via DocumentNumberService.allocate

Duplicate check sebelum create (reuse logic email/domain yang sudah ada?)

UI "Convert to Customer" di Lead detail

Idempotency guard (Lead sudah converted / sudah punya customerId)

Tests end-to-end conversion

Untuk Manual Customer Creation

CustomersModule (service + controller)

POST /customers (+ list/detail/update jika MVP membutuhkan)

Zod schemas di packages/shared

RBAC permissions (customer:read, customer:create, dll.)

Form UI management + menu sidebar entry

createCustomer canonical function dengan DocumentNumberService

CustomerContact creation (minimal primary contact)

Duplicate prevention rules (minimal: email exact + optional taxId?)

Tests CRUD + numbering + tenant isolation

Infrastruktur sudah ada (bukan gap)

Schema Customer/Lead/CustomerContact + relasi

DocumentNumberService + CUSTOMER/CUS prefix

Partial duplicate hint di ContactMessage ingest

Lead pipeline lengkap

11. Recommended Minimal Implementation

Prinsip: Satu canonical createCustomer(...) dipakai manual create dan Lead conversion.

A. Manual Customer creation

// Pseudocode — belum implementasi
async createCustomer(companyId, input, tx?) {
// 1. duplicate check (email exact on CustomerContact, optional taxId on Customer)
// 2. prisma.$transaction:
// a. number = DocumentNumberService.allocate({ documentType: "CUSTOMER", ... })
// b. customer = prisma.customer.create({ companyId, number, name, ... })
// c. prisma.customerContact.create({ ... isPrimary: true })
// 3. return customer
}

Required input: name (+ minimal satu contact dengan name; email strongly recommended untuk dedup)

Optional: legalName, taxId, address, contact fields

Default status: ACTIVE

Permission: customer:create untuk ADMIN (ikuti pola Lead)

B. Lead → Customer conversion

async convertLeadToCustomer(companyId, leadId, overrides?, tx?) {
// Guard: lead exists, companyId match, lead.customerId == null
// Guard: lead.status != CONVERTED (or idempotent return existing)
// Map: name ← lead.name or organizationName
// contact ← lead.name, lead.email, lead.phone
// Call: createCustomer(...) OR link to existing if staff confirms match
// Update: lead.customerId, lead.status = CONVERTED
}

Transactional: Customer + Contact + number + Lead update dalam satu $transaction

Field mapping minimal:

Customer.name ← organizationName ?? name

CustomerContact ← name, email, phone dari Lead

legalName, taxId, address ← tidak ada di Lead → input manual/overrides atau kosong

Relasi preserved: Lead.customerId set; Lead tidak dihapus

One Lead → one Customer: enforce di service (reject jika customerId sudah set)

C. CUS numbering

Panggil DocumentNumberService.allocate({ documentType: "CUSTOMER", issuedAt: new Date(), tx }) inside create transaction — bukan implementasi terpisah.

Tidak perlu migration baru jika tabel Customer kosong; jika ada legacy rows tanpa number → backfill script terpisah.

D. Duplicate prevention (minimal)

Reuse pola existing ContactMessage:

Exact email pada CustomerContact (company-scoped) → reject atau return conflict dengan existing customerId

Optional: taxId match pada Customer jika provided (belum ada constraint — check di service)

Tidak perlu dedup advanced (domain merge, fuzzy name) kecuali product minta

E. Transactional integrity

Single prisma.$transaction untuk: allocate number → create Customer → create Contact → (conversion) update Lead

Idempotency: conversion gagal jika Lead sudah punya customerId

12. Files Relevant to Next Implementation

Backend (new + modify)

File

Aksi

apps/api/src/modules/customers/customers.module.ts

NEW

apps/api/src/modules/customers/customers.controller.ts

NEW — POST/GET/PATCH

apps/api/src/modules/customers/customers.service.ts

NEW — createCustomer, list, findOne

apps/api/src/modules/customers/customer-duplicate.ts

NEW (optional) — extract dedup logic dari ContactMessagesService

apps/api/src/modules/leads/leads.service.ts

MODIFY — add convertToCustomer atau delegate ke CustomersService

apps/api/src/modules/leads/leads.controller.ts

MODIFY — add convert endpoint

apps/api/src/app.module.ts

MODIFY — register CustomersModule

packages/shared/src/schemas/index.ts

MODIFY — customerCreateSchema, customerListQuerySchema, leadConvertSchema

packages/auth/src/access-control.ts

MODIFY — add customer: ["read", "create", "update"]

packages/db/prisma/seed-role-permissions.ts

MODIFY — grant customer permissions to ADMIN

packages/db/prisma/seed-menu.ts

MODIFY — add Customers menu item

Reuse (existing — no schema change)

File

Peran

packages/db/src/document-number/document-number.service.ts

Allocate CUS number

packages/db/src/document-number/document-type-prefix.ts

CUSTOMER → CUS

apps/api/src/modules/contact-messages/contact-messages.service.ts

Refactor dedup lookup ke shared helper (optional)

packages/shared/src/utils/index.ts

normalizeEmail, isPublicEmailDomain

Frontend (new)

File

Aksi

apps/portal/src/app/management/customers/page.tsx

NEW

apps/portal/src/app/management/customers/[id]/page.tsx

NEW

apps/portal/src/app/management/customers/use-customers-query.ts

NEW

apps/portal/src/app/management/leads/[id]/page.tsx

MODIFY — add Convert button

apps/portal/src/app/management/leads/leads-ui.tsx

MODIFY (optional) — show customer link if converted

Tests (new)

File

Aksi

apps/api/src/modules/customers/customers.service.test.ts

NEW

apps/api/src/modules/leads/leads.convert.test.ts

NEW

apps/api/src/modules/contact-messages/contact-messages.customer-matching.test.ts

NEW — EXACT_EMAIL, DOMAIN_CANDIDATE

Schema / migrations

Tidak perlu ubah schema untuk MVP jika Customer.number sudah required dan tabel kosong.

Mungkin perlu backfill migration/script jika ada Customer rows legacy.

Ringkasan Status

Capability

Status

Lead pipeline

IMPLEMENTED

Lead → Customer conversion

NOT IMPLEMENTED

Manual Customer creation

NOT IMPLEMENTED

CUS numbering infrastructure

IMPLEMENTED (not wired)

Customer duplicate prevention (create)

NOT IMPLEMENTED

Customer duplicate hint (ContactMessage)

PARTIALLY IMPLEMENTED

Canonical createCustomer path

NOT IMPLEMENTED
