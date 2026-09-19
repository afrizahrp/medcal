# ERD Overview — medcal MVP

Conceptual entity-relationship diagrams. Attribute detail: [`attributes.md`](./attributes.md).

---

## 1. Acquisition (Website → ContactMessage → Lead → Customer)

```mermaid
erDiagram
  Company ||--o{ ContactMessage : captures
  Company ||--o{ Lead : owns
  Company ||--o{ Customer : serves
  Company ||--o{ UserMembership : scopes
  User ||--o{ UserMembership : has
  User ||--o| CustomerUserLink : portal
  Customer ||--o| CustomerUserLink : grants
  Customer ||--o{ CustomerContact : has
  ContactMessage ||--o| Lead : may_create
  ContactMessage }o--o| Customer : match_candidate
  Lead }o--o| Customer : converts_to
  User ||--o{ FCMToken : subscribes

  Company {
    string id PK
    string name
    string status
  }

  ContactMessage {
    string id PK
    string companyId FK
    string getFrom
    string status
    string email
    string matchStatus
    string matchedCustomerId FK
    string leadId FK
  }

  Lead {
    string id PK
    string companyId FK
    string status
    string contactMessageId FK
    string customerId FK
  }

  Customer {
    string id PK
    string companyId FK
    string status
  }

  CustomerContact {
    string id PK
    string customerId FK
    string email
  }

  User {
    string id PK
    string email
    string status
  }

  UserMembership {
    string id PK
    string userId FK
    string companyId FK
    string role
  }

  CustomerUserLink {
    string id PK
    string userId FK
    string customerId FK
  }

  FCMToken {
    string id PK
    string userId FK
    string companyId FK
    string app
  }
```

**Notes**
- Pola intake = **bi-erp `ContactMessage` + `GetMessageFrom`** (`CONTACTFORM` \| `WHATSAPP` \| `CHAT_AI` \| `CHAT_PERSON` \| `EMAIL`)
- Public website → Express edge → Nest creates `ContactMessage` with `companyId` from **server env**
- `matchStatus` (medcal): none | exact_email | domain_candidate | confirmed_existing | dismissed
- Domain match excludes public email blocklist
- New prospect → `Lead`; confirmed existing → skip Lead, go to Request
- `ChatSession` / `ChatMessage` / `ChatSessionToken` are **MVP** (human-only, see Adoption Matrix) — only the full mailbox `Email` stack remains a later port from bi-erp

---

## 2. Delivery spine (Request → Certificate)

```mermaid
erDiagram
  Company ||--o{ Device : scopes
  Company ||--o{ CalibrationRequest : scopes
  Company ||--o{ Quotation : scopes
  Company ||--o{ WorkOrder : scopes
  Company ||--o{ ServiceTariff : owns
  Customer ||--o{ Device : owns
  Customer ||--o{ CalibrationRequest : requests
  Customer ||--o{ Quotation : receives
  Lead ||--o| CalibrationRequest : may_spawn
  CalibrationRequest ||--o{ CalibrationRequestItem : lines
  Device ||--o{ CalibrationRequestItem : referenced
  CalibrationRequest ||--o{ Quotation : priced_as
  ServiceTariff ||--o{ QuotationItem : may_price
  Quotation ||--o{ QuotationItem : lines
  Quotation ||--o{ WorkOrder : spawns
  WorkOrder ||--o{ WorkOrderAssignment : assigns
  User ||--o{ WorkOrderAssignment : technician
  WorkOrder ||--o{ CalibrationJob : executes
  Device ||--o{ CalibrationJob : one_device_per_job
  CalibrationJob ||--o{ MeasurementResult : records
  CalibrationJob ||--o{ JobEvidence : evidence
  CalibrationJob ||--o| CustomerSignature : signed
  CalibrationJob ||--o{ QualityReview : reviewed
  QualityReview ||--o| Certificate : issues
  Device ||--o{ Certificate : certifies
  Customer ||--o{ Certificate : holds
  Certificate ||--o| Certificate : supersedes

  CalibrationRequest {
    string id PK
    string companyId FK
    string customerId FK
    string serviceMode
    string status
  }

  Quotation {
    string id PK
    string companyId FK
    string customerId FK
    string requestId FK
    string source
    string status
  }

  WorkOrder {
    string id PK
    string companyId FK
    string quotationId FK
    string customerId FK
    string serviceMode
    string addressText
    string status
  }

  CalibrationJob {
    string id PK
    string workOrderId FK
    string deviceId FK
    string status
  }

  QualityReview {
    string id PK
    string calibrationJobId FK
    string decision
    string status
  }

  Certificate {
    string id PK
    string companyId FK
    string customerId FK
    string deviceId FK
    string calibrationJobId FK
    string status
    string billingStatus
    datetime validUntil
    string supersedesCertificateId FK
  }
```

**Notes**
- Quotation **approved** required before WorkOrder
- Quotation → WorkOrder **1:N**
- CalibrationJob → **exactly one Device**
- Certificate `issued` ⇒ `billingStatus = billable` (auto)
- `supersedesCertificateId` for replacement certificates

---

## 3. Billing & retain (Invoice → Payment / CreditNote → Reminder)

```mermaid
erDiagram
  Company ||--o{ Invoice : scopes
  Company ||--o{ CreditNote : scopes
  Customer ||--o{ Invoice : billed
  Customer ||--o{ CreditNote : adjusted
  Invoice ||--o{ InvoiceItem : lines
  Invoice ||--o{ InvoiceCertificate : includes
  Certificate ||--o{ InvoiceCertificate : billed_via
  Invoice ||--o{ Payment : receives
  Invoice ||--o{ CreditNote : corrected_by
  Certificate ||--o{ CreditNote : may_reference
  Certificate ||--o{ ReminderEvent : reminds
  Customer ||--o{ ReminderEvent : notified
  Company ||--o{ FileObject : stores
  Certificate ||--o{ FileObject : pdf
  JobEvidence }o--|| FileObject : blob
  CustomerSignature }o--o| FileObject : blob

  Invoice {
    string id PK
    string companyId FK
    string customerId FK
    string status
    decimal totalAmount
  }

  InvoiceCertificate {
    string id PK
    string invoiceId FK
    string certificateId FK
  }

  InvoiceItem {
    string id PK
    string invoiceId FK
    string description
    decimal amount
  }

  Payment {
    string id PK
    string invoiceId FK
    decimal amount
    string method
  }

  CreditNote {
    string id PK
    string companyId FK
    string customerId FK
    string invoiceId FK
    string certificateId FK
    string status
    decimal amount
    string reason
  }

  ReminderEvent {
    string id PK
    string companyId FK
    string certificateId FK
    string customerId FK
    string status
  }

  FileObject {
    string id PK
    string companyId FK
    string ownerType
    string ownerId
    string storageKey
  }
```

**Notes**
- Billable path = Certificate only (`InvoiceCertificate`)
- No WO billable join in MVP
- CreditNote corrects after revoke/supersede **without** auto-voiding Invoice
- `Certificate.billingStatus` stays `invoiced` when already invoiced even if status → revoked/superseded

---

## 4. Cross-cutting invariants (ERD-level)

1. Every table above (except pure join keys) is scoped by `companyId` matching parent Company.
2. Invoice lines / certificates / credit notes for one Invoice share the **same customerId**.
3. `InvoiceCertificate` unique on `certificateId` for non-void invoices (a certificate not double-invoiced while active).
4. WorkOrder.quotationId required; Quotation.status must be `approved` at WO creation time (enforced in Nest, not DB trigger required for MVP).
5. CalibrationJob unique recommendation: (`workOrderId`, `deviceId`) active uniqueness.
6. Better Auth may add its own user/session tables; `User` / `Session` here are domain-facing names — map at Prisma phase.

---

## 5. Intentionally absent from MVP ERD

| Absent | Why |
| ------ | --- |
| Branch | ADR-000 |
| DebitNote, Refund entity | Later |
| InvoiceWorkOrderRef | Optional later |
| StandardInstrument | Later |
| Folder / ShareLink | Path on FileObject first |
| NewsletterSubscriber | Later |
| ReminderPolicy table | Settings/defaults first |

---

## 6. Validation

Confirm before Prisma:

1. Diagrams match locked funnel (Acquisition → Delivery → Collect)?  
2. CreditNote placement (optional FK to Invoice + Certificate) acceptable?  
3. MeasurementResult / JobEvidence as separate entities (vs JSON-only on Job) — catalog says entities + JSON payload on MeasurementResult OK  

If approved → Prisma in `packages/db`.
