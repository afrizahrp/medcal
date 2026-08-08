# SEO Pre-Launch Checklist & Keyword Research
**PT Presisi Kalibrasi Medika — Website B2B (Fase 1: Website + Lead)**

Tujuan: menghindari kesalahan yang terjadi di website acuan (sering ganti
keyword, masalah indexing GSC) dengan mengunci struktur & riset di depan,
bukan sambil jalan.

---

## Bagian 1 — Pre-Launch Technical SEO Checklist

### A. Fondasi struktur (dikunci sebelum konten ditulis)

- [ ] URL structure dikunci: `/layanan/kalibrasi-[kategori]` dan
      `/layanan/kalibrasi-[kategori]/[produk]` — lihat Bagian 2
- [ ] Slug kategori & produk final (bahasa Indonesia, lowercase,
      dash-separated) — tidak direncanakan berubah setelah live
- [ ] `sitemap.xml` **dinamis** (generate dari route, bukan manual/statis)
      — di Next.js App Router pakai `sitemap.ts` bawaan
- [ ] `robots.txt` dicek eksplisit — pastikan tidak ada `Disallow` yang
      tidak sengaja memblokir `/layanan/` atau `/blog/`
- [ ] Canonical tag di setiap halaman (`<link rel="canonical">`) —
      mencegah duplicate content kalau ada parameter URL/filter nanti

### B. Indexing & monitoring (aktif sejak staging, bukan setelah live)

- [ ] Google Search Console (GSC) di-setup **sejak staging**, verifikasi
      domain-level (bukan cuma URL prefix) supaya siap begitu domain live
- [ ] Submit `sitemap.xml` ke GSC di hari pertama go-live
- [ ] Google Analytics 4 (GA4) terpasang, terhubung ke GSC
- [ ] Jadwal cek GSC **mingguan** untuk 3 bulan pertama (Coverage report:
      error indexing, halaman "Discovered — not indexed", dsb.), baru
      turun ke bulanan setelah stabil
- [ ] Redirect map disiapkan **sebelum** ada perubahan slug — kalau
      kategori/produk terpaksa di-rename, pasang 301 redirect di hari yang
      sama, jangan biarkan 404 menggantung

### C. On-page per halaman

- [ ] Setiap halaman kategori & produk punya **1 keyword utama unik**
      (dikunci dari riset di Bagian 2, tidak boleh dua halaman rebutan
      keyword yang sama)
- [ ] Title tag & meta description unik per halaman (tidak template
      kosong "Kalibrasi [Nama Alat] — Presisi Kalibrasi Medika" berulang
      tanpa variasi value proposition)
- [ ] H1 satu per halaman, sesuai mapping Bagian 2
- [ ] Alt text gambar deskriptif (bukan "image1.jpg") — terutama untuk
      foto alat/proses kalibrasi
- [ ] Schema markup `Service` + `LocalBusiness`/`Organization` (untuk
      trust signal & rich snippet), tambahkan `AggregateRating` hanya jika
      benar-benar ada review terverifikasi (jangan fabrikasi)
- [ ] Internal linking: setiap halaman produk link balik ke halaman
      kategori & minimal 1 artikel blog relevan begitu blog tersedia

### D. Konten & governance (mencegah pengulangan masalah "ganti keyword")

- [ ] Riset keyword final disetujui **sebelum** halaman pertama ditulis
      (bukan iteratif per halaman)
- [ ] Setiap halaman produk minimal 300-500 kata konten unik — bukan
      template yang cuma ganti nama alat (risiko dianggap duplicate/thin
      content oleh Google)
- [ ] Perubahan keyword pasca-live = **penambahan**, bukan penggantian
      topik utama halaman yang sudah ter-index
- [ ] Klaim akreditasi KAN hanya eksplisit di 3 produk dalam scope
      LK-521-IDN (Blood Bank Refrigerator, Sphygmomanometer, Bed Side
      Monitor) — 44 produk lain pakai frasa umum ("dilakukan laboratorium
      terakreditasi KAN"), lihat catatan di Bagian 2

### E. Performa & mobile

- [ ] Core Web Vitals dicek di staging (LCP, CLS, INP) — sesuai prinsip
      mobile-first yang sudah dikunci di Action Plan
- [ ] Compress/optimize semua gambar produk sebelum upload (WebP/AVIF)
- [ ] Test di 3G/4G throttled, bukan cuma koneksi kantor yang cepat

### F. Pre-launch final check

- [ ] Crawl test penuh (screaming frog / built-in Next lint) — cek broken
      link, missing meta, orphan pages
- [ ] Verifikasi tidak ada halaman staging/dev yang ke-index (cek
      `noindex` di environment staging sebelum deploy production)
- [ ] Form lead capture tervalidasi end-to-end (captcha, rate limit,
      forward ke Nest LeadsModule) — bukan cuma tampilan UI

---

## Bagian 2 — Riset Keyword & Struktur Heading per Kategori

**Catatan penting:** keyword di bawah disusun berdasarkan logika bisnis
& pola pencarian B2B umum (belum divalidasi volume pencarian riil via
Google Keyword Planner/GSC, karena situs belum live). Rekomendasi:
gunakan sebagai starting point, lalu validasi ulang lewat GSC **setelah**
3 bulan pertama data masuk — sesuai prinsip "penambahan, bukan
penggantian total" di checklist atas.

---

### 1. Monitoring Pasien ⭐ (mencakup 2 dari 3 item terakreditasi KAN)

**H1:** Kalibrasi Alat Monitoring Pasien Tersertifikasi KAN

**H2 / struktur halaman:**
- Kalibrasi Sphygmomanometer & Bed Side Monitor *(Terakreditasi KAN — LK-521-IDN)*
- Kalibrasi Patient Monitor, ECG & Alat Monitoring Lainnya
- Proses & Standar Kalibrasi Monitoring Pasien

**H3 (per produk):** Ambulatory ECG · Electrocardiograph · Pulse Oxymeter · Oxymeter Monitor · Cardiac Output Unit

| Short-tail | Long-tail |
|---|---|
| kalibrasi patient monitor | jasa kalibrasi patient monitor rumah sakit |
| kalibrasi ecg | kalibrasi sphygmomanometer tersertifikasi KAN |
| kalibrasi tensimeter | kalibrasi bed side monitor terakreditasi KAN |
| kalibrasi sphygmomanometer | biaya kalibrasi ecg rumah sakit |
| kalibrasi pulse oximeter | kalibrasi alat monitoring pasien RS tipe C |

---

### 2. Respirasi & Life Support

**H1:** Kalibrasi Alat Respirasi & Life Support Rumah Sakit

**H2:**
- Kalibrasi Ventilator & Alat Bantu Napas
- Kalibrasi Regulator & Flow Meter Oksigen
- Kalibrasi Alat Suction & Resusitasi

**H3:** Nebulizer Compressor · Oxygen Concentrator · Oxygen-Air Proportioner · Aspirator (Surgical/Thoracic/Uterine) · Resuscitator (Cardiac/Pulmonary)

| Short-tail | Long-tail |
|---|---|
| kalibrasi ventilator | jasa kalibrasi ventilator rumah sakit |
| kalibrasi nebulizer | kalibrasi regulator oksigen rumah sakit |
| kalibrasi oxygen concentrator | kalibrasi alat resusitasi tersertifikasi |
| kalibrasi suction pump | kalibrasi suction pump ruang operasi |
| kalibrasi flow meter | kalibrasi alat respirasi ICU |

---

### 3. Neonatal & Termal (NICU)

**H1:** Kalibrasi Alat Neonatal & Termal (NICU)

**H2:**
- Kalibrasi Inkubator Bayi & Infant Warmer
- Kalibrasi Alat Termoterapi (Radiant Warmer, HypoHypertermia)
- Kalibrasi Timbangan Bayi

**H3:** Paraffin Bath · Whirlpool Bath

| Short-tail | Long-tail |
|---|---|
| kalibrasi inkubator bayi | jasa kalibrasi inkubator bayi rumah sakit |
| kalibrasi infant warmer | kalibrasi radiant warmer ruang NICU |
| kalibrasi radiant warmer | kalibrasi timbangan bayi tersertifikasi |
| kalibrasi timbangan bayi | kalibrasi alat hipotermia terapi |
| kalibrasi alat NICU | kalibrasi paraffin bath fisioterapi |

---

### 4. Infus & Pompa Cairan

**H1:** Kalibrasi Pompa Infus & Alat Cairan Medis

**H2:**
- Kalibrasi Infuse Pump & Syringe Pump
- Kalibrasi Blood/Solution Warmer & Breast Pump

| Short-tail | Long-tail |
|---|---|
| kalibrasi infus pump | jasa kalibrasi infus pump rumah sakit |
| kalibrasi syringe pump | kalibrasi syringe pump ICU |
| kalibrasi blood warmer | kalibrasi blood solution warmer tersertifikasi |
| kalibrasi pompa asi | kalibrasi alat infus dan syringe pump |
| kalibrasi alat infus rumah sakit | kalibrasi pompa cairan medis |

---

### 5. Cold Chain & Penyimpanan Suhu ⭐ (mencakup 1 dari 3 item terakreditasi KAN)

**H1:** Kalibrasi Cold Chain & Penyimpanan Suhu Medis

**H2:**
- Kalibrasi Blood Bank Refrigerator *(Terakreditasi KAN — LK-521-IDN)*
- Kalibrasi Kulkas Vaksin & Medical Freezer
- Kalibrasi Cold Chain & Penyimpanan Obat

**H3:** Vaccine Refrigerator · Oven (sterilisasi/pengering)

| Short-tail | Long-tail |
|---|---|
| kalibrasi kulkas vaksin | jasa kalibrasi kulkas vaksin puskesmas |
| kalibrasi blood bank refrigerator | kalibrasi blood bank refrigerator tersertifikasi KAN |
| kalibrasi medical freezer | kalibrasi cold chain vaksin rumah sakit |
| kalibrasi cold chain | kalibrasi medical freezer laboratorium |
| kalibrasi lemari es medis | kalibrasi suhu penyimpanan obat |

---

### 6. Sterilisasi

**H1:** Kalibrasi Alat Sterilisasi (Autoclave & Sterilizer)

**H2:**
- Kalibrasi Autoclave CSSD
- Kalibrasi Sterilizer Laboratorium & Klinik

| Short-tail | Long-tail |
|---|---|
| kalibrasi autoclave | jasa kalibrasi autoclave rumah sakit tipe C |
| kalibrasi sterilizer | kalibrasi sterilizer laboratorium klinik |
| kalibrasi alat sterilisasi | kalibrasi suhu tekanan autoclave |
| jasa kalibrasi autoclave | kalibrasi alat sterilisasi CSSD |
| kalibrasi autoclave rumah sakit | biaya kalibrasi autoclave |

---

### 7. Laboratorium & Diagnostik

**H1:** Kalibrasi Alat Laboratorium & Diagnostik

**H2:**
- Kalibrasi Centrifuge & Mikroskop
- Kalibrasi USG

| Short-tail | Long-tail |
|---|---|
| kalibrasi centrifuge | jasa kalibrasi centrifuge laboratorium |
| kalibrasi mikroskop | kalibrasi mikroskop laboratorium klinik |
| kalibrasi usg | kalibrasi USG rumah sakit tipe D |
| kalibrasi alat laboratorium | kalibrasi alat diagnostik laboratorium |
| kalibrasi alat lab klinik | kalibrasi peralatan lab klinik swasta |

---

### 8. Fasilitas Umum RS

**H1:** Kalibrasi Alat Fasilitas Umum Rumah Sakit

**H2:**
- Kalibrasi Timbangan Dewasa
- Kalibrasi Tempat Tidur Elektrik (Electric Bed)

| Short-tail | Long-tail |
|---|---|
| kalibrasi timbangan dewasa | jasa kalibrasi timbangan dewasa rumah sakit |
| kalibrasi tempat tidur elektrik | kalibrasi electric bed rumah sakit |
| kalibrasi alat fasilitas rumah sakit | kalibrasi alat fasilitas umum klinik |
| kalibrasi timbangan medis | kalibrasi timbangan medis tersertifikasi |
| jasa kalibrasi bed rumah sakit | kalibrasi peralatan penunjang rumah sakit |

---

## Bagian 3 — URL Structure (dikunci sebelum konten ditulis)

```
/                                  → Homepage
/layanan/kalibrasi-monitoring-pasien
/layanan/kalibrasi-monitoring-pasien/kalibrasi-sphygmomanometer
/layanan/kalibrasi-respirasi
/layanan/kalibrasi-neonatal-termal
/layanan/kalibrasi-infus-pompa-cairan
/layanan/kalibrasi-cold-chain
/layanan/kalibrasi-sterilisasi
/layanan/kalibrasi-laboratorium
/layanan/kalibrasi-fasilitas-umum
/sertifikasi-legalitas
/tentang-kami
/blog/[slug]
/kontak
```

Kategori dengan item terakreditasi (`monitoring-pasien`, `cold-chain`)
diprioritaskan sebagai halaman pertama yang ditulis — sudah punya bukti
akreditasi konkret untuk trust signal terkuat, sesuai diskusi
sebelumnya.

---

## Status

Draft untuk validasi user sebelum konten ditulis. Setelah disetujui →
lanjut ke draft copy per halaman, dimulai dari kategori Monitoring
Pasien dan Cold Chain (prioritas trust signal tertinggi).
