# STAGE 1 — Proposal: Copy CalibrationTestPoint (Fase 2)

Mode: PROPOSE ONLY. Tidak ada perubahan schema/code. Hard stop setelah
dokumen ini — menunggu keputusan Afriza per item sebelum Stage 2
(implementasi).

Sumber evidence: [`testpoint-device-agnostic-investigation.md`](./testpoint-device-agnostic-investigation.md)
(2026-09-10/11) — tidak di-re-investigasi, dianggap benar dan lengkap.

## Kesimpulan yang sudah dikunci (dari investigasi)

Copy blind TIDAK aman secara seragam:

| Grup | Verdict |
|---|---|
| Heart Rate: BSM ↔ Pulse Oximeter | **SAMA** |
| SpO2 (settingValue): BSM ↔ Pulse Oximeter | **SAMA** (toleransi beda: ±3% vs ±4%) |
| NIBP: BSM (7 titik) ↔ Blood Pressure Monitor (6 titik) | **BEDA** |
| Warmer temp: Infant/Radiant (1 titik) ↔ Blanket (3 titik) | **BEDA** |
| Heart Rate/SpO2/Resp/NIBP: BSM ↔ Patient Monitor | Unverified — **likely SAMA** |
| Heart Rate/SpO2: Pulse Oximeter ↔ Oxymeter Monitor | Unverified — **likely SAMA** |
| Warmer temp: Infant Warmer ↔ Radiant Warmer | Unverified — **likely SAMA** |

Arah yang sudah disetujui: fase 2 = **draft pre-fill + layar review wajib
sebelum simpan**, bukan copy-dan-commit langsung.

## Konteks tambahan ditemukan saat membaca kode fase 1 (penting untuk §1 dan §5)

Sebelum menjawab 5 pertanyaan, dua fakta dari kode yang mengubah bentuk
jawaban secara material:

**Fakta 1 — Belum ada CRUD endpoint untuk `CalibrationTestPoint` sama
sekali.** Tidak ada controller/module untuk entity ini. Satu-satunya
tempat baris `CalibrationTestPoint` dibuat hari ini adalah seed scripts
dan test fixtures (`prisma.calibrationTestPoint.create` langsung, cek
`measurement-results.service.test.ts` dan `calibration-jobs.service.test.ts`).
`DeviceCalibrationParametersService`'s `parameterInclude`
([device-calibration-parameters.service.ts:31-35](../../../../apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts#L31-L35))
bahkan tidak meng-include `testPoints` — API parameter hari ini tidak
pernah mengembalikan test point ke frontend. **Fase 2 bukan cuma "copy
titik uji" — ini akan jadi write-path pertama yang pernah ada untuk
`CalibrationTestPoint`.** Ini memperbesar scope dari sekadar "copy" jadi
"bangun kemampuan create/edit test point yang belum pernah ada", meskipun
dibungkus sebagai fitur copy.

**Fakta 2 — job worksheet generation membedakan DIRECT vs GRID
berdasarkan keberadaan test point aktif, dan ini berbahaya untuk Opsi
"row nyata dengan isActive=false".** Di
[calibration-jobs.service.ts:1518-1541](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L1518-L1541):

```ts
// DIRECT — parameter TANPA test point sama sekali:
where: { ..., entryStyle: "DIRECT_REPLICATES", testPoints: { none: {} } }

// GRID — parameter dengan test point yang isActive:
where: { ..., entryStyle: "DIRECT_REPLICATES", testPoints: { some: { isActive: true } } }
```

`testPoints: { none: {} }` berarti **nol baris terkait, isActive apapun**
— bukan "nol baris aktif". Konsekuensinya: parameter yang test point-nya
ADA tapi SEMUA `isActive: false` tidak match kedua where-clause di atas —
`none {}` salah (ada baris terkait), `some { isActive: true }` juga salah
(tidak ada yang aktif). **Parameter itu hilang total dari worksheet job**
— bukan DIRECT, bukan GRID, tidak muncul sama sekali. Ini lebih buruk
dari gap yang sudah ada hari ini: parameter Pattern B yang baru dicopy
via fase 1 (nol test point) hari ini justru match `none {}` dan tampil
sebagai field entry tunggal sederhana (bentuk salah, tapi tetap muncul
dan bisa dipakai). Baris `isActive=false` yang "lupa diaktifkan" bukan
cuma gangguan UX — itu bug ketidaktampilan data yang diam-diam
menghilangkan parameter dari sertifikat kalibrasi.

Temuan ini langsung menjawab §1.

---

## 1. Bentuk draft

### Opsi A — Row nyata `isActive=false` di tabel `CalibrationTestPoint`

**Tidak direkomendasikan.** Selain risiko "lupa diaktifkan" yang disebut
di brief, Fakta 2 di atas menunjukkan ini bukan cuma risiko UX tapi bug
konkret: parameter dengan draft `isActive=false` yang belum sempat
di-approve akan **hilang dari worksheet job** (bukan DIRECT, bukan GRID),
bukan sekadar "grid kosong menunggu diisi". Memperbaikinya butuh
mengubah query `testPoints: { none: {} }` di `calibration-jobs.service.ts`
— modul yang sangat hidup (test file-nya 3000+ baris) dan eksplisit di
luar scope task ini (tidak menyentuh fase 1/job generation).

### Opsi B — Draft di luar tabel (tidak ditulis ke DB sampai confirm) — **direkomendasikan**

Draft dikembalikan sebagai response body dari endpoint pratinjau (lihat
§5), disimpan sementara sebagai state di client (diedit user di layar
review), lalu di-commit dalam SATU write pada endpoint confirm — baris
`CalibrationTestPoint` baru langsung dibuat dengan `isActive: true`,
tidak pernah ada baris `isActive:false` yang tertinggal.

Trade-off: kalau user menutup tab di tengah review, draft hilang — tapi
ini bukan kerugian karena tidak ada state DB yang perlu dibersihkan
(dibanding Opsi A yang butuh cron/reminder untuk membersihkan draft yang
lupa di-approve). Ini juga konsisten dengan fase 1: `copy()`
([device-calibration-parameters.service.ts:402-479](../../../../apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts#L402-L479))
tidak punya tahap draft sama sekali — mutation-nya LANGSUNG commit dalam
`prisma.$transaction`. Fase 2 mengikuti pola yang sama untuk tahap
commit-nya, cuma menambah satu langkah preview read-only di depannya.

**Rekomendasi: Opsi B.** Kalau ke depan ada kebutuhan "simpan draft lintas
sesi" (user mau lanjut review besok), itu perubahan terpisah (entity
draft baru + migrasi) — jangan dibangun sekarang tanpa kebutuhan nyata.

---

## 2. Layar review — kasus "ada draft" vs "kosong total"

Satu komponen/tabel yang sama menangani dua kondisi, dibedakan oleh
`draft.length === 0` dari response endpoint preview:

| | Ada draft (Heart Rate/SpO2/NIBP dari source ter-seed) | Kosong (Patient Monitor, Oxymeter Monitor, Infant/Radiant Warmer) |
|---|---|---|
| Isi tabel | Baris ter-prefill dari source: `settingLabel`, `settingValue`, tetap editable & bisa dihapus | Satu baris kosong (`+ Tambah titik` untuk nambah lagi), tidak ada nilai ter-prefill |
| Pesan header | "N titik uji disalin dari {sourceDevice}. Periksa sebelum simpan." | "Belum ada titik uji tersimpan untuk {sourceDevice}. Isi manual di bawah." |
| CTA | "Konfirmasi & Simpan N titik uji" | "Simpan titik uji" |

Grup yang verdict-nya **BEDA** (NIBP, Warmer Blanket-vs-Infant/Radiant)
tidak pernah memanggil endpoint preview untuk pasangan device tersebut —
langsung ke state kosong (lihat §4/constraint di bawah), sehingga
teknisi tidak pernah melihat angka dari device lain yang sudah terbukti
tidak relevan.

---

## 3. Toleransi per titik uji vs per parameter

Dikonfirmasi dari schema
([schema.prisma:2169-2172](../../../../packages/db/prisma/schema.prisma#L2169-L2172)):
`CalibrationTestPoint.toleranceMin/Max/Note` nullable, NULL = inherit
parent `DeviceCalibrationParameter`. Fase 1 `copy()` sudah menyalin
`toleranceMin/toleranceMax/toleranceNote` ke parameter yang baru dibuat
([device-calibration-parameters.service.ts:465-467](../../../../apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts#L465-L467)).

**Poin penting yang perlu diverifikasi sebelum mengandalkan asumsi ini:**
untuk grup Heart Rate/SpO2/NIBP, parameter target (mis. `PULSEOX_SPO2`)
**sudah ada** sebagai row ter-seed independen — bukan hasil copy fase 1
dari BSM dalam alur yang sama. Kalau seseorang mencoba copy fase 1
`BSM_SPO2` → Pulse Oximeter hari ini, itu akan kena `skippedDuplicateName`
(nama sudah ada di target). Artinya toleransi ±4% milik `PULSEOX_SPO2`
sudah benar secara independen (dari seed, bukan dari hasil copy fase 1
yang meniru toleransi source ±3%). **Ini menguatkan, bukan melemahkan,
asumsi di pertanyaan §3** — tapi hanya berlaku karena fase 2 harus
menyasar `targetParameterId` yang SUDAH ADA (lihat §5), bukan menyalin
toleransi ulang dari source. Kalau desain fase 2 nanti secara keliru ikut
menyalin `toleranceNote` dari source parameter ke target, itu akan
menimpa toleransi target yang sudah benar dengan toleransi device lain —
harus eksplisit dihindari di implementasi.

**Satu pengecualian yang investigasi belum sentuh:** komentar schema di
[schema.prisma:2151-2154](../../../../packages/db/prisma/schema.prisma#L2151-L2154)
menyebut override toleransi PER-TITIK dipakai untuk "residual un-split
Pattern C / dual-class cases (SUCT_MAX_VACUUM, INCU_AIR_TEMP)" — bukan di
grup manapun yang diinvestigasi (Heart Rate/SpO2/NIBP/Warmer semuanya
NULL di level titik). Tapi kalau suatu saat source parameter yang dicopy
punya titik dengan `toleranceMin/Max` non-NULL, override itu TIDAK BOLEH
ikut ter-copy tanpa tinjauan — override itu dikalibrasi untuk konteks
device sumbernya secara spesifik. Layar review harus menandai baris
begini dengan badge eksplisit ("override toleransi kustom — verifikasi")
alih-alih menyalinnya diam-diam bersama `settingValue`.

**Jawaban: Ya, cukup mengandalkan toleransi parameter induk** — titik uji
draft hanya bawa `settingValue` + `settingLabel`, `toleranceMin/Max/Note`
tetap NULL kecuali source test point punya override eksplisit, dan
override itu WAJIB ditandai di review, bukan disalin diam-diam.

---

## 4. Sumber draft untuk grup "kemungkinan besar sama, belum terverifikasi"

Berlaku untuk: BSM↔Patient Monitor, PulseOx↔Oxymeter Monitor,
Infant Warmer↔Radiant Warmer. Bukti pendukungnya tidak langsung (label
worksheet bersama, catatan toleransi identik) — bukan cross-check angka
per titik seperti Heart Rate/SpO2 BSM↔PulseOx.

### Opsi A — Tetap tawarkan draft, dengan badge "belum terverifikasi"

Pro: mengurangi kerja input manual untuk grup yang paling butuh katalog
diisi (saat ini nol test point). Con: dalam sistem yang outputnya jadi
dasar sertifikat kalibrasi alat medis, "kemungkinan besar sama" berbasis
bukti tidak langsung bisa dianggap otoritatif oleh teknisi yang terburu-
buru — badge peringatan gampang diabaikan kalau tabelnya sudah terisi
rapi dan terlihat resmi.

### Opsi B — Jangan tawarkan draft sampai ada bukti langsung

Rute ke state kosong (sama seperti grup BEDA) sampai ada data LK/Excel
asli untuk Patient Monitor/Oxymeter Monitor, atau konfirmasi eksplisit
dari teknisi SME. Pro: tidak ada risiko menyuntikkan tebakan yang salah
ke rekaman kalibrasi. Con: fitur tidak memberi nilai tambah untuk grup
yang justru paling kosong katalognya; teknisi tetap input manual sama
seperti hari ini.

**Rekomendasi: Opsi B untuk sekarang**, dengan catatan ini keputusan
toleransi-risiko yang sebaiknya eksplisit dikonfirmasi Afriza (bukan
diputuskan sepihak di sini) — karena ini bukan soal teknis, tapi soal
seberapa besar risiko yang diterima untuk mempercepat pengisian katalog.
Kalau Afriza memilih Opsi A, sarankan varian tengah: tetap tawarkan
draft, tapi CTA-nya tidak bisa "konfirmasi sekali klik" — setiap baris
harus di-centang/disentuh individual sebelum tombol simpan aktif (friksi
lebih tinggi dari grup yang benar-benar terverifikasi), supaya teknisi
tidak bisa rubber-stamp tanpa membuka tiap baris.

Follow-up terpisah yang disarankan (di luar scope fase 2 ini): telusuri
apakah ada LK/Excel asli untuk Patient Monitor atau Oxymeter Monitor
dengan penamaan file berbeda dari yang sudah dicek, atau minta konfirmasi
teknisi SME — baru nyalakan Opsi A untuk pasangan spesifik itu setelah
terverifikasi.

---

## 5. Endpoint & flow

### Struktur input — beda dari fase 1

Fase 1 `POST /device-calibration-parameters/copy` menerima
`sourceDeviceTypeId` + `targetDeviceTypeId` + `parameterIds[]` (parameter
SOURCE) — target parameter belum ada, akan DIBUAT oleh endpoint ini,
dicocokkan by `capabilityItemId` + name di sisi target.

Fase 2 berbeda: untuk grup Heart Rate/SpO2/NIBP, parameter TARGET
**sudah ada** (baik pre-seeded atau sudah dibuat sebelumnya lewat fase
1). Jadi input natural fase 2 bukan deviceType-to-deviceType, tapi
pasangan **`sourceParameterId` ↔ `targetParameterId`** eksplisit — user
memilih parameter target yang sudah ada, lalu memilih dari mana test
point-nya mau diambil.

### Opsi A — Dua endpoint: preview (GET) + confirm (POST) — direkomendasikan

```
GET  /device-calibration-parameters/:targetParameterId/test-points/draft-from/:sourceParameterId
POST /device-calibration-parameters/:targetParameterId/test-points/confirm
```

`GET .../draft-from/:sourceParameterId` — read-only, tidak menulis apa
pun, mengembalikan array draft (`sequence`, `settingLabel`,
`settingValue`) dari test point aktif milik source parameter (kosong
kalau source belum punya test point). Aman dipanggil berulang kali (mis.
tiap kali layar review dibuka atau user ganti sumber).

`POST .../confirm` — body = array titik uji yang sudah diedit user
(bisa kosong hasil isi manual, bisa hasil edit dari draft). Dalam SATU
`prisma.$transaction`, membuat baris `CalibrationTestPoint` baru untuk
`targetParameterId` dengan `isActive: true`, `sequence` diisi ulang dari
urutan array (bukan disalin dari source, karena source dan target bisa
beda urutan hasil edit user).

Alasan pisah GET/POST: cocok dengan konvensi controller yang sudah ada
di project ini (GET murni-baca vs POST mutasi dipisah jelas di seluruh
[device-calibration-parameters.controller.ts](../../../../apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.controller.ts)),
dan panggilan preview yang idempoten/aman-diulang tidak perlu penanganan
khusus "dry run" di service layer seperti yang dibutuhkan Opsi B.

### Opsi B — Satu endpoint dengan `mode: "draft" | "commit"`

Bentuk mirip `deviceCalibrationParameterCopySchema` yang sudah ada,
diperluas dengan field `mode`. Routing lebih sederhana (satu method, satu
schema), tapi mencampur operasi baca-murni dan mutasi di balik satu POST
— melanggar konvensi "GET aman/cacheable" dan bikin sulit membedakan
panggilan draft vs commit-beneran di level HTTP method saat baca log atau
nulis test.

**Rekomendasi: Opsi A.**

### Lokasi modul

Karena `CalibrationTestPoint` adalah child entity dari
`DeviceCalibrationParameter` dan belum ada controller sendiri sama
sekali (Fakta 1), tambahkan endpoint ini ke controller
`device-calibration-parameters` yang sudah ada (sama seperti `copy`
sudah jadi sub-route di controller yang sama) — jangan bikin module baru
untuk resource yang secara konsep masih satu keluarga. Permission: reuse
`RequirePermission("deviceCalibrationParameter", "update")` untuk
`confirm` (ini memutasi grid milik parameter yang sudah ada), kecuali
Afriza mau RBAC lebih granular khusus test point — ini keputusan
terbuka, bukan diasumsikan di sini.

### Hubungan dengan response fase 1

**Bukan** ekstensi field `testPointDraft` di response `create`/`copy`
fase 1 — karena target parameter untuk grup Heart Rate/SpO2/NIBP sudah
ada sebelum fase 2 dipanggil (tidak selalu hasil satu request fase-1 yang
sama), dan grup yang belum ter-seed juga perlu bisa diakses fase 2-nya
kapan saja, bukan cuma persis setelah copy. Alur terpisah, dipanggil
kapan saja dari halaman detail parameter yang sudah ada
([`[id]/page.tsx`](../../../../apps/portal/src/app/management/device-calibration-parameters/[id]/page.tsx))
lewat aksi baru "Salin titik uji dari device lain".

Sebagai convenience (opsional, bukan jalur kode terpisah): setelah fase 1
`copy` selesai, layar hasil
([copy/page.tsx](../../../../apps/portal/src/app/management/device-calibration-parameters/copy/page.tsx),
komponen `CopyResultSummary`) bisa menambah baris "N parameter yang baru
disalin punya titik uji di sumber — isi sekarang?" yang mengarahkan ke
alur generik yang sama, bukan endpoint/kode berbeda.

---

## Constraint eksplisit (dari brief, dicatat ulang supaya tidak terlewat di Stage 2)

- Grup verdict **BEDA** (NIBP BSM↔BPM, Warmer Blanket-vs-Infant/Radiant)
  **tidak pernah** jadi kandidat auto-copy/prefill — endpoint preview
  untuk pasangan source/target ini tidak dipanggil sama sekali; UI
  langsung ke state kosong manual.
- Tidak menyentuh keputusan/implementasi fase 1 yang sudah berjalan.
- Tidak membangun apa pun untuk QualityReview/Telaah.

## Keputusan terbuka untuk Afriza sebelum Stage 2

1. §1: Setuju Opsi B (draft di luar DB, commit sekali di confirm)?
2. §4: Opsi A (tawarkan draft + badge unverified, mungkin dengan friksi
   ekstra) atau Opsi B (jangan tawarkan sampai ada bukti langsung) untuk
   Patient Monitor / Oxymeter Monitor / Infant↔Radiant Warmer?
3. §5: Setuju dua endpoint GET (draft-from) + POST (confirm) di controller
   `device-calibration-parameters` yang sudah ada, permission
   `deviceCalibrationParameter:update`?
4. Perlu follow-up terpisah untuk mencari bukti langsung (LK/Excel/SME)
   Patient Monitor & Oxymeter Monitor sebelum Opsi A di §4 dinyalakan?
