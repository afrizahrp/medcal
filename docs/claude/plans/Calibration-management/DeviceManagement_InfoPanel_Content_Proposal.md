# Device Management — Info Panel Content Proposal (Stage 1)

**Status:** Investigation + draft copy. READ-ONLY stage. No panel component built yet.
**Revision:** rev 2 — now includes the newly-added **Physical Inspection** sub-menu (7 leaf items).
**Next:** HARD STOP for review before Stage 2 (panel component).

## Purpose of this document

We plan to add a **persistent, collapsible info panel** at the top of each
parent-menu section in Portal — **Device Management** first, as the pilot — so new
users can self-orient without formal training. This report is the accurate, verified
picture of what actually lives under this menu, how the pieces relate, what help text
already exists, and a draft of the panel copy.

---

## Key finding up front: the menu is DB-driven, not static code

The Management sidebar is rendered from the `Menu` database table, fetched at runtime
via `GET /menu/nav?application=MANAGEMENT`
([apps/portal/src/lib/use-nav.ts:28](../../../../apps/portal/src/lib/use-nav.ts#L28)),
rendered by
[apps/portal/src/components/management/sidebar-nav.tsx](../../../../apps/portal/src/components/management/sidebar-nav.tsx).
The code-defined source of truth is the seed
[packages/db/prisma/seed-menu.ts](../../../../packages/db/prisma/seed-menu.ts) (the
`Device Management` block runs roughly lines 85–235 after the Physical Inspection
insertion), but the table is **editable at runtime** via `/management/menu-management`,
so a deployed DB may differ from the seed. Labels below are from the seed as of this
investigation — **confirm against the live DB before the panel copy is frozen.**

### Label vs. target inconsistency (the confusing area — carried from rev 1)

| Nav label | href | `viewResource` | Actual page / concept |
|---|---|---|---|
| **Devices** | `/devices` | `deviceType` (mismatch) | `devices/` — a **customer's physical unit** |
| **Units** | `/device-types` | `device` (mismatch) | `device-types/` — a **catalog device class** ("Device Name") |

The `viewResource` values look swapped relative to their `href`. The seed carries an
apologetic comment: `// Code kept as-is: label "Units"; href points at DeviceType catalog.`
Pages themselves relabel "Device Type" as **"Device Name"** in all user-facing copy.
**Recommendation:** track as a separate cleanup item; do not block the panel on it.

---

## 1. Sub-menu inventory (verbatim, in coded order)

Parent group: **`Device Management`** (`seed-menu.ts:88-95`, `order: 2`, `isGroup`).
Seven leaf items in two subgroups plus five top-level leaves.

| # | Label (verbatim) | Type | href | Page dir under `apps/portal/src/app/management/` |
|---|---|---|---|---|
| 0 | `Categories` | leaf | `/device-categories` | `device-categories/` |
| 1 | `Customer Devices` | **subgroup** | — | — |
| 1.0 | `Devices` | leaf | `/devices` | `devices/` |
| 1.1 | `Name Aliases` | leaf | `/device-type-aliases` | `device-type-aliases/` |
| 1.2 | `Units` | leaf | `/device-types` | `device-types/` |
| 2 | `Models` | leaf | `/device-models` | `device-models/` |
| 3 | `Capabilities` | leaf | `/device-capabilities` | `device-capabilities/` |
| 4 | `Calibration Parameters` | leaf | `/device-calibration-parameters` | `device-calibration-parameters/` |
| **5** | **`Physical Inspection`** | **leaf** | **`/device-physical-check-items`** | **`device-physical-check-items/`** |
| 6 | `Reference Equipment` | **subgroup** | — | — |
| 6.0 | `Equipments` | leaf | `/equipment-types` | `equipment-types/` |
| 6.1 | `Requirements` | leaf | `/equipment-requirements` | `equipment-requirements/` |
| 6.2 | `Units` | leaf | `/equipment-units` | `equipment-units/` |

Physical Inspection block (`seed-menu.ts:183-193`), verbatim:

```ts
{
  application: "MANAGEMENT",
  code: "device-management.physical-inspection",
  parentCode: "device-management",
  label: "Physical Inspection",
  href: "/device-physical-check-items",
  icon: "clipboardList",
  order: 5,
  viewResource: "devicePhysicalCheckItem",
  viewAction: "read",
},
```

It sits **between "Calibration Parameters" (order 4) and the "Reference Equipment"
group (order 6)** — the last leaf directly under Device Management. Adding it bumped
the Reference Equipment group from `order: 5` → `order: 6`.

> The screenshot list ("Categories, Customer Devices, Models, Capabilities,
> Calibration Parameters, Physical Inspection, Reference Equipment") is **accurate**
> for the top level. It just omits the leaves inside the two subgroups (Customer
> Devices → Devices / Name Aliases / Units; Reference Equipment → Equipments /
> Requirements / Units).

> There is **no "Test Points" page** in Device Management. Test points
> (`CalibrationTestPoint`) are setpoint/tolerance detail on a Calibration Parameter;
> per-job readings live in Calibration Management → Calibration Jobs.

---

## 2. Per-item detail

All model blocks are in
[packages/db/prisma/schema.prisma](../../../../packages/db/prisma/schema.prisma).
Everything on the "definition" side is **global master data (no `companyId`)**; only
`Device`, `Equipment`, `EquipmentCalibrationRecord` are company-scoped.

### 0. Categories — `/device-categories`
- **Model:** `DeviceCategory` (schema 1047-1059).
- **Plain language:** the top-level filing buckets for kinds of medical equipment
  (e.g. "Patient Monitoring", "Respiratory"). Pure taxonomy — no measurement logic.
- **Actions:** list / search / create / edit / activate-deactivate. No delete in UI,
  no bulk / import.
- **Dependency:** none — the first thing you create. Every Device Name must point at
  a category.
- **Who:** office / admin catalog setup, once, rarely touched afterward.

### 1.0. Devices — `/devices`
- **Model:** `Device` (schema 1415-1447); FK `deviceTypeId → DeviceType`,
  `customerId → Customer`, `companyId → Company`.
- **Plain language:** an actual physical instrument owned by a specific customer,
  sitting at a specific site — the individual unit that gets calibrated. `code` is
  auto-issued and immutable (`DVC-000001`). Brand / model / serial are free text.
- **Actions:** list / search (brand, model, serial, type, customer) / filter by
  device type, customer, status / sortable / create / edit / view. No delete in UI,
  no bulk / import.
- **Dependency:** **must select an existing Device Name (type) AND an existing
  Customer before saving** (`devices/device-form-fields.tsx`; guards
  `"Device Type wajib dipilih."`, `"Customer wajib dipilih."`).
- **Who:** office staff, ongoing — grows every time a customer sends equipment or a
  request is imported. The only routinely-touched page in this menu.

### 1.1. Name Aliases — `/device-type-aliases`
- **Model:** `DeviceTypeAlias` (schema 1094-1108); FK `deviceTypeId → DeviceType`
  (cascade delete); `normalizedAlias` globally unique.
- **Plain language:** a synonym dictionary mapping the words customers use
  ("Tensimeter", "Blood Pressure Monitor") to the one official Device Name
  ("Sphygmomanometer"). Used when matching rows during Excel / request import.
- **Actions:** list / search / create / edit / activate-deactivate.
- **Dependency:** the target Device Name must already exist.
- **Who:** office staff, occasionally — whenever an import surfaces an unrecognised
  customer term.

### 1.2. Units — `/device-types` (user-facing term: **"Device Name"**)
- **Model:** `DeviceType` (schema 1061-1084); FK `categoryId → DeviceCategory`.
- **Plain language:** a **class** of device the lab is accredited to calibrate — the
  Kemenkes capability list (~35 types), e.g. "Sphygmomanometer", "Infusion Pump",
  "Defibrillator". The **hub of the whole domain**: it owns the calibration worksheet
  (parameters), the physical-inspection checklist, the required reference-equipment
  list, the price list, and the aliases.
- **Actions:** list / search (code, name) / filter by category / sortable / create /
  edit / view / activate-deactivate. `code` system-generated. No delete in UI, no
  bulk / import.
- **Dependency:** **must select an existing Category before saving**
  (`device-type-form-fields.tsx:53-55`; guard `"Kategori wajib dipilih."`).
- **Who:** admin / office, during catalog setup and when the lab adds a newly
  accredited device class. Rare after initial setup.

### 2. Models — `/device-models`
- **Model:** `DeviceModel` (schema 1257-1272); FK `deviceTypeId → DeviceType`;
  unique `(deviceTypeId, manufacturer, model)`.
- **Plain language:** a specific product under a Device Name — e.g. Infusion Pump →
  "B. Braun" / "Infusomat Space". Manufacturer is plain text, not its own entity.
  **Currently reference data only** — `Device` is deliberately not FK'd to it yet.
- **Actions:** list / search / create / edit / activate-deactivate.
- **Dependency:** the parent Device Name must already exist.
- **Who:** office staff, optional / low priority — a lookup aid, not required to run
  calibration.

### 3. Capabilities — `/device-capabilities`
- **Models:** `DeviceCapability` (schema 1280-1293) + `DeviceCapabilityItem`
  (schema 1298-1313; FK `capabilityId → DeviceCapability`, unique
  `(capabilityId, name)`).
- **Plain language:** a **measurable function** of a device (e.g. "NIBP", "ECG",
  "SpO2"), and under it the **sub-facets** that actually get measured (NIBP →
  Systolic / Diastolic / MAP). Shared building blocks reused across many Device Names.
- **Actions:** capability — list / search / create / edit / activate-deactivate.
  Items — added / edited / activated inline on the capability detail page. No delete
  in UI, no bulk, no reorder here (capability order is set per-device-type on the
  Calibration Parameters page).
- **Dependency:** create a Capability first, then add its Items. A Calibration
  Parameter later points at a Capability **Item**, so items must exist before
  parameters can be built.
- **Who:** admin, during initial setup; extended when a new measurement function is
  needed for a new device class.

### 4. Calibration Parameters — `/device-calibration-parameters`
- **Models:** `DeviceCalibrationParameter` (schema 1322-1367; FK
  `deviceTypeId → DeviceType`, `capabilityItemId → DeviceCapabilityItem`,
  `uomId → Uom` optional) + `CalibrationTestPoint` (schema 2000-2029; FK to
  parameter, cascade).
- **Plain language:** the **rows of the calibration worksheet** for one Device Name —
  each row is one thing the technician **measures numerically** against a reference
  standard, with its acceptance tolerance (min / max / note copied verbatim from the
  LK standard), unit, value type, decimal precision, and worksheet input style.
- **Actions:** grouped-by-DeviceType expandable tree (Device Name → Capability →
  parameter rows); search (auto-expands matches); status filter; create (header
  button, or inline "Tambah parameter untuk {name}" with the type pre-filled); edit;
  view; **drag-and-drop reorder** of capabilities and of parameters within a
  capability (`@dnd-kit`, optimistic + rollback). No delete in UI, no bulk. Edit mode
  **locks the whole hierarchy** — read-only breadcrumb `DeviceType › Capability ›
  CapabilityItem` ("Konteks (tidak dapat diubah)").
- **Dependency (strongest in the menu):** create requires, in order —
  **Device Name → Capability → Capability Item → UOM → Name**. The Capability Item
  picker is disabled until a Capability is chosen (`"Pilih capability dulu"`).
- **Who:** admin / calibration engineer, during setup of each new device class and
  when a standard is revised.

### 5. Physical Inspection — `/device-physical-check-items`   *(new)*
- **Model:** `DevicePhysicalCheckItem` (schema 1396-1413); FK
  `deviceTypeId → DeviceType`; fields `code`, `name`, `inspectionLimit`, `sortOrder`,
  `isActive`; `@@unique([deviceTypeId, code])`. Execution-side child
  `PhysicalCheckResult` (schema 2130-2157) is **Tech-PWA only** — verdict
  BAIK / TIDAK_BAIK, not managed in Portal.
- **Plain language:** the **physical / visual condition checklist** for a device
  class — is the casing intact, cables not frayed, buttons and labels OK? Each line
  has a prose **"Batas Pemeriksaan"** (`inspectionLimit`, e.g. "Tidak rusak / penyok
  / retak") and on-site the technician marks it **BAIK / TIDAK_BAIK**.
  **This is NOT a measurement** — no numbers, no tolerance, no reference equipment.
  It is the sibling of Calibration Parameters, not a part of it.
- **Actions:** grouped-by-DeviceType expandable tree (same pattern as Calibration
  Parameters), `GET /device-physical-check-items/grouped`, DeviceType-level
  pagination; search (`"Cari device name atau item pemeriksaan…"`); status filter
  (Semua / Aktif / Nonaktif); create (header button + inline "Tambah item untuk
  {name}" with `?deviceTypeId=`); edit (inline toggle on the `[id]` detail page);
  view; **drag-reorder within one DeviceType** (`@dnd-kit`, optimistic + rollback).
  **No hard-delete in the UI** — backend `DELETE /:id` exists but is blocked
  (`DEVICE_PHYSICAL_CHECK_ITEM_IN_USE`) once results reference it, and no button ever
  calls it; deactivate instead. Edit **locks** Device Name + code
  ("Konteks (tidak dapat diubah)"). A DeviceType with 0 items does not appear in the
  list. No bulk / import.
- **Dependency:** create requires **selecting a Device Name first**
  (`"Device Name wajib dipilih."`), then `name` + `inspectionLimit` (both required;
  `"Item / Parameter wajib diisi."`, `"Batas Pemeriksaan wajib diisi."`). `code` is
  auto (`${deviceType.code}_PHYSICAL_NNN`). **No dependency on Calibration
  Parameters, Capabilities, UOM, or test points** — verified: the page directory and
  the API module contain zero references to any of them.
- **Architectural boundary (confirmed in code):** `DeviceType` has both
  `calibrationParameters DeviceCalibrationParameter[]` and
  `physicalCheckItems DevicePhysicalCheckItem[]` as **direct, independent children**
  (schema 1074-1075). No FK between the two tables. `DeviceCalibrationParameter`
  requires `capabilityItemId`; `DevicePhysicalCheckItem` has no such field.
  `PhysicalCheckResult` is a separate domain from `MeasurementResult` — "no
  replicateIndex, direction, testPoint, or tolerance fields" (schema comment
  2125-2129). Its own RBAC resource `devicePhysicalCheckItem`
  (read/create/update/delete), deliberately **not** reusing
  `calibrationJob:recordPhysicalCheck`.
- **Verification caveat (from `PhysicalInspection_Portal_UI_Implementation-report.md`
  §K/§N):** the browser E2E walkthrough was never run — *"belum selesai (API/Portal
  localhost sempat timeout)… verifikasi manual masih perlu dijalankan."* Unit tests,
  typecheck and Next build were reported passing. Every **structural** claim above is
  independently confirmed against code; the still-unverified items are
  runtime-render checks only (group rendering, category column, reorder persists
  after reload, permission-gated visibility, mobile layout) — none of which affect
  the panel copy.
- **Who:** admin / calibration engineer, during setup of each device class, alongside
  Calibration Parameters. Not touched in day-to-day operations.

### 6.0. Equipments — `/equipment-types`
- **Model:** `EquipmentType` (schema 1120-1134).
- **Plain language:** a **class of reference / standard instrument** the lab uses to
  calibrate customer devices — e.g. "Electrical Safety Analyzer", "Digital Pressure
  Calibrator".
- **Actions:** list / search / create / edit / activate-deactivate.
- **Dependency:** none — independent master. Needed before Requirements and before
  registering physical reference units.
- **Who:** admin, during setup.

### 6.1. Requirements — `/equipment-requirements`
- **Model:** `DeviceTypeEquipmentRequirement` (schema 1228-1251; FK
  `deviceTypeId → DeviceType`, `equipmentTypeId → EquipmentType`, unique pair).
- **Plain language:** the rule "to calibrate **this** Device Name you normally need
  **this** kind of reference equipment" — with display ordering for the worksheet
  ("Daftar Alat yang Digunakan").
- **Actions:** list / create / edit / reorder (per device type).
- **Dependency:** both the Device Name and the Equipment (type) must already exist.
- **Who:** admin, during setup of each device class.

### 6.2. Units — `/equipment-units`
- **Model:** `Equipment` (schema 1145-1169; FK `companyId → Company`,
  `equipmentTypeId → EquipmentType`); calibration validity comes from
  `EquipmentCalibrationRecord` (schema 1190-1220).
- **Plain language:** the lab's **actual owned reference units** — e.g. "ESA-001", a
  Fluke ESA620, serial 12345 — the physical tools a technician brings on-site.
- **Actions:** list / search / filter / create / edit / activate-deactivate; manage
  calibration records (date, valid-until, certificate number).
- **Dependency:** the Equipment type must already exist; company-scoped.
- **Who:** admin / lab manager, ongoing — kept current as instruments are
  re-calibrated or retired.

---

## 3. Relationships & onboarding order

```
DeviceCategory ──< DeviceType ──< DeviceModel
                       │           DeviceTypeAlias
                       │
                       ├──< DeviceCalibrationParameter ──< CalibrationTestPoint ──< MeasurementResult
                       │        ^          ^
                       │        │          └── DeviceCapabilityItem ──> DeviceCapability
                       │        └── Uom (optional)
                       │
                       ├──< DevicePhysicalCheckItem ──< PhysicalCheckResult   (Tech-PWA execution)
                       │
                       ├──< DeviceTypeCapabilityOrder ──> DeviceCapability
                       └──< DeviceTypeEquipmentRequirement ──> EquipmentType ──< Equipment ──< EquipmentCalibrationRecord

Device (customer's physical unit) ──> DeviceType   [+ Customer, + Company]
```

**Calibration Parameters and Physical Inspection are siblings** — two independent
checklists hanging off the same Device Name. Physical Inspection does **not** require
Calibration Parameters, Capabilities, UOM, or test points to be set up first; you
only need the Device Name to exist.

**Which page feeds which:** `Categories` feeds the category picker on `Units (Device
Name)`. `Units` + `Capabilities`/items + `UOM` feed `Calibration Parameters`.
`Units` alone feeds `Physical Inspection`. `Units` + `Equipments` feed `Requirements`.
`Equipments` feeds `Reference Equipment › Units`. `Units (Device Name)` feeds `Name
Aliases`, `Models`, and the device-type picker on `Devices`.

**Natural setup sequence for onboarding a new device class:**

1. **Categories** — create the bucket.
2. **Units (Device Name)** — create the device class under that category.
3. **Capabilities** — create the function(s) it measures, then their **Items**.
   Reusable — skip if they already exist.
4. **Calibration Parameters** — build the numeric worksheet rows (needs Device Name +
   Capability Item + UOM); set tolerances / test points; drag into order.
   **— in parallel —**
   **Physical Inspection** — build the physical condition checklist (needs only the
   Device Name); each line has a "Batas Pemeriksaan"; drag into order.
5. **Equipments** → **Requirements** — declare which reference-equipment classes are
   needed to calibrate this device class.
6. **Reference Equipment › Units** — ensure the physical reference instruments are
   registered and in-calibration.
7. **Name Aliases** — add customer synonyms so imports match.
8. **Models** — optional catalogue of known manufacturer / model entries.

Only after the catalog is in place does day-to-day work begin: **Devices** (customer
units) are added continuously, then Calibration Requests / Jobs consume the catalog.

---

## 4. Existing help content found

- **No i18n framework** in Portal — all copy is inline literal strings.
- **No tooltip component, no info panel, no onboarding / tour** anywhere in these
  pages — Physical Inspection included (only inline `<p class="text-xs text-slate-500">`
  hints and empty-state text). Nothing to reconcile or supersede — this panel would
  be the first of its kind.
- **No toast library** — feedback is inline `<p>` (red = error, emerald = success).
- Inline helper text that already exists (match this tone; don't duplicate it):
  - `"Kode dibuat otomatis oleh sistem saat disimpan."` / `"Kode otomatis — tidak dapat diubah."`
  - `"Konteks (tidak dapat diubah)"` (locked context bar in Calibration Parameters
    **and** Physical Inspection edit)
  - Calibration Parameters tolerance helper:
    `"Isi keduanya untuk rentang (25 ± 6°C → 19–31). Hanya max untuk batas atas (≤500 µA)."`
  - `"Jumlah digit di belakang koma untuk hasil pengukuran parameter ini (0–10)."`
  - **Physical Inspection:** `"Teks batas pemeriksaan fisik sesuai master LK (wajib diisi)."`
  - `"Unik dalam capability ini"` (capability item name hint)
  - Empty states: `"Belum ada Calibration Parameter."`, `"Belum ada Physical Inspection item."`
  - Longer descriptive-sentence pattern elsewhere in Portal (Work Orders):
    `"Setelah ditandai selesai, Work Order terkunci. Tidak ada edit, assignment, cancel, atau pembalikan status."`
- **Tone conventions:** formal but terse, sentence-case, **no "Anda"** in
  labels / hints; imperative verbs (`Cari…`, `Pilih…`, `Masukkan…`); noun-phrase
  errors ending with a period. English domain nouns kept verbatim ("Device",
  "Customer", "Capability", "Calibration Parameter", "UOM", "Physical Inspection").
  Status is always **"Aktif" / "Nonaktif"**. User-facing term for `DeviceType` is
  **"Device Name"**; "Device" = the customer's physical unit; **"Perangkat" is not
  used**.

---

## 5. Draft panel copy (Bahasa Indonesia) — all 7 leaf items

> ### Tentang Device Management
>
> Bagian ini berisi **data master katalog**: jenis alat yang lab terakreditasi
> mengkalibrasinya, fungsi ukur beserta parameter kalibrasinya, checklist kondisi
> fisik, dan alat standar (referensi) milik lab. Data ini disiapkan admin di awal —
> sebelum ada Calibration Request atau Job — lalu jarang diubah.
>
> **Isi tiap menu**
>
> - **Categories** — kelompok besar jenis alat medis (misal Patient Monitoring,
>   Respiratory). Hanya pengelompokan.
> - **Customer Devices › Devices** — unit alat fisik milik customer yang dikalibrasi.
>   Kode dibuat otomatis. Bertambah terus seiring alat masuk.
> - **Customer Devices › Name Aliases** — daftar sinonim: menghubungkan istilah
>   customer ("Tensimeter") ke satu Device Name resmi ("Sphygmomanometer") agar cocok
>   saat import.
> - **Customer Devices › Units** — **Device Name**: kelas/jenis alat yang lab
>   terakreditasi mengkalibrasinya. Ini pusat katalog — worksheet kalibrasi,
>   checklist fisik, dan daftar alat standar menempel di sini.
> - **Models** — merek/model spesifik di bawah sebuah Device Name. Sebagai referensi;
>   opsional.
> - **Capabilities** — fungsi ukur alat (misal NIBP, ECG, SpO2) beserta item
>   turunannya (NIBP → Systolic, Diastolic, MAP). Dipakai ulang lintas Device Name.
> - **Calibration Parameters** — baris worksheet **pengukuran nilai** untuk tiap
>   Device Name: yang diukur teknisi terhadap alat standar, satuan, toleransi
>   penerimaan (sesuai LK), dan urutannya.
> - **Physical Inspection** — checklist **kondisi fisik** alat untuk tiap Device Name
>   (casing, kabel, tombol, label). Tiap baris punya "Batas Pemeriksaan"; di lapangan
>   dinilai BAIK / TIDAK BAIK. Bukan pengukuran angka — terpisah dari Calibration
>   Parameters.
> - **Reference Equipment › Equipments** — jenis alat standar/referensi milik lab
>   (misal Electrical Safety Analyzer, Pressure Calibrator).
> - **Reference Equipment › Requirements** — aturan: alat standar apa yang diperlukan
>   untuk mengkalibrasi sebuah Device Name.
> - **Reference Equipment › Units** — unit alat standar fisik milik lab beserta data
>   kalibrasinya (berlaku sampai kapan, nomor sertifikat).
>
> **Urutan penyiapan untuk jenis alat baru**
>
> Categories → Units (Device Name) → Capabilities beserta itemnya → **Calibration
> Parameters** dan **Physical Inspection** (keduanya cukup butuh Device Name; berdiri
> sendiri) → Equipments lalu Requirements → daftarkan unit alat standar di Reference
> Equipment › Units → Name Aliases dan Models (opsional). Setelah katalog siap,
> **Devices** (unit customer) diisi berjalan.

---

## 6. Decisions & open items

**Confirmed with reviewer (rev 1):**
1. **Scope:** panel covers **all leaf items** (now 7) + the full setup sequence.
2. **Naming:** use current terms **as-is** — panel says "Device Name" to match page
   copy. The `Devices` / `Units` label vs. `viewResource` mismatch is a **separate
   cleanup item**, not a blocker.

**Still recommended before copy is frozen:**
3. Confirm the live menu labels / order against `/management/menu-management` in case
   the seed is stale.
4. Run the Physical Inspection browser walkthrough (report §N) — structural claims
   are code-confirmed, but the runtime-render checklist was never executed.

---

## Verification

This stage produces only this Markdown report — no code. Verify by:
- Confirming the sub-menu list against the running Portal sidebar and
  `/management/menu-management` (7 leaves, Physical Inspection between Calibration
  Parameters and Reference Equipment).
- Spot-checking each page's create form for the stated required-field dependencies —
  in particular that Physical Inspection's create form only asks for Device Name +
  name + Batas Pemeriksaan (no capability / UOM / tolerance).
- Reviewer sign-off on the draft copy (section 5) before Stage 2 (panel component)
  begins.
