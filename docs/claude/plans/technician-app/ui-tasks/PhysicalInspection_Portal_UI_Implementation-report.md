# Physical Inspection — Portal UI Implementation Report

**Tanggal:** 2026-09-10  
**Mode:** IMPLEMENTATION (Portal UI only)  
**Pattern audit:** [PhysicalInspection_Portal_CalibrationParameters_Pattern_Audit.md](./PhysicalInspection_Portal_CalibrationParameters_Pattern_Audit.md)  
**Backend (locked):** [PhysicalInspection_Portal_Master_Backend_Implementation-report.md](./PhysicalInspection_Portal_Master_Backend_Implementation-report.md)  
**Scope:** Portal master UI untuk Physical Inspection (`DevicePhysicalCheckItem`). Backend, Prisma, Tech-PWA, seed, dan kontrak API **tidak diubah**.

---

## 1. STATUS

**PASS WITH NOTES**

Portal UI Physical Inspection Master sudah diimplementasikan sebagai sibling Calibration Parameters:

- Route `/device-physical-check-items` (+ `/new`, `/[id]`)
- List grouped by DeviceType via `GET .../grouped`
- Search, filter Aktif/Nonaktif, pagination DeviceType-level, expand/collapse
- Create / Edit / Deactivate–Reactivate
- Drag-and-drop reorder dalam satu DeviceType
- RBAC via `/me` flags `devicePhysicalCheckItem*`
- Unit tests / typecheck / build PASS
- Tidak ada perubahan backend / Prisma / Tech-PWA / seed

**Catatan utama:**
1. `inspectionLimit` **wajib** di form (schema Zod backend `min(1)` locked); spek UI sempat menyebut optional.
2. Status tidak di form create — default backend `true`; Status hanya di edit (pola Calibration Parameters).
3. Hard delete tidak diekspos di UI — prioritas deactivate (sama seperti Calibration Parameters).
4. DeviceType dengan 0 item (mis. ELECTRIC_BEDS, PATIENT_MONITOR) **tidak muncul** di grouped list — perilaku API locked.
5. Verifikasi browser E2E **belum ditandai selesai** di sesi implementasi (server sempat down; `pnpm dev` kemudian aktif). Checklist manual di bagian N.

---

## A. Files created / changed

### Created

| File | Peran |
|---|---|
| `apps/portal/src/app/management/device-physical-check-items/page.tsx` | Server wrapper + Suspense |
| `apps/portal/src/app/management/device-physical-check-items/device-physical-check-items-page-client.tsx` | List: search, filter, pagination, expand, reorder |
| `apps/portal/src/app/management/device-physical-check-items/device-physical-check-items-ui.tsx` | Types, SearchBar, table DnD, EmptyState, StatusBadge |
| `apps/portal/src/app/management/device-physical-check-items/device-physical-check-item-form-fields.tsx` | Form UI create/edit |
| `apps/portal/src/app/management/device-physical-check-items/device-physical-check-item-form-utils.ts` | Validasi, payload builders, API error mapping |
| `apps/portal/src/app/management/device-physical-check-items/device-physical-check-item-ordering.ts` | Helper `reorderIds` / `sameOrder` |
| `apps/portal/src/app/management/device-physical-check-items/use-device-physical-check-items-query.ts` | React Query hooks + `apiFetch` |
| `apps/portal/src/app/management/device-physical-check-items/new/page.tsx` | Halaman create |
| `apps/portal/src/app/management/device-physical-check-items/[id]/page.tsx` | Detail + inline edit |
| `apps/portal/src/app/management/device-physical-check-items/device-physical-check-item-ordering.test.ts` | Unit test reorder |
| `apps/portal/src/app/management/device-physical-check-items/device-physical-check-item-form-utils.test.ts` | Unit test form/payload/error |
| `docs/claude/plans/technician-app/ui-tasks/PhysicalInspection_Portal_UI_Implementation-report.md` | Laporan ini |

### Changed

| File | Change |
|---|---|
| `apps/portal/src/app/management/permission-management/page.tsx` | Label `devicePhysicalCheckItem: "Physical Inspection"` |

### Not changed

- Prisma schema / migrations  
- API module `device-physical-check-items`  
- Shared Zod schemas (konsumsi saja)  
- Auth RBAC / `/me` / menu seed (sudah ada dari backend task)  
- Tech-PWA Physical Check execution UI  
- `seed-physical-check-items.ts`  
- Calibration Parameters Portal UI (hanya dibaca sebagai pola)

---

## B. Route implemented

| Browser path | File system (via host rewrite → `/management/...`) |
|---|---|
| `/device-physical-check-items` | `.../device-physical-check-items/page.tsx` |
| `/device-physical-check-items/new` | `.../new/page.tsx` |
| `/device-physical-check-items/[id]` | `.../[id]/page.tsx` |

**Page title:** Physical Inspection  

**Menu (sudah di-seed backend):**  
Device Management → Physical Inspection (`href: /device-physical-check-items`)

---

## C. UI pattern reused from Calibration Parameters

Primary mirror: `apps/portal/src/app/management/device-calibration-parameters/`.

| Aspek | Reuse |
|---|---|
| Layout | `PageHeader` + `Surface` + `PaginationBar` |
| Search / filter | Debounce 400ms + `isActive` via `useUrlQueryState` |
| Grouping | DeviceType parent row + kategori + count |
| Expand/collapse | React state + `?expanded=` via `history.replaceState` |
| Search UX | Auto-expand semua group di halaman saat search aktif |
| Forms | Full page create + detail dengan toggle Edit (bukan dialog) |
| Device Type picker | Combobox (`CommandPopover`) — tidak create DeviceType dari form |
| Code | Read-only “Otomatis” / locked di edit |
| Reorder | `@dnd-kit` + grip handle jika Update |
| Cache | Optimistic rewrite grouped query + rollback + invalidate |
| Permissions | `useAuthz().capabilities` + `AccessDenied` |
| Status | Badge Aktif/Nonaktif; filter Semua/Aktif/Nonaktif |
| Empty / loading / error | Pola teks yang sama |

**Perbedaan domain yang disengaja (lebih sederhana):**

```
DeviceType
  └── DevicePhysicalCheckItem[]   ← flat, sibling Calibration Parameters
```

Tidak ada Capability / Capability Item / UOM / tolerance / decimal places / test points / replicate / direction / MeasurementResult / PASS-FAIL.

Kolom child: Item/Parameter · Batas Pemeriksaan · Status · Edit.

---

## D. API endpoints consumed

| Method | Endpoint | Digunakan untuk |
|---|---|---|
| `GET` | `/device-physical-check-items/grouped` | List utama (search, isActive, page, pageSize) |
| `GET` | `/device-physical-check-items/:id` | Detail |
| `POST` | `/device-physical-check-items/` | Create |
| `PATCH` | `/device-physical-check-items/:id` | Edit name / inspectionLimit / isActive |
| `PATCH` | `/device-physical-check-items/device-types/:deviceTypeId/item-order` | Reorder `{ itemIds }` |

**Tidak dipanggil dari Portal UI:** `DELETE /device-physical-check-items/:id`  
(Alasan: Calibration Parameters juga tidak expose hard delete; operasional via deactivate. Backend tetap menolak delete jika ada `PhysicalCheckResult` → `DEVICE_PHYSICAL_CHECK_ITEM_IN_USE`.)

Shared types dikonsumsi dari `@medcal/shared`:
- `DevicePhysicalCheckItemCreateInput`
- `DevicePhysicalCheckItemUpdateInput`

---

## E. CRUD behavior

### Create (`POST /`)

| Field UI | Required | Notes |
|---|---|---|
| Device Name | Ya | Combobox DeviceType existing |
| Item / Parameter (`name`) | Ya | max 200 |
| Batas Pemeriksaan (`inspectionLimit`) | Ya | max 500 — **wajib karena schema backend** |
| Kode | — | Tidak diinput; server generate `${deviceType.code}_PHYSICAL_NNN` |
| sortOrder | — | Tidak diinput; server append |
| Status | — | Tidak di form create; default backend `true` |

Prefill: `?deviceTypeId=` dari link “Tambah item untuk {name}”.

### Edit (`PATCH /:id`)

| Editable | Not editable |
|---|---|
| `name` | `deviceTypeId` |
| `inspectionLimit` | `code` |
| `isActive` | `sortOrder` |

### Active / Inactive

- Filter list: Semua / Aktif / Nonaktif (default Semua — sama pola master lain)
- Edit page: select Aktif/Nonaktif
- Aturan “inactive tidak dipakai Tech-PWA baru” tetap di backend; Portal tidak menambah interpretasi lain

### Delete

- Tidak ada tombol Delete di UI
- Error mapping tetap siap untuk `DEVICE_PHYSICAL_CHECK_ITEM_IN_USE` jika kelak dipanggil

---

## F. Reorder behavior

- Library: `@dnd-kit/core` + `@dnd-kit/sortable`
- Scope: **hanya** dalam satu DeviceType
- Tidak ada cross-device drag
- Payload: `{ itemIds: string[] }` — full ordered list; frontend **tidak** menghitung `sortOrder`
- Hook: `useReorderDevicePhysicalCheckItems` — optimistic + rollback + `invalidateQueries`
- Error banner: “Gagal menyimpan urutan baru…”
- Mapping error: `DEVICE_PHYSICAL_CHECK_ITEM_ORDER_MISMATCH`

**Catatan operasional:** jika filter `isActive` aktif dan subset item tampil, reorder bisa gagal karena backend mensyaratkan full set — perilaku sama dengan Calibration Parameters.

---

## G. RBAC behavior

| `/me` flag | Perilaku UI |
|---|---|
| `devicePhysicalCheckItemRead` | Akses list + detail; tanpa flag → `AccessDenied` |
| `devicePhysicalCheckItemCreate` | Tombol New + link “Tambah item…” |
| `devicePhysicalCheckItemUpdate` | Tombol Edit + Status + drag handle reorder |
| `devicePhysicalCheckItemDelete` | **Tidak dipakai** di Portal UI |

**Tidak dipakai:** `calibrationJobRecordPhysicalCheck` (itu untuk eksekusi Tech-PWA / `PhysicalCheckResult`).

Permission Management label ditambahkan: `devicePhysicalCheckItem` → “Physical Inspection”.

---

## H. Domain boundary (yang sengaja tidak ditampilkan)

Portal master **tidak** menampilkan / mengedit:

- capability / capabilityGroups  
- UOM / tolerance / decimalPlaces / valueType / entryStyle  
- test points / replicate / direction  
- MeasurementResult / QualityReview / CalibrationJob status  
- PASS/FAIL verdict (itu domain Tech-PWA PhysicalCheckResult)

Field master yang relevan: DeviceType · code · name · inspectionLimit · sortOrder · isActive.

---

## I. Tests and results

```text
pnpm --filter @medcal/portal test -- device-physical-check-item
→ Test Files  2 passed (2)
→ Tests       18 passed (18)
```

### Cakupan unit

1. `reorderIds` / `sameOrder` (move up/down, no-op, preserve set, Physical Inspection order scenario)
2. Validasi form create/edit (deviceTypeId, name, inspectionLimit)
3. Create payload: trim; omit `code` / `sortOrder` / `isActive`
4. Update payload: hanya `name` / `inspectionLimit` / `isActive`; tanpa `deviceTypeId` / `code`
5. API error mapping (`DUPLICATE_*`, `IN_USE`, fallback)

**Tidak ada** `@testing-library` di Portal — mengikuti konvensi existing (helper unit tests saja, bukan full page render).

---

## J. Typecheck / build result

```text
pnpm --filter @medcal/portal typecheck  → OK (exit 0)
pnpm --filter @medcal/portal build      → OK (exit 0)
```

Next.js build mendaftarkan:

- `/management/device-physical-check-items`
- `/management/device-physical-check-items/new`
- `/management/device-physical-check-items/[id]`

---

## K. Browser verification result

**Status sesi implementasi:** belum selesai (API/Portal localhost sempat timeout).  
Setelah itu `pnpm dev` aktif di workspace — verifikasi manual masih perlu dijalankan.

### Checklist manual (bagian N)

Lihat bagian N di bawah.

---

## L. Deviations from specification

| # | Deviation | Alasan |
|---|---|---|
| 1 | `inspectionLimit` wajib di UI | Schema create backend `z.string().trim().min(1).max(500)` locked |
| 2 | Status tidak di form create | Pola Calibration Parameters; `isActive` default backend `true` |
| 3 | Hard delete tidak di UI | Pola Calibration Parameters; prioritaskan deactivate |
| 4 | DeviceType 0 item tidak tampil di list | `GET .../grouped` hanya mengembalikan type yang punya item matching filter |
| 5 | Browser E2E belum ditandai PASS di sesi agent | Server tidak tersedia saat verifikasi otomatis |

Tidak ada workaround dengan mengubah backend.

---

## M. Architectural reminder

```
DeviceType
├── DeviceCalibrationParameter[]     ← Portal: /device-calibration-parameters
│    └── CalibrationTestPoint[]
│         └── MeasurementResult[]
│
└── DevicePhysicalCheckItem[]        ← Portal: /device-physical-check-items (laporan ini)
     └── PhysicalCheckResult[]       ← Tech-PWA execution (laporan terpisah)
```

Physical Inspection tetap sibling Calibration Parameters — **bukan** di dalam Capability / MeasurementResult / CalibrationJob.

---

## N. Manual browser checklist

Setelah login ADMIN di Portal (`apps.localhost:3003` atau host management):

### A. Navigation

- [ ] Device Management → Calibration Parameters
- [ ] Device Management → **Physical Inspection**
- [ ] Device Management → Reference Equipment

### B. List

- [ ] Group muncul per Device Name
- [ ] Kolom Kategori tampil (jika ada)
- [ ] Count item per group benar
- [ ] Expand / collapse bekerja
- [ ] Search memanggil API (bukan filter client-side terpisah)
- [ ] Filter Aktif / Nonaktif bekerja

### C. Seeded data (jangan ubah wording LK)

- [ ] DeviceTypes ber-seed (mis. BSM) menampilkan item
- [ ] COLD_CHAIN → 5 item
- [ ] KULKAS_VAKSIN → 5 item
- [ ] ELECTRIC_BEDS / PATIENT_MONITOR → **tidak muncul sebagai group kosong** (expected API)

### D. CRUD + reorder

- [ ] Create item uji pada DeviceType yang sesuai
- [ ] Edit name / Batas Pemeriksaan
- [ ] Deactivate → filter Nonaktif → Reactivate
- [ ] Drag reorder dalam satu DeviceType; urutan persist setelah reload
- [ ] Tanpa permission Update: tidak ada grip / Edit
- [ ] Tanpa permission Create: tidak ada tombol New

### E. Responsive

- [ ] Mobile: group tetap DeviceType; item readable; tidak overflow horizontal berlebih dibanding master lain

---

## O. FINAL VERDICT

**PASS WITH NOTES**

Portal UI Physical Inspection Master siap dipakai sebagai sibling Calibration Parameters. Sisa follow-up dokumentasi/opsional:

1. Jalankan checklist browser (bagian N) dan update status bagian K jika sudah diverifikasi.
2. Jika produk ingin `inspectionLimit` benar-benar optional, itu memerlukan perubahan schema backend terpisah (di luar scope task UI ini).
