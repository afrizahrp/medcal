# BAI Lifecycle + LK Identity Source — Implementation Impact Audit

> READ-ONLY. Tidak ada code, schema, migration, test, atau UI yang diubah.
> Semua temuan menyebut file + method + line number. Dibedakan tegas antara CURRENT dan TARGET behavior.
>
> Date: 2026-09-18.

---

## 1. Executive Summary

### Decision A — BAI Lifecycle

Dampaknya **kecil dan terlokalisasi**, karena repo sudah punya preseden struktural yang nyaris identik: `assertReferenceEquipmentResolvedForSubmit()` (`calibration-jobs.service.ts:2039-2059`) sudah memblokir `submitForReview` ketika ada `JobReferenceEquipmentApproval` berstatus `PENDING_REVIEW`. Rule BAI adalah mekanisme yang sama pada tabel yang berbeda.

Titik enforcement yang tepat hanya satu: `submitForReview()`, sejajar dengan guard nomor 4 yang sudah ada di baris 809.

**Satu risiko nyata yang tidak bisa diabaikan:** terdapat race condition asli antara Technician (submit, via tech-pwa) dan MT (decide BAI, via portal) — dua aktor berbeda di dua aplikasi berbeda, dengan dua permission berbeda. Compare-and-swap yang ada di `submitForReview` (`:812`) hanya mengunci kolom `CalibrationJob.status`, dan **secara struktural tidak dapat melihat tabel `IdentityCorrection`**. Application-level check saja tidak cukup menjamin invariant (§2.5).

`assertIdentityGateOpen()` dan `IDENTITY_LOCKED_JOB_STATUSES` **tetap diperlukan** — keduanya tidak menjadi redundan (§2.4).

### Decision B — LK Identity Source

Dampaknya **jauh lebih besar dari yang terlihat**, karena satu fakta:

> **`technicianObservedBrand` dan `technicianObservedModel` TIDAK ADA di codebase.** Nol hit di schema, migration, service, DTO, validator, API, maupun frontend.

Yang ada hanya `technicianObservedSerial` dan `technicianObservedAkdAkl` (`schema.prisma:2029`, `:2031`, migration `20260902050955_add_calibrationjob_identity_fields`).

**Konsekuensi yang harus dikunci sebelum implementasi:** Decision B mensyaratkan dua kolom baru, tetapi menambah kolom saja tidak mengubah apa pun. `IdentityCorrection` juga tidak punya kolom brand/model (`prevBrand`/`newBrand`/`prevModel`/`newModel` → nol hit di `schema.prisma` dan `packages/shared/src/schemas/index.ts`). Jadi **tidak ada satu pun jalur penulisan** untuk kedua field tersebut. Tanpa writer, keduanya permanen NULL, fallback selalu aktif, dan LK berperilaku persis seperti sekarang — Decision B menjadi no-op untuk Brand dan Model.

Siapa yang menulis observed Brand/Model adalah **MoM #6**, dan itu belum diputuskan. Ini dependency keras, bukan detail implementasi.

Untuk **Serial**, Decision B dapat diterapkan segera dan justru memperbaiki cacat nyata: saat ini LK jalur generik mengabaikan `technicianObservedSerial` dan membaca `Device.serialNumber`, sehingga koreksi serial yang **sudah di-APPROVE pun tidak muncul di LK** (§3.6).

---

## 2. Decision A — BAI Lifecycle

### 2.1 Current behavior

`submitForReview()` — `calibration-jobs.service.ts:790-820`. Guard lengkap, berurutan:

| # | Baris | Guard | Error code |
|---|---|---|---|
| 1 | 792 | `status === SUBMITTED \|\| ACCEPTED_BY_QA` | `CALIBRATION_JOB_ALREADY_SUBMITTED` |
| 2 | 799 | `status !== IN_PROGRESS \|\| startedAt === null` | `CALIBRATION_JOB_NOT_IN_PROGRESS` |
| 3 | 807 | `assertMeasurementsCompleteForSubmit()` | `CALIBRATION_MEASUREMENTS_INCOMPLETE` |
| 4 | 809 | `assertReferenceEquipmentResolvedForSubmit()` | `REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED` |
| — | 811-813 | `updateMany({ where: { id, companyId, status: "IN_PROGRESS" }, data: { status: "SUBMITTED", submittedAt } })` | — |
| — | 815 | `if (updated.count !== 1)` → `CALIBRATION_JOB_ALREADY_SUBMITTED` | — |

**Tidak ada guard yang menyentuh `IdentityCorrection`.** BAI `PENDING_REVIEW` lolos sepenuhnya ke `SUBMITTED`.

### 2.2 Target behavior

BAI `PENDING_REVIEW` harus diselesaikan (APPROVE atau REJECT) sebelum job boleh `SUBMITTED`. Tidak ada post-submit correction workflow.

### 2.3 Required enforcement point

**Jawaban pertanyaan #1: `submitForReview()`, sebagai guard ke-5, tepat setelah baris 809.**

Alasan berbasis code, bukan preferensi:

1. **Preseden identik sudah ada di titik itu.** `assertReferenceEquipmentResolvedForSubmit()` (`:2039-2059`) menolak submit ketika `findPendingReferenceEquipmentApproval()` (`:1960-1967`) menemukan baris `PENDING_REVIEW`. Rule BAI adalah pola yang sama persis pada tabel `IdentityCorrection`.
2. **`submitForReview` adalah satu-satunya pintu menuju `SUBMITTED`.** Konfirmasi: hanya `:811-813` yang menulis `status: "SUBMITTED"` untuk transisi maju.
3. **Ini juga batas `IDENTITY_LOCKED_JOB_STATUSES`.** Set `["SUBMITTED","ACCEPTED_BY_QA"]` (`:210`) mulai berlaku persis setelah transisi ini — memblokir di sini menutup celah "BAI terkunci permanen" tepat pada sumbernya.
4. **Bukan di `complete()`.** Terlambat: begitu `SUBMITTED`, BAI sudah tidak dapat diputuskan (`assertIdentityGateOpen` di `:1412` akan melempar), sehingga blocker di `complete()` justru menciptakan deadlock permanen yang tidak dapat diselesaikan siapa pun.

### 2.4 Existing logic reusable?

**Jawaban pertanyaan #2 — apakah `assertIdentityGateOpen()` masih diperlukan? YA, keempat call site tetap diperlukan.**

| Baris | Method | Masih perlu? | Alasan |
|---|---|---|---|
| 997 | `escalateIdentity` | **Ya** | Gate AKD/AKL — ortogonal terhadap BAI (`schema.prisma:189-193`). Tidak tersentuh Decision A. |
| 1042 | `decideIdentity` | **Ya** | Idem — keputusan MT atas AKD/AKL. |
| 1290 | `submitIdentityCorrection` | **Ya** | Mencegah BAI **baru** diajukan setelah job `SUBMITTED`. Decision A tidak menghapus kebutuhan ini. |
| 1412 | `decideIdentityCorrection` | **Ya** | Menjadi jarang tercapai, tetapi tetap wajib: (a) defense-in-depth bila race di §2.5 lolos, (b) data lama — BAI yang sudah terlanjur menggantung di produksi tetap harus ditolak keputusannya. |

**Jawaban pertanyaan #3 — apakah `IDENTITY_LOCKED_JOB_STATUSES` masih diperlukan? YA.** Konstanta di `:210` adalah backing set satu-satunya bagi `assertIdentityGateOpen()` (`:1184`). Selama keempat call site di atas hidup, konstanta ini hidup. Mirror-nya di `apps/tech-pwa/src/lib/calibration/identity-gate.ts:7` juga tetap.

**Jawaban pertanyaan #4 — reusable atau perlu dipisahkan? Perlu helper terpisah, tetapi meniru pola yang sudah ada.**

`assertIdentityGateOpen()` **tidak dapat dipakai ulang** untuk rule ini — semantiknya berlawanan arah. Ia menjawab *"apakah job sudah lewat bench?"*, sedangkan rule A menjawab *"apakah ada BAI yang belum diputuskan?"*. Dua predikat berbeda pada dua tabel berbeda.

Yang dapat ditiru langsung adalah pasangan:
- `findPendingReferenceEquipmentApproval()` — `:1960-1967`
- `assertReferenceEquipmentResolvedForSubmit()` — `:2039-2059`

Query pending BAI yang setara **sudah ada di codebase**, di `submitIdentityCorrection` `:1292-1296`:

```ts
const existingPending = await prisma.identityCorrection.findFirst({
  where: { companyId, calibrationJobId: jobId, status: "PENDING_REVIEW" },
  select: { id: true, number: true },
});
```

Bentuk query-nya identik dengan yang dibutuhkan; yang berbeda hanya konteks pemanggilan dan pesan error.

**Jawaban pertanyaan #5 — apa yang terjadi pada BAI yang sudah PENDING ketika job masih `IN_PROGRESS`?**

Tidak ada yang berubah. Semua perilaku ini tetap berjalan seperti sekarang:
- MT tetap dapat APPROVE/REJECT (`assertIdentityGateOpen` di `:1412` lolos karena status `IN_PROGRESS`).
- Teknisi tetap dapat mencatat pengukuran (`measurement-results.service.ts:56-79` hanya cek status job + attempt).
- Teknisi **tidak** dapat mengajukan BAI kedua (`:1292` → `IDENTITY_CORRECTION_ALREADY_PENDING`).
- Yang berubah hanya: tombol Submit ditolak selama BAI tersebut masih pending.

**Jawaban pertanyaan #6 — response/error code yang paling tepat.**

Tidak ada kode existing yang cocok tanpa ambiguitas. Evidensi:

| Kandidat existing | Verdict |
|---|---|
| `IDENTITY_CORRECTION_ALREADY_PENDING` (`:1299`) | Sudah terpakai di `submitIdentityCorrection` dengan arti *"tolak BA kedua"*. Pesan UI terpasang di `tech-pwa/src/lib/api-errors.ts:24` dan `portal/.../calibration-job-utils.ts:245` sudah mengikat makna itu. Memakai ulang di `submitForReview` membuat satu kode punya dua arti dan dua remediasi berbeda. |
| `CALIBRATION_JOB_IDENTITY_GATE_LOCKED` (`:1187`) | Makna berlawanan (*job sudah lewat gate*). Tidak cocok. |
| `REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED` (`:2045`) | Domain berbeda (alat referensi). |

**Kesimpulan: kode baru memang diperlukan.** Preseden penamaan di repo sudah jelas — `REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED` untuk kasus yang persis sebangun, sehingga bentuk `IDENTITY_CORRECTION_UNRESOLVED` konsisten dengan konvensi yang ada. *(Nama ini usulan penamaan berbasis preseden, bukan kode yang sudah ada — NOT PRESENT IN CURRENT CODE.)*

**Jawaban pertanyaan #7 — apakah Technician harus mendapat informasi jelas? Ya, dan infrastrukturnya sudah lengkap.**

Preseden persis sudah terpasang di `apps/tech-pwa/src/app/jobs/[id]/page.tsx:224-238`:

```tsx
<SubmitForReviewAction
  disabled={referenceApprovalUnresolved}
  disabledReason={referenceApprovalUnresolved
    ? "Selesaikan persetujuan alat referensi sebelum mengirim hasil ke review mutu."
    : null}
```

Komponen `SubmitForReviewAction` sudah menerima `disabled` + `disabledReason` (`job-detail-ui.tsx:507-524`). Sinyal pending BAI pun sudah mengalir ke client: `hasPendingIdentityCorrection` (`calibration-jobs.service.ts:575`) → `identityCorrectionPending` (`packages/shared/src/utils/calibration-job-action-signals.ts:90`) → `tech-pwa/src/lib/calibration/types.ts:98`.

**Catatan penting:** sinyal itu saat ini dipadamkan saat job terkunci — `identityCorrectionPending: input.hasPendingIdentityCorrection && !locked` (`:90`, dengan `locked` dari `CALIBRATION_JOB_BENCH_LOCKED_STATUSES = ["SUBMITTED","ACCEPTED_BY_QA"]` di `:19`). Untuk gating submit hal ini **tidak menjadi masalah**, karena pada saat tombol Submit tampil job masih `IN_PROGRESS` sehingga `locked === false` dan sinyal aktif.

**Jawaban pertanyaan #8 — apakah MT masih bisa APPROVE/REJECT saat job `IN_PROGRESS`? Ya.** `decideIdentityCorrection` `:1412` memanggil `assertIdentityGateOpen(job.status)`; `IN_PROGRESS` tidak ada dalam `IDENTITY_LOCKED_JOB_STATUSES`. Tidak ada perubahan yang diperlukan. Justru inilah mekanisme yang membuka blokir submit.

**Jawaban pertanyaan #9 — setelah APPROVE, field apa yang dimutasi?**

`decideIdentityCorrection` `:1489-1520`, dalam satu `$transaction`:

| Kondisi | Mutasi | Baris |
|---|---|---|
| `correction.newDeviceId` ada | `bindDevice()` → `calibrationJob.deviceId` | 1491, 1126-1147 |
| `correction.newSerial !== null` | `job.technicianObservedSerial` | 1495 |
| `correction.newAkdAkl !== null` | `job.technicianObservedAkdAkl` | 1496 |
| `openAkdAklGate` | `akdAklApprovalStatus = PENDING_REVIEW`, `akdAklGateOpenedBy = AUTO_MISMATCH`, reset stamp | 1498-1500 |
| `clearAkdAklGate` | `akdAklApprovalStatus = NOT_REQUIRED`, reset stamp | 1502-1503 |
| selalu | `identityCorrection.status = APPROVED`, `decidedByUserId`, `decidedAt`, `decisionNote`, `akdAklGateReopened` | 1509-1518 |

**Apakah job dapat langsung SUBMITTED?** Ya — status BAI menjadi `APPROVED`, sehingga query pending tidak lagi menemukan baris dan guard baru lolos. Tidak ada state antara.

**Jawaban pertanyaan #10 — setelah REJECT.**

`:1416-1431`: `status = REJECTED`, `decidedByUserId`, `decidedAt`, `decisionNote`. **`CalibrationJob` tidak disentuh sama sekali** — tidak ada `bindDevice`, tidak ada tulis `technicianObservedSerial`. Job mempertahankan identitas lamanya.

**Apakah job dapat langsung SUBMITTED?** Ya. Guard hanya memfilter `status: "PENDING_REVIEW"`; `REJECTED` bukan penghalang. Teknisi bebas mengajukan BAI baru (`:1292` hanya menolak jika ada yang masih `PENDING_REVIEW`).

### 2.5 Race condition analysis

**Jawaban pertanyaan #11 — apakah ada race condition? YA, dan ada dua.**

Kondisi struktural yang membuatnya nyata:

| Aktor | Permission | Aplikasi | Evidence |
|---|---|---|---|
| Technician — SUBMIT | `calibrationJob:submitForReview` (TECHNICIAN only) | tech-pwa | `seed-role-permissions.ts:209` |
| MT — decide BAI | `calibrationJob:decideIdentityCorrection` (TECHNICIAN_MANAGER only) | portal | `seed-role-permissions.ts:170` |

Dua orang, dua perangkat, dua aplikasi, tanpa koordinasi. Konfirmasi tambahan: portal tidak punya tombol submit sama sekali (grep `submitForReview` di `portal/.../[id]/page.tsx` → nol hit).

**Race #1 — BAI baru menyusup masuk saat submit sedang berjalan**

```
T0  Job IN_PROGRESS, tanpa BAI pending
T1  [Technician]  submitForReview: guard pending BAI → KOSONG, lolos        (:809+)
T2  [Technician/MT] submitIdentityCorrection: assertIdentityGateOpen        (:1290)
                    membaca status = IN_PROGRESS → lolos
T3  [T2] DB WRITE: identityCorrection.create({ PENDING_REVIEW })            (:1337)
T4  [T1] DB WRITE: updateMany({ where: { status: "IN_PROGRESS" } })         (:811)
                    → count = 1, SUKSES

HASIL: status = SUBMITTED  ∧  BAI = PENDING_REVIEW   ← INVARIANT PECAH
       BAI tersebut kini terkunci permanen (:1184)
```

**Race #2 — keputusan BAI mendarat pada job yang sudah SUBMITTED**

```
T0  Job IN_PROGRESS, BAI PENDING_REVIEW
T1  [MT]         decideIdentityCorrection: assertIdentityGateOpen           (:1412)
                  membaca status = IN_PROGRESS → lolos
T2  [Technician] submitForReview: guard pending BAI → masih ada → DITOLAK
    ... MT lanjut, Technician retry setelah MT commit → aman
    TETAPI bila urutan commit terbalik:
T2' [Technician] submit lolos (MT sudah commit APPROVE) → status SUBMITTED
T3' [MT]         transaksi :1489 menulis job.deviceId / technicianObservedSerial

HASIL: identitas job berubah SETELAH job SUBMITTED — melewati
       IDENTITY_LOCKED_JOB_STATUSES yang seharusnya membekukan identitas
```

**Jawaban pertanyaan #12 — apakah transaction/conditional update diperlukan? YA. Application-level check saja tidak cukup.**

Alasannya struktural, bukan soal kualitas kode:

1. **CAS yang ada tidak bisa melihat tabel lain.** `updateMany({ where: { id, companyId, status: "IN_PROGRESS" } })` (`:812`) adalah compare-and-swap yang benar — tetapi hanya terhadap kolom `CalibrationJob` itu sendiri. Prisma `where` pada `updateMany` tidak dapat memfilter berdasarkan ketiadaan baris di tabel relasi.
2. **Tidak ada kolom penanda di `CalibrationJob`.** Verifikasi pada `schema.prisma:1980-2095`: tidak ada field seperti `hasPendingIdentityCorrection` atau `pendingIdentityCorrectionId`. Flag `hasPendingIdentityCorrection` di `:575` adalah **nilai turunan yang dihitung saat read**, bukan kolom tersimpan. Jadi tidak ada yang bisa dimasukkan ke klausa `where` CAS.
3. **Cek dan tulis berada di transaksi terpisah.** Guard di `:807`/`:809` berjalan di luar transaksi; `updateMany` di `:811` adalah statement mandiri. Ada jendela waktu di antaranya.
4. **Preseden yang ada memiliki celah yang sama.** `assertReferenceEquipmentResolvedForSubmit` (`:2039`) juga melakukan cek di luar transaksi. Meniru pola itu berarti mewarisi race-nya — ini perlu disadari sebagai keputusan sadar, bukan diasumsikan aman karena "sudah ada presedennya".

Opsi mitigasi yang secara teknis tersedia (analisis, **bukan rekomendasi implementasi**): membungkus guard + `updateMany` dalam satu `$transaction` dengan isolation level yang memadai; atau mendenormalisasi penanda pending ke kolom `CalibrationJob` agar dapat masuk klausa CAS; atau menambah constraint tingkat database. Ketiganya punya trade-off berbeda dan merupakan keputusan desain tersendiri.

> **NOT VERIFIED FROM CURRENT CODE:** isolation level Prisma/PostgreSQL yang berlaku pada `$transaction` di repo ini tidak diset eksplisit di mana pun yang saya periksa. Efektivitas opsi transaksi bergantung pada hal tersebut dan perlu diverifikasi terpisah.

### 2.6 Backend impact — Decision A

| File | Perubahan | Evidence |
|---|---|---|
| `calibration-jobs.service.ts` | Guard ke-5 di `submitForReview` setelah `:809`; helper pending-BAI baru (meniru `:1960-1967`) | `:790-820` |
| **Prisma schema** | **Tidak ada** — `IdentityCorrection.status` + index `@@index([companyId, status])` (`schema.prisma:2559`) sudah memadai | — |
| **Migration** | **Tidak ada** | — |
| `calibration-jobs.controller.ts` | Tidak ada — error dilempar dari service, ditangani filter yang ada | `:153-160` |
| DTO / validator | Tidak ada — tidak ada perubahan payload | — |

### 2.7 Frontend impact — Decision A

| File | Perubahan | Evidence |
|---|---|---|
| `tech-pwa/.../jobs/[id]/page.tsx` | Tambah kondisi ke `disabled`/`disabledReason` pada `SubmitForReviewAction` | `:224-238` |
| `tech-pwa/src/lib/api-errors.ts` | Entry pesan untuk error code baru | `:12-60` |
| `portal/.../calibration-job-utils.ts` | Entry pesan (opsional — portal tidak punya tombol submit) | `:243-252` |
| `tech-pwa/.../job-detail-ui.tsx` | **Tidak ada** — `disabled`/`disabledReason` sudah didukung | `:507-524` |
| `packages/shared/.../calibration-job-action-signals.ts` | **Tidak ada** — sinyal sudah tersedia dan aktif saat `IN_PROGRESS` | `:90` |

### 2.8 Migration impact — Decision A

**Nihil.** Tidak ada kolom, enum, index, maupun constraint baru yang dibutuhkan untuk enforcement di level aplikasi.

Yang perlu dipertimbangkan terpisah: **data lama**. BAI yang sudah terlanjur menggantung `PENDING_REVIEW` pada job `SUBMITTED`/`ACCEPTED_BY_QA` di produksi tidak tersentuh rule ini dan tetap tidak dapat diputuskan. Jumlahnya **NOT VERIFIED FROM CURRENT CODE** — hanya dapat diketahui dari query data produksi.

### 2.9 Test impact — Decision A

| File | Dampak | Evidence |
|---|---|---|
| `calibration-jobs.service.test.ts` | **Pasti terdampak.** Sudah menguji `CALIBRATION_JOB_IDENTITY_GATE_LOCKED` (`:445`, `:755`) dan alur BAI (`:701`, `:716`). Setiap test yang men-submit job sambil meninggalkan BAI pending akan berubah hasilnya. | grep hit |
| `lk-download.service.test.ts` | **Berpotensi** — jika fixture-nya membangun job `ACCEPTED_BY_QA` melalui `submitForReview`. | grep hit |
| `kontrol-alat.service.test.ts`, `physical-check-results.service.test.ts` | **Berpotensi** — keduanya menyentuh `submitForReview`. | grep hit |

---

## 3. Decision B — LK Identity Source

### 3.1 Current behavior

Dua jalur render, dengan sumber identitas yang **berbeda**.

`lk-download.service.ts:298`:
```ts
const linkedDevice = fullJob.device ?? fullJob.purchaseOrderItem?.device ?? null;
```

**Jalur generik** (semua DeviceType selain Bed Side Monitor) — nilai disiapkan di `lk-download.service.ts:408-410`, dirender di `lk-result-pdf.ts:187-189`:

| Field LK | Ekspresi | Sumber |
|---|---|---|
| Merk | `job.deviceBrand` ← `linkedDevice?.brand` | Device master |
| Model / Tipe | `job.deviceModel` ← `linkedDevice?.model` | Device master |
| No. Seri | `job.deviceSerial` ← `linkedDevice?.serialNumber` | **Device master — `technicianObservedSerial` diabaikan** |

**Jalur Bed Side Monitor** — disiapkan di `lk-download.service.ts:362-366`, dirender di `lk-templates/bed-side-monitor.ts:324-326`:

| Field LK | Ekspresi | Sumber |
|---|---|---|
| Merk | `text(linkedDevice?.brand) ?? ""` | Device master |
| Model/tipe | `text(linkedDevice?.model) ?? ""` | Device master |
| No.seri | `text(fullJob.technicianObservedSerial) ?? text(linkedDevice?.serialNumber) ?? ""` | **Observed dulu, fallback Device** ← sudah sesuai TARGET |

Pemilihan jalur: `lk-result-pdf.ts:147` — `isBedSideMonitorTemplate(formHeader.sourceFile) && input.templateData`.

### 3.2 Target behavior

Per-field, independen: observed → fallback Device master, untuk Brand, Model, dan Serial.

### 3.3 Field existence

Verifikasi: `grep -rn "technicianObserved" apps packages` (exclude node_modules/dist/test) — hasil lengkap sudah ditelusuri.

- `technicianObservedBrand` → **0 hit di seluruh repo**
- `technicianObservedModel` → **0 hit di seluruh repo**
- `technicianObservedSerial` → ada, `schema.prisma:2029`
- `technicianObservedAkdAkl` → ada, `schema.prisma:2031` (di luar scope Decision B)

Migration terkait: `packages/db/prisma/migrations/20260902050955_add_calibrationjob_identity_fields/migration.sql:11-12` — keduanya `ADD COLUMN ... TEXT` (nullable).

### 3.4 BAI approval → observed identity mutation

Trace `decideIdentityCorrection()` sampai mutasi database (`:1489-1520`):

| Jenis koreksi | Kolom BAI | Menghasilkan mutasi | Baris |
|---|---|---|---|
| **Brand** | **TIDAK ADA KOLOM** | **Tidak ada** | — |
| **Model** | **TIDAK ADA KOLOM** | **Tidak ada** | — |
| **Serial** | `newSerial` | `CalibrationJob.technicianObservedSerial` | 1495 |
| **Device** | `newDeviceId` | `CalibrationJob.deviceId` via `bindDevice()` | 1491, 1126-1147 |
| *(AKD/AKL)* | `newAkdAkl` | `CalibrationJob.technicianObservedAkdAkl` | 1496 |

Konfirmasi ketiadaan kolom brand/model pada BAI: `grep -c "newBrand\|newModel\|prevBrand\|prevModel"` → **0** pada `schema.prisma` **dan** `packages/shared/src/schemas/index.ts`. Kolom yang ada hanya `prevDeviceId`/`newDeviceId`, `prevSerial`/`newSerial`, `prevAkdAkl`/`newAkdAkl` (`schema.prisma:2521-2531`).

`bindDevice()` (`:1126-1147`) hanya menulis `calibrationJob.deviceId` — **Device master tidak pernah dimutasi** oleh alur BAI mana pun.

### 3.5 LK data loading

`buildPdf()` — `lk-download.service.ts:204-273`. Select pada `prisma.calibrationJob.findFirst`:

| Field | Tersedia di select? | Baris |
|---|---|---|
| `technicianObservedSerial` | ✅ **Sudah ada** | 224 |
| `technicianObservedBrand` | ❌ Tidak (kolom tidak eksis) | — |
| `technicianObservedModel` | ❌ Tidak (kolom tidak eksis) | — |
| `device.brand / model / serialNumber` | ✅ Ada | 228-230 |
| `purchaseOrderItem.device.{brand,model,serialNumber}` | ✅ Ada | 251 |

**Untuk Serial: query tidak perlu diperluas sama sekali.** Data sudah dimuat; yang salah hanyalah pemetaannya di `:410`.

Untuk Brand/Model: select harus diperluas dengan dua field baru — **setelah** kolomnya ada. Lokasi persis: blok select `:215-224`, disisipkan sejajar `technicianObservedSerial: true`.

DTO/interface yang perlu diperluas (TARGET, jangan diubah sekarang):
- `lk-result-pdf.ts:75-77` — `deviceBrand` / `deviceModel` / `deviceSerial` pada `LkResultPdfInput["job"]`. **Catatan:** tipe ini tidak harus berubah bila resolusi precedence dilakukan di data-loading layer (`lk-download.service.ts`) sebelum objek dibentuk — renderer tetap menerima tiga string hasil resolusi.
- `lk-template-data.ts:10-14` — `brand` / `model` / `serial` pada `LkTemplateIdentity`. Idem: tipe tidak perlu berubah, hanya nilai yang di-supply di `:362-366`.

Ini temuan yang menguntungkan: **Decision B dapat diterapkan tanpa mengubah signature renderer mana pun**, karena kedua renderer sudah menerima nilai identitas yang sudah jadi. Titik perubahan terkonsentrasi di `lk-download.service.ts:362-366` dan `:408-410`.

### 3.6 Renderer inventory

Inventaris lengkap file LK (`ls apps/api/src/modules/calibration-jobs/lk-*` + `lk-templates/`), diperiksa satu per satu untuk field identitas:

| File | Hit identitas | Menampilkan identitas alat (DUT)? |
|---|---|---|
| `lk-download.service.ts` | 17 | Tidak merender — **menyiapkan** nilai (`:362-366`, `:408-410`) |
| `lk-result-pdf.ts` | 10 | **Ya** — `renderGenericBody` `:187-189` |
| `lk-templates/bed-side-monitor.ts` | 9 | **Ya** — `:324-326` |
| `lk-template-data.ts` | 6 | Tidak — hanya definisi tipe `:10-14`, `:23-25` |
| `lk-page-composition.ts` | 0 | Tidak |
| `lk-pdf-layout.ts` | 0 | Tidak — header/footer tidak memuat identitas alat |
| `lk-pdf-tables.ts` | 0 | Tidak |
| `lk-manual-header-catalog.ts` | 0 | Tidak |
| `lk-measurement-mapping.ts` | 0 | Tidak |

**Pintu masuk tunggal terkonfirmasi:** `renderLkResultPdf` hanya dipanggil dari `lk-download.service.ts:394`. Tidak ada renderer LK di `apps/web-api` maupun `apps/portal` (hit di `apps/web` adalah halaman marketing, bukan renderer).

**Penting — dua hit yang BUKAN scope.** Keduanya adalah tabel **alat acuan (Equipment)**, bukan identitas alat yang dikalibrasi:
- `lk-result-pdf.ts:204` — `eq.brand / eq.model / eq.serialNumber`, bersumber dari `Equipment` (`lk-download.service.ts:338-340`)
- `lk-templates/bed-side-monitor.ts:354-366` — header tabel "Merk / Type/Model / No. Seri" untuk daftar alat acuan

Keduanya **tidak boleh** ikut diubah. `Equipment` adalah entitas berbeda dari `Device`.

### 3.7 Renderer-by-renderer impact

Lihat §5 untuk matriks yang diminta.

### 3.8 Historical snapshot impact

**CURRENT:** mengedit `Device.brand` / `Device.model` / `Device.serialNumber` **mengubah isi LK untuk seluruh job historis** pada device tersebut, karena LK digenerate ulang setiap kali diunduh (tidak ada PDF tersimpan — `buildPdf` dipanggil langsung di `downloadPdf` `:204`) dan membaca Device master secara live.

Cakupan per jalur:

| Jalur | Brand | Model | Serial |
|---|---|---|---|
| Generik | 🔴 live | 🔴 live | 🔴 live |
| Bed Side Monitor | 🔴 live | 🔴 live | 🟢 stabil (observed-first) |

`Device` tidak pernah dihapus (kebijakan proyek, `schema.prisma:2519-2520`) dan `PATCH /devices/:id` mengizinkan ADMIN mengubah ketiga field (`devices.service.ts:182`).

**TARGET:** identitas stabil dari observed, Device master hanya fallback.

**Jalur yang masih membaca Device master tanpa fallback observed** (jawaban atas permintaan §"cari apakah ada jalur yang masih membaca live Device master tanpa fallback"):

1. `lk-download.service.ts:408` — `deviceBrand: linkedDevice?.brand ?? null`
2. `lk-download.service.ts:409` — `deviceModel: linkedDevice?.model ?? null`
3. `lk-download.service.ts:410` — `deviceSerial: linkedDevice?.serialNumber ?? null` ← **tanpa `technicianObservedSerial`, padahal field itu sudah dimuat di `:224`**
4. `lk-download.service.ts:362` — `brand: text(linkedDevice?.brand) ?? ""`
5. `lk-download.service.ts:364` — `model: text(linkedDevice?.model) ?? ""`

Nomor 3 adalah cacat nyata pada CURRENT CODE: koreksi serial yang **sudah di-APPROVE** dan tersimpan di `technicianObservedSerial` tidak pernah muncul di LK jalur generik. Decision B memperbaikinya, dan perbaikan itu tidak menunggu kolom baru apa pun.

---

## 4. Field Matrix

| Field | Existing? | Type | Nullable | Writer | Reader | API exposed? |
|---|---|---|---|---|---|---|
| `CalibrationJob.technicianObservedBrand` | ❌ **TIDAK ADA** | — | — | — | — | — |
| `CalibrationJob.technicianObservedModel` | ❌ **TIDAK ADA** | — | — | — | — | — |
| `CalibrationJob.technicianObservedSerial` | ✅ Ada (`schema.prisma:2029`) | `String?` / TEXT (migration `20260902050955:12`) | Ya | `decideIdentityCorrection` **saja** (`:1495`) | `lk-download.service.ts:366`; list row `:574`; search `:551`; portal `[id]/page.tsx:534`, `calibration-jobs-ui.tsx:454`; tech-pwa `job-detail-ui.tsx:119`, `wizard-state.ts:33` | ✅ Ya |
| `CalibrationJob.technicianObservedAkdAkl` | ✅ Ada (`schema.prisma:2031`) | `String?` / TEXT | Ya | `escalateIdentity` (`:1019`), `decideIdentityCorrection` (`:1496`) | portal `:529`; tech-pwa `job-detail-ui.tsx:120` | ✅ Ya |
| `CalibrationJob.deviceId` | ✅ Ada (`schema.prisma:1991`) | `String?` FK → `Device` | Ya | `bindDevice` (`:1126-1147`) — dipanggil **hanya** dari `decideIdentityCorrection:1491` | `lk-download.service.ts:298` (via relasi `device`) | ✅ Ya |
| `Device.brand` | ✅ Ada (`schema.prisma:1473`) | `String?` | Ya | `devices.service.ts:88` (create), `:182` (update) — ADMIN | `lk-download.service.ts:362`, `:408` | ✅ Ya |
| `Device.model` | ✅ Ada (`schema.prisma:1474`) | `String?` | Ya | idem | `lk-download.service.ts:364`, `:409` | ✅ Ya |
| `Device.serialNumber` | ✅ Ada (`schema.prisma:1475`) | `String?` | Ya | idem | `lk-download.service.ts:366` (fallback), `:410` | ✅ Ya |
| `IdentityCorrection.newSerial` | ✅ Ada (`schema.prisma:2527`) | `String?` | Ya | `submitIdentityCorrection:1351` | `decideIdentityCorrection:1495` | ✅ Ya |
| `IdentityCorrection.newBrand` | ❌ **TIDAK ADA** | — | — | — | — | — |
| `IdentityCorrection.newModel` | ❌ **TIDAK ADA** | — | — | — | — | — |

**Pembacaan matriks ini:** kolom Writer untuk Brand dan Model kosong di kedua tabel. Itulah blocker utama Decision B.

---

## 5. LK Renderer Matrix

| Renderer / File | Brand Source | Model Source | Serial Source | Needs Change? |
|---|---|---|---|---|
| `lk-result-pdf.ts` → `renderGenericBody` `:187-189` | `job.deviceBrand` ← Device master (`lk-download:408`) | `job.deviceModel` ← Device master (`:409`) | `job.deviceSerial` ← **Device master** (`:410`) | **YA — ketiganya.** Perubahan dilakukan di `lk-download:408-410`, bukan di renderer. Serial dapat segera diperbaiki; Brand/Model menunggu kolom + writer. |
| `lk-templates/bed-side-monitor.ts` `:324-326` | `identity.brand` ← Device master (`lk-download:362`) | `identity.model` ← Device master (`:364`) | `identity.serial` ← **observed-first** (`:366`) | **YA — Brand & Model saja.** Serial sudah sesuai TARGET dan **tidak boleh diubah**. |
| `lk-download.service.ts` `:362-366`, `:408-410` | penyedia nilai | penyedia nilai | penyedia nilai | **YA — ini titik perubahan sesungguhnya** untuk kedua jalur. |
| `lk-download.service.ts` select `:215-231` | — | — | `technicianObservedSerial` **sudah ada** `:224` | **Untuk Serial: TIDAK.** Untuk Brand/Model: ya, setelah kolom ada. |
| `lk-template-data.ts` `:10-14` | tipe `string` | tipe `string` | tipe `string` | **TIDAK** — resolusi terjadi sebelum objek dibentuk. |
| `lk-result-pdf.ts` `:75-77` (`LkResultPdfInput["job"]`) | tipe `string \| null` | tipe `string \| null` | tipe `string \| null` | **TIDAK** — idem. |
| `lk-result-pdf.ts` `:204` (alat acuan) | `Equipment.brand` | `Equipment.model` | `Equipment.serialNumber` | **TIDAK — di luar scope.** Entitas `Equipment`, bukan `Device`. |
| `lk-templates/bed-side-monitor.ts` `:354-366` (alat acuan) | `Equipment.brand` | `Equipment.model` | `Equipment.serialNumber` | **TIDAK — di luar scope.** |
| `lk-page-composition.ts`, `lk-pdf-layout.ts`, `lk-pdf-tables.ts`, `lk-manual-header-catalog.ts`, `lk-measurement-mapping.ts` | — | — | — | **TIDAK** — nol referensi identitas (terverifikasi). |

---

## 6. Complete Call/Data Flow

```
┌─ BAI SUBMIT ────────────────────────────────────────────────────────────┐
│ POST /calibration-jobs/:id/identity-corrections      controller:293      │
│   └─ submitIdentityCorrection()                         service:1283     │
│      ├─ assertIdentityGateOpen(job.status)                    :1290      │
│      ├─ cek existingPending PENDING_REVIEW                    :1292      │
│      ├─ cek ada perubahan (device/serial/akdAkl)              :1311-1318 │
│      │   ⚠️ Brand & Model TIDAK ADA di sini — kolomnya tidak eksis       │
│      └─ $transaction:                                                    │
│         ├─ DocumentNumberService.allocate("BAI")              :1332      │
│         └─ DB WRITE identityCorrection.create(PENDING_REVIEW) :1337      │
│            ⚠️ CalibrationJob TIDAK disentuh                              │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                     BAI = PENDING_REVIEW
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
   [TARGET Decision A]                      [CURRENT]
   submitForReview DIBLOKIR                 submitForReview LOLOS
   guard ke-5 setelah :809                  (tidak ada guard BAI)
        │                                           │
        │                                           ▼
        │                                  status = SUBMITTED  :811-813
        │                                           │
        │                                  ⚠️ BAI terkunci permanen :1184
        ▼
┌─ MT DECISION ───────────────────────────────────────────────────────────┐
│ POST /:id/identity-corrections/:cid/decision         controller:311      │
│   └─ decideIdentityCorrection()                         service:1387     │
│      ├─ assertIdentityGateOpen(job.status)                    :1412      │
│      ├─ REJECT → status=REJECTED, decidedBy/At, note     :1416-1431      │
│      │           ⚠️ CalibrationJob TIDAK dimutasi                        │
│      └─ APPROVE → $transaction:                               :1489      │
│         ├─ bindDevice() → job.deviceId                  :1491, 1126      │
│         ├─ job.technicianObservedSerial = newSerial            :1495     │
│         ├─ job.technicianObservedAkdAkl = newAkdAkl            :1496     │
│         ├─ [gate AKD/AKL open/clear]                      :1498-1503     │
│         └─ correction.status = APPROVED                   :1509-1518     │
│            ⚠️ TIDAK ADA mutasi Brand / Model — tidak ada sumbernya       │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                   CalibrationJob ter-update
                              │
                     status → SUBMITTED → ACCEPTED_BY_QA
                              │
┌─ LK DATA LOADING ───────────────────────────────────────────────────────┐
│ GET /:id/lk/pdf?token=...                            controller:765      │
│   └─ downloadPdf()                              lk-download:109          │
│      ├─ consumeToken()                                        :152       │
│      ├─ requireFinalizedJob() → ACCEPTED_BY_QA saja            :196       │
│      └─ buildPdf()                                            :204       │
│         └─ prisma.calibrationJob.findFirst({ select: …         :213      │
│              technicianObservedSerial ✅                        :224      │
│              technicianObservedBrand  ❌ kolom tidak eksis               │
│              technicianObservedModel  ❌ kolom tidak eksis               │
│              device { brand, model, serialNumber } ✅      :228-230      │
│            })                                                            │
│         └─ linkedDevice = job.device ?? poItem.device          :298      │
└──────────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
   isBedSideMonitorTemplate?            (selain itu)
   lk-result-pdf:147                          │
              │                               │
              ▼                               ▼
┌─ RENDERER BSM ──────────────┐   ┌─ RENDERER GENERIK ─────────────┐
│ nilai dari lk-download:      │   │ nilai dari lk-download:        │
│  brand  ← Device      :362   │   │  deviceBrand  ← Device   :408  │
│  model  ← Device      :364   │   │  deviceModel  ← Device   :409  │
│  serial ← observed ✅ :366   │   │  deviceSerial ← Device   :410  │
│           fallback Device    │   │            ⚠️ observed diabaikan│
│                              │   │                                │
│ render bed-side-monitor.ts   │   │ render lk-result-pdf.ts        │
│   :324-326                   │   │   :187-189                     │
└──────────────────────────────┘   └────────────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
                        📄 LK PDF
```

---

## 7. Exact Files Likely To Change

Hanya file dengan evidence dari code. Tidak ada yang dimasukkan karena namanya terdengar relevan.

### Definitely affected

**Decision A**

| File | Evidence |
|---|---|
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` | `submitForReview` `:790-820` — titik guard ke-5 |
| `apps/tech-pwa/src/app/jobs/[id]/page.tsx` | `:224-238` — `disabled`/`disabledReason` pada Submit |
| `apps/tech-pwa/src/lib/api-errors.ts` | `:12-60` — map pesan error |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` | `:445`, `:701`, `:716`, `:755` |

**Decision B**

| File | Evidence |
|---|---|
| `apps/api/src/modules/calibration-jobs/lk-download.service.ts` | `:362-366`, `:408-410` (precedence); `:215-231` (select, hanya untuk Brand/Model) |
| `packages/db/prisma/schema.prisma` | `CalibrationJob` `:1980-2095` — dua kolom baru **jika** Brand/Model masuk scope |
| `packages/db/prisma/migrations/` | migration baru — **hanya jika** kolom ditambahkan |
| `apps/api/src/modules/calibration-jobs/lk-download.service.test.ts` | menguji jalur LK |

### Potentially affected

| File | Kondisi | Evidence |
|---|---|---|
| `apps/portal/.../calibration-job-utils.ts` | Jika pesan error A ditambahkan (portal tidak punya tombol submit) | `:243-252` |
| `apps/api/.../lk-template-data.ts` | Hanya jika bentuk tipe diubah — tidak wajib | `:10-14` |
| `apps/api/.../lk-result-pdf.ts` | Hanya jika resolusi dipindah ke renderer — tidak disarankan oleh struktur saat ini | `:75-77`, `:187-189` |
| `packages/shared/src/schemas/index.ts` | Jika BAI diperluas untuk mengoreksi Brand/Model | `:739-790` |
| `apps/api/.../calibration-jobs.service.ts` (BAI) | Jika BAI diperluas Brand/Model: `:1311-1318`, `:1337-1372`, `:1495` | — |
| `kontrol-alat.service.test.ts`, `physical-check-results.service.test.ts` | Jika fixture memakai `submitForReview` | grep hit |
| `apps/tech-pwa/.../identity-correction/*` | Jika BAI diperluas Brand/Model | `page.tsx`, `wizard-state.ts:33`, `review/page.tsx:143` |

### No change required

| File | Alasan (terverifikasi) |
|---|---|
| `lk-page-composition.ts`, `lk-pdf-layout.ts`, `lk-pdf-tables.ts`, `lk-manual-header-catalog.ts`, `lk-measurement-mapping.ts` | Nol referensi identitas |
| `lk-result-pdf.ts:204` (blok alat acuan) | Entitas `Equipment`, bukan `Device` |
| `lk-templates/bed-side-monitor.ts:354-366` | Idem — tabel alat acuan |
| `identity-correction-pdf.ts` | Merender BA, bukan LK; membaca `IdentityCorrection` langsung |
| `measurement-results.service.ts` | Gate `:56-79` murni status job; tidak tersentuh kedua decision |
| `packages/auth/src/access-control.ts`, `seed-role-permissions.ts` | Tidak ada permission baru — aktor tidak berubah |
| `packages/shared/.../calibration-job-action-signals.ts` | `:90` sudah menyediakan sinyal dan aktif saat `IN_PROGRESS` |
| `apps/tech-pwa/.../job-detail-ui.tsx` | `:507-524` sudah mendukung `disabled`/`disabledReason` |
| `lk-templates/bed-side-monitor.ts:326` (No.seri) | Sudah observed-first — sesuai TARGET |

---

## 8. Risks / Edge Cases

**Concurrent MT decision vs Technician submit** — Dua race nyata, terdokumentasi di §2.5. Tidak dapat ditutup dengan application-level check saja karena CAS di `:812` tidak dapat memfilter tabel `IdentityCorrection` dan tidak ada kolom penanda di `CalibrationJob`. Risiko tertinggi dalam audit ini.

**Multiple pending BAI** — Tidak mungkin terjadi. `:1292-1303` menolak BA kedua dengan `IDENTITY_CORRECTION_ALREADY_PENDING`. Maksimal satu pending per job. **Namun perlu dicatat:** penjagaan ini murni application-level, tanpa unique constraint di database (`schema.prisma:2558-2565` hanya punya `@@unique([companyId, number])`), sehingga secara teori dua request paralel dapat sama-sama lolos. **NOT VERIFIED FROM CURRENT CODE:** apakah hal ini pernah terjadi di produksi.

**Rejected BAI** — Tidak memblokir submit (guard hanya memfilter `PENDING_REVIEW`). Teknisi bebas mengajukan BA baru. Job tetap membawa identitas lama karena REJECT tidak memutasi `CalibrationJob` (`:1416-1431`).

**Approved BAI** — Membuka blokir submit. Untuk koreksi device, `@@unique([workOrderId, deviceId])` dapat memicu `DEVICE_ALREADY_ASSIGNED_ON_WORK_ORDER` (`:1139-1144`) — kegagalan ini terjadi saat APPROVE, bukan saat submit.

**Device master berubah setelah kalibrasi** — Saat ini mengubah LK historis untuk ketiga field di jalur generik (§3.8). Decision B menghilangkannya hanya untuk field yang punya nilai observed. Untuk job dengan observed NULL, ketidakstabilan tetap ada — ini konsekuensi yang melekat pada desain fallback dan perlu diterima secara sadar.

**Observed field NULL** — Fallback per-field bekerja sesuai spesifikasi. Untuk Brand/Model, NULL adalah **satu-satunya keadaan yang mungkin** sampai ada writer, sehingga fallback akan 100% aktif dan perilaku LK tidak berubah sama sekali.

**Old jobs without observed identity** — Migration `20260902050955` menambah kolom sebagai nullable tanpa backfill. Semua job sebelum tanggal itu punya `technicianObservedSerial = NULL` dan akan jatuh ke Device master. Perilakunya identik dengan sekarang, jadi tidak ada regresi — tetapi juga tidak ada perbaikan stabilitas untuk data historis.

**Different DeviceType renderers** — Hanya dua jalur (generik + Bed Side Monitor), terverifikasi lewat inventaris `lk-*`. Keduanya harus diubah konsisten; jika hanya satu, LK jenis alat berbeda akan menampilkan sumber identitas berbeda — persis inkonsistensi yang ada sekarang, terbalik arahnya. Jika template type-specific baru ditambahkan di masa depan, ia harus mengikuti precedence yang sama. **NOT VERIFIED FROM CURRENT CODE:** apakah ada rencana template LK tambahan.

**Interaksi Decision A × Decision B** — Keduanya berpotongan pada satu titik: Decision A menjamin BAI selalu terputus sebelum submit, sehingga `technicianObservedSerial` sudah final saat LK digenerate. Tanpa Decision A, Decision B tetap benar tetapi dapat menampilkan serial yang koreksinya menggantung selamanya.

---

## 9. Recommended Implementation Sequence

Urutan berdasarkan dependency, bukan prioritas bisnis. **Tidak ada coding yang dilakukan.**

1. **Decision B — Serial saja.** Perbaiki precedence di `lk-download.service.ts:410` (dan `:366` sudah benar). Nol migration, nol kolom baru, nol perubahan renderer — data sudah dimuat di `:224`. Sekaligus menutup cacat di §3.8 nomor 3. Paling kecil risikonya, paling cepat bernilai.

2. **Decision A — guard di `submitForReview`.** Bergantung pada keputusan error code (§2.4 #6). Tambahkan guard ke-5 setelah `:809` meniru `assertReferenceEquipmentResolvedForSubmit`, plus UI `disabledReason` di tech-pwa `:224-238`. Nol migration.

3. **Decision A — penanganan race condition.** Keputusan desain tersendiri (transaksi vs denormalisasi vs constraint), bergantung pada langkah 2 dan pada verifikasi isolation level. Dapat ditunda jika volume submit bersamaan rendah — tetapi harus diputuskan secara eksplisit, bukan dilewatkan diam-diam.

4. **Kunci MoM #6 dulu: siapa penulis observed Brand/Model.** Blocker keras. Tanpa ini, langkah 5 dan 6 tidak menghasilkan perubahan perilaku apa pun.

5. **Kolom + migration untuk `technicianObservedBrand` / `technicianObservedModel`.** Bergantung pada 4.

6. **Decision B — Brand & Model.** Perluas select `:215-231`, lalu precedence di `:362-364` dan `:408-409`. Bergantung pada 5.

7. **Backfill / pembersihan BAI yang terkunci di produksi.** Independen; perlu data produksi untuk menentukan cakupannya.
