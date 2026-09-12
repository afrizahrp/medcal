# 10. Technical Review / Telaah Teknis Mapping

## 10.1 Struktur LK "Telaah Teknis" (dari LK Bed Side Monitor docx, dikonfirmasi Task 1)

```233:248:(dump LK Bed Side Monitor.docx, lihat Task 1)
'Telaah Teknis'
'No' 'Parameter' 'Hasil Pengamatan'
'Baik' 'Tidak Baik'
'1' 'Kondisi Alat (10)'
'2' 'Keselamatan Listrik (40)'
'3' 'Kinerja Peralatan (50)'
'Kesimpulan Telaah Teknis Kalibrasi'
'Baik dan laik untuk digunakan'
'Tidak baik dan tidak laik untuk digunakan'
'Petugas Kalibrasi :'
'Entri data oleh :'
```

LK mendefinisikan **3 kategori berbobot** (Kondisi Alat = 10, Keselamatan Listrik = 40, Kinerja Peralatan = 50 — total 100), masing-masing dengan verdict Baik/Tidak Baik, lalu satu **kesimpulan akhir** (Baik-dan-laik / Tidak-baik-dan-tidak-laik).

## 10.2 Model MedCal yang Ada: `QualityReview` — TIDAK Punya Struktur Skor

```2472:2490:D:\medcal\packages\db\prisma\schema.prisma
model QualityReview {
  id               String              @id @default(cuid())
  companyId        String
  calibrationJobId String
  reviewerUserId   String
  decision         ReviewDecision?
  status           QualityReviewStatus @default(PENDING)
  notes            String?
  reviewedAt       DateTime?
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  calibrationJob CalibrationJob @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  reviewer       User           @relation(fields: [reviewerUserId], references: [id])
  certificates   Certificate[]

  @@index([calibrationJobId])
  @@index([companyId, status])
}
```

```181:186:D:\medcal\packages\db\prisma\schema.prisma
enum ReviewDecision {
  APPROVE
  REJECT
}
```

`QualityReview` hanya punya **1 decision binary** (APPROVE/REJECT) + `notes` free text. **Tidak ada** field untuk:
- 3 verdict kategori terpisah (Kondisi Alat / Keselamatan Listrik / Kinerja Peralatan)
- bobot skor (10/40/50)
- kesimpulan naratif terstruktur ("Baik dan laik untuk digunakan" vs "Tidak baik dan tidak laik untuk digunakan")

## 10.3 Bukti Tambahan dari Audit Internal Sebelumnya

Audit internal `calibration-results-cross-check.md` §6 juga mencatat temuan yang SAMA secara independen, memperkuat gap ini:

```189:calibration-results-cross-check.md
Telaah teknis G/H (10/40/50) on Ventilator — QualityReview, not MeasurementResult.
```

Ini adalah **konfirmasi ganda** (dua audit independen, tanggal berbeda) bahwa skor Telaah Teknis tidak punya rumah struktural di skema saat ini.

## 10.4 Apakah Ini Bisa Dihitung/Diturunkan (Derived) dari Data Lain?

- **Kondisi Alat**: berpotensi diturunkan dari agregasi `PhysicalCheckResult.verdict` (semua BAIK → "Baik"), tapi LK memberi bobot skor 10 poin per kategori — tidak jelas apakah 10 poin ini all-or-nothing atau granular per-item. **Tidak ditemukan formula** di kode manapun.
- **Keselamatan Listrik**: berpotensi diturunkan dari `MeasurementResult.isWithinTolerance` untuk parameter di bawah capability `ELECTRICAL_SAFETY`, tapi sekali lagi tidak ada formula skor 40-poin yang ditemukan.
- **Kinerja Peralatan**: sama — berpotensi dari agregasi `isWithinTolerance` parameter kinerja, bobot 50 poin tanpa formula eksplisit.
- **Kesimpulan akhir**: `QualityReview.decision` (APPROVE/REJECT) ADA sebagai keputusan MT, tapi teksnya generik, bukan dua kalimat spesifik LK ("Baik dan laik..." / "Tidak baik dan tidak laik...").

**Ini adalah HARD STOP sesuai instruksi task**: "jika DeviceCapabilities/model tidak jelas mendefinisikan konsep yang dibutuhkan, dan tidak bisa diselesaikan tanpa membuat business rule baru — STOP dan laporkan." Formula skor 10/40/50 dan bagaimana ia dipetakan dari verdict granular ke satu angka **tidak dapat ditegakkan dari kode yang ada** — ini adalah keputusan bisnis yang belum diimplementasikan, bukan sesuatu yang bisa disimpulkan.

## 10.5 Kesimpulan

**Feasibility: NO** untuk section "Telaah Teknis" secara utuh (3 kategori berskor + kesimpulan naratif dua-pilihan). `QualityReview` menyediakan keputusan akhir biner (APPROVE/REJECT) yang bisa dipetakan KASAR ke salah satu dari dua kesimpulan LK, tapi:
- Tidak ada breakdown 3 kategori dengan skor 10/40/50.
- Tidak ada formula agregasi dari `PhysicalCheckResult`/`MeasurementResult` ke skor tersebut.

Ini adalah **gap arsitektural nyata** (kategori B — Business Rule Ambiguity, berpotensi menjadi C setelah bisnis memutuskan formulanya), bukan sekadar data yang belum diisi.
