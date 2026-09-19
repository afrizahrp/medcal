# Implementation Report — CalibrationRequest API Module (Backend Only)

**Date:** 2026-08-25  
**Task:** Build CalibrationRequest API Module (Backend Only)

---

## Summary

Implementasi CalibrationRequest API module telah selesai. Modul ini mengikuti pattern yang sama dengan `CustomersModule` dan mencakup semua CRUD operations dengan company-scoped tenant isolation.

---

## Files Created/Changed by Step

### Step 1 — Shared Validation Schema

**File Modified:**
- `packages/shared/src/schemas/index.ts`

**Schema yang ditambahkan:**
- `calibrationRequestItemInputSchema` — nested item validation
- `calibrationRequestCreateSchema` — POST /calibration-requests body
- `calibrationRequestListQuerySchema` — GET /calibration-requests query params
- `calibrationRequestUpdateSchema` — PATCH /calibration-requests/:id body
- `CALIBRATION_REQUEST_SORTABLE_FIELDS` — whitelist untuk sorting

**Types yang di-export:**
- `CalibrationRequestCreateInput`
- `CalibrationRequestListQuery`
- `CalibrationRequestUpdateInput`

### Step 2 — Backend Module

**Files Created:**
- `apps/api/src/modules/calibration-requests/calibration-requests.service.ts`
- `apps/api/src/modules/calibration-requests/calibration-requests.controller.ts`
- `apps/api/src/modules/calibration-requests/calibration-requests.module.ts`

**File Modified:**
- `apps/api/src/app.module.ts` — menambahkan import `CalibrationRequestsModule`

**Service Methods:**
| Method | Description |
|--------|-------------|
| `create()` | Creates CalibrationRequest with items dalam transaction, allocates CRQ number |
| `findAll()` | Paginated list, company-scoped dengan search/filter |
| `findOne()` | Get by id, company-scoped |
| `update()` | Update fields dan items (only while DRAFT) |
| `cancel()` | Sets status to CANCELLED |
| `submit()` | Sets status from DRAFT to SUBMITTED |

**Controller Endpoints:**
| Method | Path | Permission |
|--------|------|------------|
| POST | `/calibration-requests` | calibrationRequest:create |
| GET | `/calibration-requests` | calibrationRequest:read |
| GET | `/calibration-requests/:id` | calibrationRequest:read |
| PATCH | `/calibration-requests/:id` | calibrationRequest:update |
| POST | `/calibration-requests/:id/cancel` | calibrationRequest:cancel |
| POST | `/calibration-requests/:id/submit` | calibrationRequest:update |

### Step 3 — Tests

**File Created:**
- `apps/api/src/modules/calibration-requests/calibration-requests.service.test.ts`

**Test Coverage:**
- ✅ Document number allocation (CRQ prefix, company-scoped sequence)
- ✅ Company-scoping (uses env-sourced companyId)
- ✅ Transaction rollback on failure
- ✅ CRUD operations (create, list, get, update-while-draft, cancel, submit)
- ✅ Tenant isolation (NotFoundException for cross-company access)
- ✅ Status transition validation

---

## CalibrationRequest Schema Fields (Source of Truth)

Diambil dari `packages/db/prisma/schema.prisma` (line 870-908):

**CalibrationRequest:**
| Field | Type | Required | Default |
|-------|------|----------|---------|
| id | String (cuid) | Yes | auto |
| companyId | String | Yes | - |
| customerId | String | Yes | - |
| number | String | Yes | allocated (CRQ prefix) |
| leadId | String? | No | null |
| serviceMode | ServiceMode | Yes | - |
| desiredScheduleNote | String? | No | null |
| status | CalibrationRequestStatus | Yes | DRAFT |
| notes | String? | No | null |
| createdAt | DateTime | Yes | now() |
| updatedAt | DateTime | Yes | auto |

**CalibrationRequestItem:**
| Field | Type | Required |
|-------|------|----------|
| id | String (cuid) | Yes |
| companyId | String | Yes |
| requestId | String | Yes |
| deviceId | String | Yes |
| notes | String? | No |
| createdAt | DateTime | Yes |

**CalibrationRequestStatus Enum (VERIFIED from schema.prisma line 106-112):**

```prisma
enum CalibrationRequestStatus {
  DRAFT
  SUBMITTED
  IN_QUOTATION
  CANCELLED
  FULFILLED
}
```

**5 values total** — NOT 7 as stated in `audit-technician-portal-e2e.md` Section 3 (which incorrectly listed QUOTED, ACCEPTED, IN_PROGRESS). The audit report's Section 3 table was inaccurate.

**State Transition Diagram:**
```
DRAFT → SUBMITTED → IN_QUOTATION → FULFILLED
                ↘ CANCELLED ↙
```

**States Reachable via CalibrationRequest Module API:**
| State | Reachable? | Method |
|-------|------------|--------|
| DRAFT | ✅ Yes | Initial state on create |
| SUBMITTED | ✅ Yes | `POST /:id/submit` |
| IN_QUOTATION | ❌ No | Will be triggered by Quotation module |
| FULFILLED | ❌ No | Will be triggered by downstream modules |
| CANCELLED | ✅ Yes | `POST /:id/cancel` |

**ServiceMode Enum:**
- `ON_SITE`
- `SEND_TO_LAB`

---

## TODO Business-Rule Gaps

Berikut adalah TODO comments yang ditambahkan dalam kode untuk keputusan bisnis yang memerlukan konfirmasi:

### 1. Edit Permission Rules (calibration-requests.service.ts)
```typescript
// TODO: Full edit-permission business rules need confirmation. Currently
// only allowing edits while status is DRAFT (the initial state).
```
**Location:** `update()` method  
**Decision Needed:** Apakah ada field tertentu yang masih bisa di-edit setelah status berubah dari DRAFT?

### 2. Status Transition to IN_QUOTATION (calibration-requests.service.ts)
```typescript
// TODO: Status transition to IN_QUOTATION will be triggered from the
// Quotation module when it's implemented. This module only handles
// DRAFT -> SUBMITTED and any status -> CANCELLED transitions.
```
**Location:** `cancel()` method  
**Decision Needed:** Bagaimana Quotation module akan trigger perubahan status ke IN_QUOTATION? Apakah melalui service method atau event?

---

## Verification Results

### Typecheck
```
✅ PASSED — All 10 packages typechecked successfully
   @medcal/api, @medcal/auth, @medcal/config, @medcal/db, 
   @medcal/notifications, @medcal/portal, @medcal/shared,
   @medcal/tech-pwa, @medcal/web, @medcal/web-api
```

### Linter
```
✅ PASSED — No linter errors found
```

### Tests (Revision Pass — 2026-08-25)
```
✅ PASSED — All tests executed against local PostgreSQL database

calibration-requests.service.test.ts: 16 tests passed
customers.service.test.ts:            12 tests passed
document-number.service.test.ts:      14 tests passed (packages/db)
────────────────────────────────────────────────────────
Total:                                42 tests passed
```

**Revision Note:** Initial test run had 1 failure due to incorrect prefix assertion (`REQ/` vs `CRQ/`). Fixed test to use correct prefix `CRQ/` per `DOCUMENT_TYPE_PREFIX` mapping in `packages/db/src/document-number/document-type-prefix.ts`.

---

## Scope Confirmation

| Area | Touched? |
|------|----------|
| `apps/portal` | ❌ NO |
| `apps/tech-pwa` | ❌ NO |
| Other lifecycle modules (Quotation, PurchaseOrder, WorkOrder, etc.) | ❌ NO |
| DocumentType enum | ❌ NO (already includes CALIBRATION_REQUEST) |
| Numbering tables | ❌ NO (DocumentNumberSequence already configured) |
| Permission catalog | ❌ NO (calibrationRequest resource already exists in B3 fix) |

---

## Files Changed Summary

| File | Change Type |
|------|-------------|
| `packages/shared/src/schemas/index.ts` | Modified |
| `apps/api/src/modules/calibration-requests/calibration-requests.service.ts` | Created |
| `apps/api/src/modules/calibration-requests/calibration-requests.controller.ts` | Created |
| `apps/api/src/modules/calibration-requests/calibration-requests.module.ts` | Created |
| `apps/api/src/modules/calibration-requests/calibration-requests.service.test.ts` | Created |
| `apps/api/src/app.module.ts` | Modified (1 import line) |

**Total:** 4 files created, 2 files modified
