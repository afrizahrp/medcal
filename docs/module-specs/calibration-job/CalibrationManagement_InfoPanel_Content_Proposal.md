# Calibration Management — Info Panel Content Proposal (Stage 1)

**Status:** Stage 2 complete — panel implemented from approved copy.  
**Reference pattern:** Device Management info panel
([`device-management-info-panel.tsx`](../../../../apps/portal/src/components/management/device-management-info-panel.tsx)
+ finalized draft in
[`DeviceManagement_InfoPanel_Content_Proposal.md`](./DeviceManagement_InfoPanel_Content_Proposal.md)).  
**Implementation:**
[`calibration-management-info-panel.tsx`](../../../../apps/portal/src/components/management/calibration-management-info-panel.tsx)
wired in [`management/layout.tsx`](../../../../apps/portal/src/app/management/layout.tsx).

## Purpose of this document

We plan to add a **persistent, collapsible info panel** at the top of
**Calibration Management** pages — same orientation pattern as Device Management —
so a new user can understand this menu in about 15 seconds. This report is the
verified picture of what lives under the menu, how concepts relate, what help
text already exists, and a draft of the panel copy.

---

## Key finding up front: the menu is DB-driven

The Management sidebar is rendered from the `Menu` table via
`GET /menu/nav?application=MANAGEMENT`
([`apps/portal/src/lib/use-nav.ts`](../../../../apps/portal/src/lib/use-nav.ts)),
seeded by
[`packages/db/prisma/seed-menu.ts`](../../../../packages/db/prisma/seed-menu.ts)
(Calibration Management block ≈ lines 238–324). The table is editable at runtime
via `/management/menu-management`, so a deployed DB may differ from the seed.
**Confirm live labels/order before freezing panel copy.**

### Label vs. page-title inconsistency

| Nav label (seed) | href | Page title / breadcrumb | Note |
|---|---|---|---|
| **Tariff** | `/price-list-items` | **Price List** | CTA button still says “Tariff”; permission label maps `priceListItem` → “Tariff” |
| **Customer** | `/customers` | **Customers** | plural on page |
| **Requisition** | `/calibration-requests` | **Requisitions** | plural on page |
| **Quotation** | `/quotations` | **Quotations** | |
| **Purchase Order** | `/purchase-orders` | **Purchase Orders** | |
| **Work Order** | `/work-orders` | **Work Orders** | UI also says **SPK** (and **WOL** for In Lab numbers) |
| **Calibration Job** | `/calibration-jobs` | **Calibration Jobs** | |

**Recommendation:** panel terms follow **nav labels** (same approach as Device
Management). Call out Tariff ↔ Price List as a separate cleanup item if desired;
do not block the panel.

### What Claude Code already completed (Device Management pilot)

Uncommitted / in-repo work from the prior agent (current working tree):

| Artifact | State |
|---|---|
| `apps/portal/src/components/management/device-management-info-panel.tsx` | **Implemented** (new) — final condensed Indonesian copy |
| `apps/portal/src/app/management/layout.tsx` | Wired `DeviceManagementInfoPanel` into management layout |
| `DeviceManagement_InfoPanel_Content_Proposal.md` | Investigation + drafts (rev 2 + refinements) |
| `device-type-aliases-page-client.tsx` | Page intro helper removed (orientation moved to panel) |
| `price-list-items-page-client.tsx` | Page intro helper removed (same reason; page is under Calibration Management) |

**No Calibration Management info-panel component, layout hook, or prior Stage-1
proposal for this menu was found.** This document is the first Stage-1 pass.

---

## 1. Menu inventory

Parent group: **`Calibration Management`** (`seed-menu.ts`, `order: 3`, `isGroup`).  
Seven **flat** leaves — **no subgroups**. Sorted by `order`:

| # | Label | Type | href | Actual concept |
|---|---|---|---|---|
| 0 | `Tariff` | leaf | `/price-list-items` | Commercial price master per Device Name (`PriceListItem`) |
| 1 | `Customer` | leaf | `/customers` | Company customer master (`Customer`) |
| 2 | `Requisition` | leaf | `/calibration-requests` | Customer calibration request (`CalibrationRequest` + items) |
| 3 | `Quotation` | leaf | `/quotations` | Commercial quote from one Requisition (`Quotation`, 1:1 with request) |
| 4 | `Purchase Order` | leaf | `/purchase-orders` | Customer PO recorded against an approved Quotation |
| 5 | `Work Order` | leaf | `/work-orders` | Operational SPK/WOL; assignments, equipment-to-bring, Surat Jalan nested |
| 6 | `Calibration Job` | leaf | `/calibration-jobs` | One physical unit being calibrated under a Work Order |

**Not top-level menu items** (nested / out of scope for separate nav entries):

- **Surat Jalan Alat** (`EquipmentDeliveryNote`) — section on Work Order detail, ON_SITE only
- **Equipment yang akan dibawa** (`WorkOrderEquipment`) — section on Work Order detail, ON_SITE only
- **Identity Correction / AKD-AKL review / measurement / physical check / QA** — on Calibration Job detail (and signals on Work Order)
- **CreditNote / Invoice / Certificate** — exist in schema; **not** in this menu

---

## 2. Per-item meaning

All operational entities below are **company-scoped**. Models in
[`packages/db/prisma/schema.prisma`](../../../../packages/db/prisma/schema.prisma).

### 0. Tariff — `/price-list-items`

- **Model(s):** `PriceListItem` (keyed by `deviceTypeId` + effective dating). Legacy `ServiceTariff` still in schema; Quotation generation from Requisition uses **PriceListItem**, not ServiceTariff (`tariffId` set null on generate).
- **Plain language:** default unit price for each Device Name. When a Quotation is created, the active price for that date is **snapshotted** onto the quotation line.
- **Important dependency:** Device Name must exist (Device Management catalog).
- **Who:** office / admin commercial setup.
- **Setup vs operational:** **setup/master** (touched when tariffs change).

### 1. Customer — `/customers`

- **Model(s):** `Customer`, `CustomerContact`.
- **Plain language:** the organization that requests calibration and appears on commercial/ops documents.
- **Important dependency:** none inside this menu; required before creating a Requisition.
- **Who:** office / admin.
- **Setup vs operational:** **master**, but used continuously as customers are onboarded.

### 2. Requisition — `/calibration-requests`

- **Model(s):** `CalibrationRequest`, `CalibrationRequestItem`.
- **Plain language:** customer’s request for calibration — which Device Names, how many, service mode (On Site / In Lab), optional declared model / free-text Device ID / AKD-AKL.
- **Important dependency:** Customer required; each line needs Device Name. Item `deviceId` here is **customer free-text**, not FK to Device master (schema comments).
- **Who:** office intake.
- **Setup vs operational:** **operational** start of the commercial chain. Excel import available.

### 3. Quotation — `/quotations`

- **Model(s):** `Quotation`, `QuotationItem`.
- **Plain language:** price offer built from a submitted Requisition + Price List.
- **Important dependency:** must be created **from** a Requisition (`requestId` unique → one Quotation per request). Cannot be created standalone. Price List gaps become `pricePending` until priced.
- **Who:** office / sales-admin.
- **Setup vs operational:** **operational**.

### 4. Purchase Order — `/purchase-orders`

- **Model(s):** `PurchaseOrder`, `PurchaseOrderItem`.
- **Plain language:** recording the customer’s purchase order against an approved Quotation (customer PO number/date + commercial snapshot).
- **Important dependency:** Quotation must be **APPROVED** and `customerApprovedAt` set (service guard). Cannot create without Quotation.
- **Who:** office / admin dokumen.
- **Setup vs operational:** **operational**.

### 5. Work Order — `/work-orders`

- **Model(s):** `WorkOrder`, `WorkOrderItem`, `WorkOrderAssignment`, `WorkOrderEquipment`, `EquipmentDeliveryNote` (+ items).
- **Plain language:** operational work package (SPK for On Site, WOL for In Lab) — schedule/location, technician assignment, start/complete. ON_SITE also manages reference equipment to bring and Surat Jalan Alat.
- **Important dependency:** Purchase Order must be **APPROVED**. Create only via `purchaseOrderId`. Assign technicians before start. ON_SITE may require equipment confirmation before start / before issuing Surat Jalan.
- **Who:** office ops + planner; technicians are assignees (execution primarily Tech-PWA).
- **Setup vs operational:** **operational**.

### 6. Calibration Job — `/calibration-jobs`

- **Model(s):** `CalibrationJob` (+ `MeasurementResult`, `PhysicalCheckResult`, `JobReferenceEquipmentUsed`, `IdentityCorrection`, `QualityReview`, …).
- **Plain language:** **one physical unit** under a Work Order being calibrated (`unitOrdinal` / `unitTotal`). Not created manually — fanned out when Work Order starts (`IN_PROGRESS`), `deviceId` starts **null** until identity is confirmed (Identity Correction path).
- **Important dependency:** Work Order started. Catalog from Device Management (parameters, physical inspection, reference equipment) is consumed at execution/review.
- **Who:** technicians (field) + MT/QA (portal review/approve).
- **Setup vs operational:** **operational** (execution & quality).

---

## 3. Relationships

Verified from schema + service guards (no invented shortcuts):

```
Customer ──────────────────────────────┐
PriceListItem (per Device Name) ──┐    │
                                  │    │
                                  ▼    ▼
                         CalibrationRequest (1 customer, serviceMode)
                                  │ 1:1 (requestId @unique)
                                  ▼
                              Quotation  ◄── unitPrice snapshot from PriceListItem
                                  │
                                  ▼
                           PurchaseOrder
                                  │
                                  ▼
                             WorkOrder ── assignments (technicians)
                                  │         └── (ON_SITE) WorkOrderEquipment
                                  │                    └── EquipmentDeliveryNote (Surat Jalan)
                                  ▼
                          CalibrationJob × N   (N = Σ WorkOrderItem.qty)
                                  │
                                  ├── deviceId? → Device (bound later)
                                  ├── calibrationRequestItemId?
                                  ├── MeasurementResult / PhysicalCheckResult
                                  ├── JobReferenceEquipmentUsed
                                  ├── IdentityCorrection
                                  └── QualityReview → ACCEPTED_BY_QA
```

**Hard chain (cannot skip):**  
Requisition → Quotation → Purchase Order → Work Order → Calibration Job.

**Line trace (when present):**  
`CalibrationRequestItem` → `QuotationItem.requestItemId` → `PurchaseOrderItem` → `WorkOrderItem` → `CalibrationJob` (`purchaseOrderItemId`, `calibrationRequestItemId`).

---

## 4. Natural workflow

From implementation (Portal create gates + `work-orders.service` fan-out):

1. **Siapkan master:** Tariff (Price List per Device Name) + Customer.  
   (Device Name / catalog sendiri ada di Device Management — prasyarat, bukan menu ini.)
2. **Requisition** — buat (manual atau Excel), isi Device Name + qty + service mode; **Submit**.
3. **Quotation** — dari Requisition yang submitted; tinjau harga (dari Tariff); kirim; **Approve** (+ customer approval timestamp).
4. **Purchase Order** — dari Quotation approved; isi Customer PO No/Date; **Approve**.
5. **Work Order** — dari PO approved; lengkapi lokasi/jadwal; **Assign** teknisi → **Start** (`IN_PROGRESS`).  
   - ON_SITE: konfirmasi equipment dibawa; opsional **Issue Delivery Note** (Surat Jalan Alat).  
   - Start membuat **Calibration Job** otomatis (satu job per unit).
6. **Calibration Job** — eksekusi/ukur (Tech-PWA + portal review): identitas/Device, alat referensi, hasil, QA → **Accepted by QA**. Work Order dapat ditandai **Done**.

---

## 5. Existing help content

- **No** Calibration Management orientation panel yet (Device Management panel is the only parent-menu guide).
- Page-level intro on **Price List** was recently **removed** (Claude Code) — former text explained snapshot pricing from Requisition → Quotation.
- Representative inline/empty-state copy still in pages:

| Area | Example strings |
|---|---|
| Tariff | `"Belum ada tarif."`, `"Pilih Device Name…"` |
| Customer | `"Belum ada customer yang cocok dengan filter."`, `"Nama customer wajib diisi."` |
| Requisition | `"Select a customer first to add devices."`, `"Pilih device name. Nama alat customer, model, dan Device ID bersifat opsional."`, locked: `"Requisition ini tidak dapat diedit dalam status saat ini."` |
| Quotation | `"Belum ada quotation. Buat quotation dari Requisition."`, `"Quotation hanya dapat dibuat dari Requisition…"`, `"Item, Qty, dan tarif diambil otomatis dari Requisition + Price List…"` |
| Purchase Order | `"Belum ada purchase order. Buat PO dari Quotation yang sudah di-approve."`, `"Purchase Order dapat dibuat setelah quotation APPROVED dan disetujui customer."` |
| Work Order | `"Belum ada work order. Buat SPK dari Purchase Order yang sudah di-approve."`, `"Setelah ditandai selesai, Work Order terkunci…"`, Surat Jalan: `"Konfirmasi daftar equipment terlebih dahulu sebelum menerbitkan Surat Jalan."` |
| Calibration Job | `"Belum ada calibration job. Job dibuat otomatis saat Work Order dimulai (IN_PROGRESS)."`, `"Belum ada device yang di-assign. Identitas fisik dikonfirmasi lewat Berita…"` |

Tone matches Device Management conventions: formal terse Indonesian + English domain nouns; **no “Anda”**; **no “Perangkat”**.

---

## 6. Terminology

Exact user-facing terms to preserve in panel copy:

| Use in panel | Do not substitute |
|---|---|
| Calibration Management | — |
| Tariff | (page title “Price List” is alternate; prefer nav label) |
| Customer | pelanggan hanya jika sudah dipakai setempat; UI memakai Customer |
| Requisition | Calibration Request (model name — avoid in panel) |
| Quotation | — |
| Purchase Order | PO OK as abbreviation where UI already does |
| Work Order | SPK appears as synonym in search/empty states; WOL = In Lab number series |
| Calibration Job | Job |
| Device Name | Device Type / “jenis alat” alone |
| Device | unit fisik customer (bukan “Perangkat”) |
| On Site / In Lab | Service Mode labels (`ON_SITE` / `SEND_TO_LAB`) |
| Surat Jalan Alat | Delivery Note (section title Indonesian) |
| Accepted by QA | status label |

Status labels (UI English): Draft, Submitted, Sent, Approved, Planned, Assigned, In Progress, Done, Pending, Rework, Accepted by QA, Cancelled, dll.

---

## 7. Approved info-panel copy

Target density ≈ final Device Management panel (~15 detik).  
Labels = **nav labels**. Nested Surat Jalan digabung ke Work Order, bukan leaf terpisah.

### Tentang Calibration Management

Bagian ini mengelola alur operasional kalibrasi: tarif, customer, permintaan, dokumen komersial, Work Order, hingga Calibration Job per unit alat.

### Menu utama

- **Tariff** — harga default per Device Name; dipakai sebagai acuan saat membuat Quotation.
- **Customer** — data customer yang meminta kalibrasi.
- **Requisition** — permintaan kalibrasi dari customer (Device Name, jumlah, On Site / In Lab).
- **Quotation** — penawaran harga dari Requisition; dibuat dari Requisition, bukan berdiri sendiri.
- **Purchase Order** — pencatatan PO customer terhadap Quotation yang sudah disetujui.
- **Work Order** — SPK/WOL operasional: assign teknisi, jadwal, dan (On Site) equipment dibawa serta Surat Jalan Alat.
- **Calibration Job** — satu unit alat dalam Work Order; dibuat otomatis saat Work Order dimulai.

### Alur kerja

Tariff + Customer → Requisition → Quotation → Purchase Order → Work Order → Calibration Job.

---

### Condensed panel strings (Stage 2 ready)

Mirroring `device-management-info-panel.tsx` shape:

```
INTRO =
  "Bagian ini mengelola alur operasional kalibrasi: tarif, customer, permintaan, " +
  "dokumen komersial, Work Order, hingga Calibration Job per unit alat."

ITEMS:
  Tariff            — harga default per Device Name; dipakai sebagai acuan saat membuat Quotation.
  Customer          — data customer yang meminta kalibrasi.
  Requisition       — permintaan kalibrasi dari customer (Device Name, jumlah, On Site / In Lab).
  Quotation         — penawaran harga dari Requisition; dibuat dari Requisition, bukan berdiri sendiri.
  Purchase Order    — pencatatan PO customer terhadap Quotation yang sudah disetujui.
  Work Order        — SPK/WOL operasional: assign teknisi, jadwal, dan (On Site) equipment dibawa serta Surat Jalan Alat.
  Calibration Job   — satu unit alat dalam Work Order; dibuat otomatis saat Work Order dimulai.

WORKFLOW =
  "Tariff + Customer → Requisition → Quotation → Purchase Order → Work Order → Calibration Job."
```

---

## 8. Review decisions

**Locked by reviewer revision:**
1. **Tariff** — tetap label nav (bukan “Price List”).
2. **SPK/WOL** — dipertahankan di baris Work Order.
3. **Identitas Device** — dihapus dari baris Calibration Job (lebih pendek).
4. **Surat Jalan Alat** — tetap satu frasa di Work Order.
5. **Customer** — “data customer” (bukan “pelanggan”).
6. CreditNote / Invoice / Certificate / detail API — tetap tidak disebut.

**Masih opsional sebelum/saat Stage 2:** confirm live menu order di `/management/menu-management`.

---

## Verification

Stage 2 shipped:
- Panel renders only when a Calibration Management leaf is active (`isNavGroupActive`).
- Copy matches §7 approved revision.
- Device Management panel unchanged in behavior; both panels coexist in layout and mutually exclude by route.
