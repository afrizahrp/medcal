# HANDOFF — Context for ChatGPT
Update: 2026-09-23

## Peringatan penggunaan (locked policy — jangan dilanggar)
- ChatGPT dipakai untuk draft/brainstorm saja. Setiap output (kode, seed data, keputusan
  domain) WAJIB diverifikasi ulang terhadap source code asli dan dokumen LK sebelum dipakai
  — ChatGPT sebelumnya pernah menghasilkan kesalahan (misklasifikasi satu DeviceType
  kanonis sebagai alias).
- Jangan pernah membuat seed data fiktif/tebakan. Semua data kalibrasi (nilai setting,
  tolerance, decimal places) harus berasal dari dokumen LK asli atau Excel hasil kalibrasi
  nyata — bukan konvensi umum industri yang ditebak.
- Peran ChatGPT di sini: reviewer/brainstorm sekunder. Eksekusi kode dilakukan Claude Code
  (via Claude Desktop SSH ke VPS); Claude.ai chat adalah design-review layer di atas Claude
  Code. ChatGPT tidak mengeksekusi kode di repo ini.

## Ringkasan proyek
Medcal (Kalibrasi Medika) — SaaS manajemen kalibrasi alat kesehatan untuk perusahaan
kalibrasi PKM, dibangun solo oleh Afriza. Siklus penuh: CalibrationRequest → Quotation → PO
→ WorkOrder → CalibrationJob → MeasurementResult → Certificate → Invoice → Payment.

**Stack**: Monorepo TurboRepo di `D:\medcal` (lokal) + VPS `srv1000177`. `apps/api`
(NestJS + Prisma + PostgreSQL), `apps/portal` (Next.js, apps.kalibrasimedika.co.id),
`apps/tech-pwa` (Next.js PWA teknisi lapangan, technician.kalibrasimedika.co.id).
Database: `pkmdb` (production/lokal), `pkmdb_test` (test suite).

**Status modul inti**: CalibrationJob, Identity Correction sudah full runtime dan deployed.
MeasurementResult sudah schema+service+API lengkap; UI sedang aktif dikerjakan (lihat di
bawah). Certificate dan QA/QualityReview masih schema-only, belum digarap.

## Metodologi kerja (wajib diikuti siapa pun yang membantu di sesi berikutnya)
- Staged: Stage 1 = audit/desain read-only (no code), hard stop untuk approval manusia,
  baru Stage 2 = implementasi. Checkpoint per langkah, tidak boleh big-bang.
- Verifikasi ke kode/data nyata, jangan berasumsi dari laporan sesi sebelumnya — beberapa
  kali dalam project ini asumsi yang tidak diverifikasi menghasilkan bug nyata baru
  ketahuan lewat klik manual, bukan dari unit test/tsc.
- Bahasa kerja: Bahasa Indonesia.

## Pekerjaan terbaru — NIBP grouped entry (Systole/Mean/Diastole), selesai end-to-end

**Latar belakang**: NIBP (Systole/Mean/Diastole) adalah satu-satunya capability yang
punya 3 `DeviceCalibrationParameter` sibling yang benar-benar merepresentasikan satu
pengukuran fisik bersama (dikonfirmasi dari LK asli, `LK_Bed_Side_Monitor.docx` Tabel 9:
tiap setpoint = 3 baris bertumpuk Systole→Mean→Diastole, masing-masing 5 kolom replikat
I-V). Sebelumnya MT harus mengulang input titik ukur 21x manual (7 setpoint x 3 sibling)
di Portal, dan teknisi harus mengisi 3 layar terpisah di tech-pwa.

**Portal — selesai**:
- Tabel Titik Ukur di `device-calibration-parameters/[id]/page.tsx` sekarang merender
  grouped block (NO. index bersama, 3 sub-baris fixed order Systole→Mean→Diastole) untuk
  capability yang masuk allowlist `GROUPED_TITIK_UKUR_CAPABILITY_CODES = new
  Set(["NIBP"])` — capability lain (Vital Signs, dll) tetap flat seperti semula.
- Reorder (chevron atas-bawah) ada di level blok (NO.), menggeser ketiga sibling
  bersamaan dalam satu transaksi — bukan per-sibling independen.
- Mismatch sequence antar-sibling ditangani via "union of sequences" (baris kosong/—
  kalau satu sibling tidak punya titik di sequence itu — menyurfacekan masalah, bukan
  menyembunyikan).
- Bulk create test point (`createTestPointsBulk`, endpoint
  `POST /device-calibration-parameters/bulk-test-points`) — all-or-nothing transaction,
  reuse validasi existing (`assertUniqueTestPointLabel`/`assertSequenceAvailable`).
- List page (`/device-calibration-parameters`) mengcollapse 3 sibling NIBP jadi 1 baris.
- Halaman detail parameter punya tab switcher (Systole/Mean/Diastole, mutually exclusive,
  client-state, default Systole via lookup sortOrder terendah — bukan hardcode array
  order) untuk card config; kartu Titik Ukur di bawahnya tetap satu, tidak terpengaruh tab
  aktif. Ada confirm dialog kalau pindah tab saat ada unsaved edit.
- Bug yang ditemukan & diperbaiki sepanjang proses: urutan kolom salah (ternyata bug data
  `DeviceCalibrationParameter.sortOrder`, bukan bug logic — diperbaiki via
  `reorderParameters` yang sudah ada, bukan kode baru), nilai salah tersimpan di percobaan
  UI pertama ("Entri Grup" terpisah — didesain ulang total, sekarang jadi bagian dari
  tabel Titik Ukur asli, bukan flow terpisah).

**tech-pwa — selesai**:
- Layar baru khusus capability-level: `/jobs/[id]/measurements/nibp`, menampilkan 21
  baris (7 blok x 3 sibling) meniru layout kertas asli persis.
- Setiap blok: Systole→Mean→Diastole, mulai 1 slot replikat kosong (bukan 5 langsung —
  konsisten dengan pola semua parameter grid lain), satu tombol "+ Tambah ulangan" per
  blok yang menambah 1 slot ke ketiga sibling sekaligus (bukan 3 tombol independen) —
  karena satu kali baca alat menghasilkan ketiga nilai bersamaan secara fisik.
- Satu tombol "Simpan Semua" per layar — mekanisme: sequential PATCH/POST-batch loop
  reuse endpoint yang sudah ada (`.../measurement-results/:id` dan
  `.../measurement-results/batch`), BUKAN endpoint transaksional baru — karena satu baris
  gagal tersimpan tidak membuat baris lain jadi tidak valid (beda kasus dari Portal, yang
  butuh atomicity penuh karena kegagalan sync sequence antar-sibling menghasilkan data
  tidak bermakna).
- Counter "X/21 titik terisi" — client-side saja, bukan menduplikasi validasi backend.
- Gate submit-to-MT tetap di backend (`assertMeasurementsCompleteForSubmit`,
  per-(parameter,testPoint) minimal 1 replikat terisi) — tidak diubah.
- Riwayat penting: fitur serupa (stepper auto-advance antar parameter) sempat dibangun
  duluan lalu DI-REVERT TOTAL karena tidak menyelesaikan pain point asli (grid disimpan
  per-parameter penuh, bukan interleaved per setpoint) — jangan revive.

## Yang masih terbuka / belum digarap (dari catatan project, bukan bagian NIBP di atas)
1. ~20 device type di katalog Excel belum masuk taksonomi sistem.
2. Ventilator: parameter PIF/PEF (peak flow) belum punya kode katalog.
3. 81 parameter NUMBER masih `decimalPlaces=0` tanpa bukti data recorded value.
4. Deploy seluruh perubahan terbaru ke VPS (belum dilakukan).
5. Certificate dan QA/QualityReview module — masih schema-only.
6. REWORK/submit-cycle endpoints (submitForReview/returnForRework/resumeAfterRework) —
   sengaja ditunda sampai giliran modul QA dalam roadmap.

## Catatan lain yang perlu diketahui
- Production DB dan lokal pernah divergen (BSM_SPO2 7 vs 8 titik) — selalu verifikasi ke
  environment yang relevan, jangan asumsikan lokal=production.
- Prinsip desain berulang di seluruh sesi ini: jangan buat heuristik client-side yang bisa
  salah tanpa ketahuan (contoh nyata: value-matching berbasis settingValue kebetulan sama
  antara `VENT_INSP_TIME`/`VENT_EXP_TIME` — dua pengukuran independen yang nyaris salah
  digabung). Selalu pakai identifier eksplisit (capability code, bukan raw ID/nama
  device) untuk allowlist semacam ini, karena ID tidak stabil lintas environment.
