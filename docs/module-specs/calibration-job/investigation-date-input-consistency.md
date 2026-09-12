# Investigation: Date Input Consistency Across Portal

> Mode: **READ-ONLY audit**. Tidak ada perubahan kode. Tanggal audit: 2026-09-06.
> Scope: `apps/portal` (Portal / management UI). App lain (`tech-pwa` "MyJobs", `web`, `api`,
> `web-api`) dicek untuk native date input dan **tidak ditemukan** — lihat catatan di bawah.

## Ringkasan

Ditemukan **8 lokasi date input** di Portal (di 6 modul), plus ±5 gaya formatter
tampilan tanggal yang berbeda-beda. **Tidak ada komponen date-picker reusable** di
`apps/portal/src/components/ui/` — yang ada hanya primitive `calendar.tsx`
(wrapper `react-day-picker`) dan `popover.tsx`. Setiap modul menyusun sendiri pola
Popover + Button + Calendar, dan dua modul bahkan meng-**copy** wrapper `DateField`
lokal dengan komentar "Portal's standard date picker" — duplikat, bukan di-import.

Hasil pengelompokan:

- **✅ 2 lokasi** sudah sesuai kontrak tampilan (`DD/MM/YYYY`) + state/payload `YYYY-MM-DD` string
  (Calibration Records di Equipment Unit, dan Price List Items).
- **⚠️ 6 lokasi** tidak konsisten: 3 pakai native `<input type="date">` / `type="datetime-local">`
  (browser-locale, mis. `mm/dd/yyyy`), dan 3 pakai Popover+Calendar tapi menampilkan format
  panjang ter-lokalisasi (`PPP` → "6 September 2026") serta menyimpan **`Date` object** di
  state/payload (bukan `YYYY-MM-DD` string).
- **Catatan penting:** **tidak satu pun** date picker Portal mengizinkan user mengetik tanggal
  manual via keyboard. Semua (termasuk yang ✅) adalah tombol → popup kalender, klik-only.
  Yang bisa diketik justru hanya native input (`import` & `work-orders`), tapi formatnya
  browser-dependent. Jadi kriteria "bisa diketik manual" saat ini **tidak dipenuhi di mana pun**.

---

## Komponen Date-Picker "Standar"

**Tidak ada komponen date-picker bersama.** Yang tersedia:

| File | Peran |
|---|---|
| `apps/portal/src/components/ui/calendar.tsx` | Primitive — wrapper `react-day-picker` `DayPicker`. Tidak menangani format tampil / parsing string. |
| `apps/portal/src/components/ui/popover.tsx` | Primitive Popover. |
| `apps/portal/src/app/management/equipment-units/equipment-calibration-record-date-utils.ts` | Util tanggal (`parseDateOnly`, `fmtDateOnly` → `dd/MM/yyyy`, `toDateOnlyString`, `toDateInputValue`, `fmtTimestampDay`). **Ada unit test** (`equipment-calibration-record-date-utils.test.ts`). Ini de-facto acuan kontrak, tapi lokasinya di folder modul, bukan `lib/` bersama. |

### Wrapper `DateField` (di-duplikasi, bukan di-share)

Dua file mendefinisikan `function DateField(...)` yang hampir identik — Popover + `Button`
(variant outline) + `Calendar mode="single"` + `captionLayout="dropdown"`, menampilkan
`format(selected, "dd/MM/yyyy")`, meng-emit `YYYY-MM-DD` string:

- `apps/portal/src/app/management/equipment-units/equipment-calibration-records-panel.tsx` (baris ~132–200)
- `apps/portal/src/app/management/price-list-items/price-list-items-page-client.tsx` (baris ~62–128)

Komentar di kedua file menyebut "same composition as the Purchase Order / Quotation forms" —
**klaim ini tidak akurat**: PO & Quotation menampilkan `PPP` (format panjang), bukan `dd/MM/yyyy`,
dan menyimpan `Date` object.

### Modul yang SUDAH pakai pola dd/MM/yyyy + string state

- Equipment Unit → Calibration Records panel ✅
- Price List Items ✅

### Modul yang BELUM (native input atau Popover+Calendar dgn format/PPP + Date object)

- Requisition (Calibration Requests) — new, edit, import
- Purchase Order — form
- Quotation — form
- Work Order — Scheduled Start / End (datetime)

---

## Temuan per Modul

### Requisition (Calibration Requests)

**a. `apps/portal/src/app/management/calibration-requests/new/page.tsx`**
- Field/label: **"Expected Date"** (baris 227–228).
- Komponen: inline Popover + `Button` + `Calendar` (baris 230–262). Bukan `DateField` wrapper.
- Ketik manual: **Tidak** (trigger `Button`, klik kalender saja).
- Format tampil: `format(desiredDate, "PPP", { locale: localeId })` → **"6 September 2026"**
  (baris 242) — **bukan** `DD/MM/YYYY`.
- State: `useState<Date | undefined>` (baris 66). Payload: `expectedDate: desiredDate` — **`Date` object**, bukan `YYYY-MM-DD` string (baris 138).
- Extra: `disabled` tanggal lampau (baris 255), `startMonth`/`endMonth` 2020–2030.

**b. `apps/portal/src/app/management/calibration-requests/[id]/edit/page.tsx`**
- Field/label: **"Desired Schedule"** (baris 393) — **label berbeda** dari `new` ("Expected Date") dan dari detail view ("Expected Date").
- Komponen: inline Popover + `Button` + `Calendar` (baris 395–424).
- Ketik manual: **Tidak**.
- Format tampil: `format(desiredDate, "PPP", { locale: localeId })` → "6 September 2026" (baris 406).
- State: `Date | undefined`; load via `parseExpectedDate` → `parseISO()` (baris 81–88, 145).
  Payload: `expectedDate: desiredDate ?? null` — **`Date` object / null** (baris 256).
- Tidak ada `disabled` tanggal lampau (beda dari `new`).

**c. `apps/portal/src/app/management/calibration-requests/[id]/page.tsx` (detail / view-only)**
- Field/label: **"Expected Date"** (baris 187).
- Tampilan: `new Date(request.expectedDate).toLocaleDateString("id-ID", { weekday:"long", year:"numeric", month:"long", day:"numeric" })` → **"Sabtu, 6 September 2026"** (baris 186–194). Bukan input; display saja; format ≠ `DD/MM/YYYY`.

**d. `apps/portal/src/app/management/calibration-requests/import/import-page-client.tsx` (Import Excel)**  — **lokasi bug yang dilaporkan**
- Field/label: **"Expected Date"** (baris 229–230).
- Komponen: **native `<Input type="date">`** (baris 232–236). Tidak ada Popover/Calendar.
- Ketik manual: **Ya**, tapi via native input (segmented, urutan tergantung locale browser).
- Format tampil: **browser-locale** — placeholder `mm/dd/yyyy` dan native picker pada browser `en-US`; `dd/mm/yyyy` pada locale lain. Tidak deterministik.
- State: `useState("")` string `YYYY-MM-DD` (native `type="date"` value) (baris 52).
- Payload: `expectedDate: new Date(expectedDate)` — string di-`new Date()`-kan (UTC midnight) (baris 153).

### Quotation

**`apps/portal/src/app/management/quotations/quotation-form-fields.tsx`**
- Field/label: **"Valid Until"** (baris 86).
- Komponen: inline Popover + `Button` + `Calendar` (baris 87–135), plus tombol "clear" (baris 118–128).
- Ketik manual: **Tidak**.
- Format tampil: `format(value.validUntil, "PPP", { locale: localeId })` → "6 September 2026" (baris 100) — **bukan** `DD/MM/YYYY`.
- State/payload: `validUntil: Date | undefined` (baris 26); dikirim `form.validUntil` (`Date`) di `new/page.tsx:199`, `form.validUntil ?? null` di `[id]/edit/page.tsx:178`. **`Date` object**, bukan string.
- Load edit: `parseValidUntil(quotation.validUntil)` (`[id]/edit/page.tsx:63`).
- Display list/detail: `formatDate()` dari `quotations-ui.tsx` → **"6 Sep 2026"** (`quotations-ui.tsx:300`, `[id]/page.tsx:240`).

### PO (Purchase Order)

**`apps/portal/src/app/management/purchase-orders/purchase-order-form-fields.tsx`**
- Field/label: **"Customer PO Date"** (baris 45).
- Komponen: inline Popover + `Button` + `Calendar` (baris 46–78).
- Ketik manual: **Tidak**.
- Format tampil: `format(value.customerPoDate, "PPP", { locale: localeId })` → "6 September 2026" (baris 59) — **bukan** `DD/MM/YYYY`.
- State/payload: `customerPoDate: Date` (`purchase-order-form-utils.ts:67,80` — required, `Date` object).
- Display list: `formatDate(row.customerPoDate)` (di-import dari `quotations-ui.tsx`) → **"6 Sep 2026"** (`purchase-orders-ui.tsx:268`).

### WorkOrder

**`apps/portal/src/app/management/work-orders/work-order-form-fields.tsx`**
- Field/label: **"Scheduled Start"** & **"Scheduled End"** (baris 88, 97) — **datetime**, bukan date-only.
- Komponen: **native `<Input type="datetime-local">`** ×2 (baris 89–94, 98–103). Tidak ada Popover/Calendar.
- Ketik manual: **Ya**, via native input; format & urutan segmen tergantung locale browser.
- Format tampil: browser-locale datetime.
- State: string `YYYY-MM-DDTHH:mm` via `toDatetimeLocalValue()` (`work-order-form-utils.ts:91–97`).
  Payload: `fromDatetimeLocalValue()` → **`Date` object** (`work-order-form-utils.ts:99–104, 121–122, 140–141`).
- Display list: `formatDateTime(row.scheduledStart)` dari `quotations-ui.tsx` → "6 Sep 2026, 14.30" (`work-orders-ui.tsx:344`).

### DLN / Surat Jalan (Delivery Note)

**`apps/portal/src/app/management/work-orders/work-order-delivery-note-section.tsx`**
- Field: `issuedAt` (baris 98) — **display-only**, `formatDateTime(deliveryNote.issuedAt)` (dari `quotations-ui.tsx`).
- **Tidak ada date input** di alur Surat Jalan. `issuedAt` di-set server-side saat generate; `purchase-orders-ui.tsx:145` juga memakai `purchaseOrder.createdAt` sebagai `issuedAt`.

### Calibration Records (Equipment Unit)  — ✅ acuan (Stage 2)

**`apps/portal/src/app/management/equipment-units/equipment-calibration-records-panel.tsx`**
- Field/label: **"Tanggal kalibrasi *"**, **"Berlaku dari"**, **"Berlaku s/d *"** (baris 217, 227, 238).
- Komponen: `DateField` lokal — Popover + `Button` + `Calendar`, komentar "Portal standard date picker … Displays dd/MM/yyyy; value stays YYYY-MM-DD" (baris 128–200). `allowClear` untuk field opsional.
- Ketik manual: **Tidak** (klik kalender saja).
- Format tampil: `format(selected, "dd/MM/yyyy")` → **"06/09/2026"** ✅ (baris 164). List: `fmtDateOnly()` → `dd/MM/yyyy` (baris 655, 658).
- State: string `YYYY-MM-DD` (`toDateInputValue()` saat load, baris 112–114). Payload: `f.calibrationDate` dll — **string `YYYY-MM-DD`** ✅ (baris 291–307).
- Validasi window: `isCalibrationValidityWindowOk()` (baris 442, 581).
- Util + test terpisah: `equipment-calibration-record-date-utils.ts` (+ `.test.ts`).

### Price List Items  — ✅ (tapi kode duplikat)

**`apps/portal/src/app/management/price-list-items/price-list-items-page-client.tsx`**
- Field/label: **"Berlaku dari"**, **"Berlaku sampai (opsional)"** (baris 373, 382–383); plus **filter range** "Mulai" / "Tanpa batas" (baris 514–524).
- Komponen: `DateField` lokal (baris 62–128) — copy dari pola Equipment. `allowClear`.
- Ketik manual: **Tidak**.
- Format tampil: `format(selected, "dd/MM/yyyy")` ✅ (baris 92); list `fmtDate()` → `dd/MM/yyyy` (baris 52–55).
- State: string `YYYY-MM-DD`; `toDateOnlyString()` (baris 57–60). Payload: `YYYY-MM-DD` string ✅.
- Util `parseDateOnly` / `fmtDate` / `toDateOnlyString` **di-copy lokal** (baris 44–60) — duplikat dari `equipment-calibration-record-date-utils.ts`.

### Modul lain (dicek, tidak ada date input)

- **Leads**: hanya ikon `Calendar` dari lucide (`leads-ui.tsx:7,1077`); `leads/[id]/page.tsx:275` display `toLocaleDateString("id-ID")` → "6/9/2026" (tanpa padding). Tidak ada input.
- **Calibration Jobs, Customers, Devices, Device Calibration Parameters, Tax, Users, Whitelist, Email, Equipment Requirements**: tidak ada `type="date"` maupun komponen `Calendar`. `device-calibration-parameters-ui.tsx:80` adalah `Intl.NumberFormat` (angka, bukan tanggal).
- **Repo-wide** (`apps/`): `type="date"` hanya 1 hit (import requisition); `type="datetime-local"` hanya 2 hit (work-order form). `tech-pwa`, `web`, `web-api`, `api`: nihil.

---

## Ringkasan Tabel

| # | File | Field | Komponen | Ketik manual | Format tampil | State/Payload | Status |
|---|---|---|---|---|---|---|---|
| 1 | equipment-units/equipment-calibration-records-panel.tsx | Tgl kalibrasi, Berlaku dari, Berlaku s/d | `DateField` (Popover+Calendar) | ❌ | `dd/MM/yyyy` | `YYYY-MM-DD` string | ✅ |
| 2 | price-list-items/price-list-items-page-client.tsx | Berlaku dari/sampai + filter range | `DateField` (copy) | ❌ | `dd/MM/yyyy` | `YYYY-MM-DD` string | ✅ (kode duplikat) |
| 3 | calibration-requests/new/page.tsx | Expected Date | Popover+Calendar inline | ❌ | `PPP` "6 September 2026" | `Date` object | ⚠️ |
| 4 | calibration-requests/[id]/edit/page.tsx | Desired Schedule *(label beda)* | Popover+Calendar inline | ❌ | `PPP` | `Date` / null | ⚠️ |
| 5 | purchase-orders/purchase-order-form-fields.tsx | Customer PO Date | Popover+Calendar inline | ❌ | `PPP` | `Date` object | ⚠️ |
| 6 | quotations/quotation-form-fields.tsx | Valid Until | Popover+Calendar inline (+clear) | ❌ | `PPP` | `Date` object | ⚠️ |
| 7 | calibration-requests/import/import-page-client.tsx | Expected Date | **native `<Input type="date">`** | ✅ (native) | **browser-locale** `mm/dd/yyyy` | `YYYY-MM-DD` string → `new Date()` | ⚠️⚠️ (bug dilaporkan) |
| 8 | work-orders/work-order-form-fields.tsx | Scheduled Start / End | **native `<Input type="datetime-local">`** | ✅ (native) | **browser-locale** datetime | `YYYY-MM-DDTHH:mm` → `Date` | ⚠️ (datetime, di luar kontrak `@db.Date`) |

### Formatter tampilan (display-only) yang berbeda-beda

| Helper / lokasi | Output | Dipakai |
|---|---|---|
| `equipment-calibration-record-date-utils.ts` `fmtDateOnly` | `06/09/2026` ✅ | Equipment calibration records |
| `price-list-items` `fmtDate` (lokal, copy) | `06/09/2026` ✅ | Price list |
| `quotations-ui.ts` `formatDate` | `6 Sep 2026` | Quotation list/detail, PO list, WorkOrder (via import) |
| `quotations-ui.ts` `formatDateTime` | `6 Sep 2026, 14.30` | WorkOrder list, Delivery Note |
| `calibration-requests/[id]/page.tsx` (inline) | `Sabtu, 6 September 2026` | Requisition detail |
| `calibration-requests/new` & `edit` (inline `PPP`) | `6 September 2026` | Requisition form trigger |
| `leads/[id]/page.tsx` (inline) | `6/9/2026` (tanpa padding) | Leads chat |

---

## Pengelompokan

### ✅ Sudah konsisten (pola Popover+Calendar, `DD/MM/YYYY`, state/payload `YYYY-MM-DD` string)

- `equipment-units/equipment-calibration-records-panel.tsx` — acuan Stage 2 (punya util + test).
- `price-list-items/price-list-items-page-client.tsx` — sesuai output, tapi meng-copy `DateField` + util (belum di-share).

> Catatan: keduanya **tidak** mengizinkan ketik manual keyboard. Jika "bisa diketik manual"
> adalah syarat wajib kontrak, maka **belum ada** lokasi yang 100% konsisten dan ini gap
> lintas-portal, bukan per-modul.

### ⚠️ Tidak konsisten

1. **`calibration-requests/import/import-page-client.tsx`** — native `<input type="date">`,
   format browser (`mm/dd/yyyy` di `en-US`), tanpa Popover+Calendar. **(bug yang dilaporkan)**
2. **`work-orders/work-order-form-fields.tsx`** — native `<input type="datetime-local">` ×2,
   format browser. (Datetime — perlu keputusan apakah masuk kontrak.)
3. **`calibration-requests/new/page.tsx`** — Popover+Calendar tapi tampil `PPP` ("6 September 2026"),
   state & payload `Date` object (bukan `YYYY-MM-DD` string).
4. **`calibration-requests/[id]/edit/page.tsx`** — sama seperti #3, plus **label "Desired Schedule"**
   tidak sinkron dengan "Expected Date" di layar lain.
5. **`purchase-orders/purchase-order-form-fields.tsx`** — Popover+Calendar tapi tampil `PPP`,
   payload `Date` object.
6. **`quotations/quotation-form-fields.tsx`** — Popover+Calendar tapi tampil `PPP`,
   payload `Date` object.

### ❓ Perlu klarifikasi

- **Datetime fields** (`work-orders` Scheduled Start/End, dan semua timestamp `acceptedAt` /
  `issuedAt` / `createdAt`): kontrak yang di-lock hanya menyebut `@db.Date`. Perlu sub-kontrak
  untuk field bertipe timestamp (format tampil + komponen input).
- **Ketik manual keyboard**: `react-day-picker` sendiri tidak menyediakan input teks. Apakah
  target kontrak = tombol+kalender saja (seperti sekarang di semua modul), atau harus ada
  text field `dd/mm/yyyy` yang bisa diketik + di-parse? Ini menentukan besar/kecil refactor.
- **Format display timestamp**: saat ini `6 Sep 2026` (quotations-ui) vs `dd/MM/yyyy` (equipment).
  Perlu satu keputusan untuk tanggal-only vs tanggal+jam.
- **`new` vs `edit` requisition**: `new` men-disable tanggal lampau, `edit` tidak. Sengaja?

---

## Rekomendasi Perbaikan (belum diimplementasi)

Diurutkan berdasarkan risiko/impact:

1. **[HIGH] Buat satu komponen bersama `apps/portal/src/components/ui/date-picker.tsx`**
   (`DateField`). Ekstrak dari versi `equipment-calibration-records-panel.tsx`: API `value:
   string (YYYY-MM-DD)` + `onChange(next: string)`, tampil `dd/MM/yyyy`, opsi `allowClear`,
   `disabled`, `minDate`. Pindahkan `equipment-calibration-record-date-utils.ts` ke
   `apps/portal/src/lib/date.ts` (bawa test-nya). Ini prasyarat semua item di bawah.

2. **[HIGH] `calibration-requests/import/import-page-client.tsx`** — ganti native
   `<Input type="date">` (baris 232–236) dengan `<DateField>` bersama. Ini keluhan asli;
   user melihat `mm/dd/yyyy`. Sesuaikan payload agar konsisten (`YYYY-MM-DD` string, hindari
   `new Date(str)` UTC-shift di baris 153).

3. **[HIGH] `calibration-requests/new` + `[id]/edit`** — ganti Popover+`PPP` inline dengan
   `<DateField>` bersama; ubah state dari `Date` → string `YYYY-MM-DD`; kirim payload
   `YYYY-MM-DD` string. Samakan **label** menjadi satu istilah kanonik ("Expected Date"
   direkomendasikan, cocokkan dgn detail view). Alur requisition inti + `Date` object berisiko
   off-by-one TZ.

4. **[MEDIUM] `purchase-orders/purchase-order-form-fields.tsx`** & **`quotations/quotation-form-fields.tsx`**
   — ganti `PPP` → `<DateField>` bersama (`dd/MM/yyyy`); ubah `customerPoDate` / `validUntil`
   dari `Date` → `YYYY-MM-DD` string di form-utils & payload builder.

5. **[MEDIUM] `work-orders/work-order-form-fields.tsx`** — putuskan strategi datetime dulu
   (klarifikasi di atas). Minimal: dokumentasikan bahwa ini datetime di luar kontrak `@db.Date`.
   Ideal: komponen datetime picker konsisten (date `dd/MM/yyyy` + time terpisah).

6. **[LOW–MEDIUM] Konsolidasi formatter tampilan** — satukan `formatDate` (quotations-ui),
   `fmtDate` (price-list), inline `toLocaleDateString` (requisition detail, leads) ke helper
   bersama: `fmtDateOnly()` → `dd/MM/yyyy` untuk field `@db.Date`; `fmtDateTime()` → format
   tunggal yang disepakati untuk timestamp. Hapus duplikat util di `price-list-items`.

7. **[LOW] Tambahkan input keyboard `dd/mm/yyyy`** ke `<DateField>` bersama (text input +
   parser + kalender), jika kontrak memang mensyaratkan "bisa diketik manual". Berdampak ke
   semua modul sekaligus setelah #1.

---

## Konfirmasi

**Tidak ada perubahan kode yang dilakukan.** Ini murni audit read-only. Satu-satunya file
yang ditulis adalah laporan ini
(`docs/claude/plans/Calibration-management/investigation-date-input-consistency.md`).
