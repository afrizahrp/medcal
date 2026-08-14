# ERD Attributes — medcal MVP (conceptual)

Not a Prisma schema. Types are indicative (`string`, `decimal`, `datetime`, `json`, `bool`).

Common on almost all entities:

| Field | Notes |
| ----- | ----- |
| `id` | PK |
| `companyId` | FK → Company (required) |
| `createdAt` / `updatedAt` | audit |
| `createdByUserId` | optional FK → User where useful |

---

## Organization & IAM

### Company
`name`, `legalName?`, `taxId?`, `address?`, `phone?`, `email?`, `status` (active|inactive), `settingsJson?`

### User
`email`, `name?`, `status` (invited|active|disabled)  
*(Better Auth may own canonical user rows — map later)*

### UserMembership
`userId`, `companyId`, `role` (superadmin|admin|supervisor|technician|finance|customer), `isDefault?`

### CustomerUserLink
`userId`, `customerId` (unique pair)

### FCMToken
`userId`, `token`, `deviceType`, `isActive`, `lastUsedAt`, `app` (portal|tech-pwa|web)

---

## Acquisition

### ContactMessage (bi-erp pattern; replaces LeadSubmission naming)
`getFrom` (CONTACTFORM|WHATSAPP|CHAT_AI|CHAT_PERSON|EMAIL),  
`status` (PENDING|READ|REPLIED|CLOSED),  
`subject?`, `topicId?`, `message`, `name`, `email`, `phone?`, `organizationName?` (bi-erp: `company` string),  
`utmJson?`,  
`matchStatus` (none|exact_email|domain_candidate|confirmed_existing|dismissed),  
`matchedCustomerId?`, `leadId?`, `confirmedByUserId?`, `confirmedAt?`

### Lead
`contactMessageId?`, `status` (new|contacted|qualified|rejected|converted),  
`assignedToUserId?`, `customerId?` (set on convert)  
*(source/channel diambil dari ContactMessage.getFrom — jangan duplikasi enum)*

### Customer
`name`, `legalName?`, `taxId?`, `address?`, `status` (active|inactive)

### CustomerContact
`customerId`, `name`, `email?`, `phone?`, `isPrimary?`, `title?`

---

## Devices & request

### Device
`customerId`, `brand?`, `model?`, `serialNumber?`, `category?`, `locationText?`, `status` (active|inactive)

### CalibrationRequest
`customerId`, `leadId?`, `serviceMode` (on_site|send_to_lab), `desiredScheduleNote?`,  
`status` (draft|submitted|in_quotation|cancelled|fulfilled), `notes?`

### CalibrationRequestItem
`requestId`, `deviceId`, `notes?`

---

## Commercial & WO

### ServiceTariff
`code`, `name`, `unitPrice`, `currency`, `isActive`

### Quotation
`customerId`, `requestId?`, `source` (portal|phone|whatsapp|other),  
`status` (draft|sent|approved|rejected|expired|cancelled),  
`validUntil?`, `subtotal`, `taxAmount?`, `totalAmount`, `currency`,  
`approvedAt?`, `approvedByUserId?` / `customerApprovedAt?`

### QuotationItem
`quotationId`, `deviceId?`, `requestItemId?`, `tariffId?`, `description`, `qty`, `unitPrice`, `lineTotal`

### WorkOrder
`quotationId` **required**, `customerId`, `number`,  
`serviceMode`, `addressText?`, `geoLat?`, `geoLng?`, `locationNotes?`,  
`scheduledStart?`, `scheduledEnd?`,  
`status` (planned|assigned|in_progress|technically_done|closed|cancelled)

### WorkOrderAssignment
`workOrderId`, `technicianUserId`, `roleOnJob?` (lead|assist)

---

## Field & QA

### CalibrationJob
`workOrderId`, `deviceId`, `status` (pending|in_progress|submitted|rework|accepted_by_qa),  
`startedAt?`, `submittedAt?`  
**Constraint:** one device per job; prefer unique (`workOrderId`,`deviceId`) while active

### MeasurementResult
`calibrationJobId`, `payloadJson`, `summaryJson?`, `recordedAt`

### JobEvidence
`calibrationJobId`, `fileObjectId`, `caption?`

### CustomerSignature
`calibrationJobId`, `fileObjectId?`, `signerName?`, `signedAt`

### QualityReview
`calibrationJobId`, `reviewerUserId`, `decision` (approve|reject),  
`status` (pending|approved|rejected), `notes?`, `reviewedAt?`

---

## Certificate

### Certificate
`customerId`, `deviceId`, `calibrationJobId`, `qualityReviewId?`,  
`number`, `verificationToken?`,  
`status` (draft|issued|revoked|superseded),  
`billingStatus` (unbilled|billable|invoiced),  
`issuedAt?`, `validUntil?`,  
`supersedesCertificateId?`, `revokeReason?`,  
`pdfFileObjectId?`

**Rules:** issued → billingStatus=billable; invoiced+revoke keeps billingStatus=invoiced

---

## Billing

### Invoice
`customerId`, `number`, `status` (draft|issued|partially_paid|paid|void),  
`issueDate?`, `dueDate?`, `subtotal`, `taxAmount?`, `totalAmount`, `currency`, `notes?`

### InvoiceCertificate
`invoiceId`, `certificateId`  
**Unique:** `certificateId` among non-void invoices (enforce in app/DB)

### InvoiceItem
`invoiceId`, `certificateId?`, `description`, `qty?`, `unitPrice?`, `amount`  
(snapshot; may denormalize from certificate/quotation)

### Payment
`invoiceId`, `amount`, `method` (transfer|cash|other), `paidAt`, `reference?`, `notes?`

### CreditNote
`customerId`, `invoiceId?`, `certificateId?`, `number`,  
`status` (draft|issued|applied|void),  
`amount`, `reason`, `issuedAt?`, `appliedAt?`

---

## Retain & vault

### ReminderEvent
`certificateId`, `customerId`, `channel` (email|push|whatsapp),  
`status` (scheduled|sent|failed|cancelled), `scheduledFor`, `sentAt?`

### FileObject
`customerId?`, `ownerType` (certificate|job_evidence|signature|request_attachment|invoice|credit_note|other),  
`ownerId`, `storageKey`, `mimeType?`, `sizeBytes?`, `originalName?`

---

## Enum quick list

See also [`../entity-catalog.md`](../entity-catalog.md) §5 — keep single source; this file repeats for ERD convenience.
