# 1. Complete File Inventory & Format Distribution (Phase 1)

Semua 50 file berada langsung di root folder `D:\medcal\docs\technician-docs\Lembar-Kerja` (tidak ada subfolder). Semua bertanggal modifikasi filesystem identik (07/09/2026 17:16:14 — kemungkinan besar tanggal copy/extract massal, bukan tanggal pembuatan dokumen asli; tanggal dokumen asli ada di header field "Tanggal Edisi", lihat [05-visual-layout-forensics.md](05-visual-layout-forensics.md)).

## Daftar File (alfabetis, dengan ukuran file)

| # | File | Ukuran | Catatan |
|---|------|--------|---------|
| 1 | LK Audiometer.docx | 124,793 B | |
| 2 | LK Auto Chemistry Analyzer.docx | 124,000 B | |
| 3 | LK Autoclave.docx | 118,701 B | |
| 4 | LK Baby Incubator.docx | 776,393 B | Terbesar — berisi gambar besar + `hdphoto1.wdp` |
| 5 | LK Bed Side Monitor.docx | 122,459 B | |
| 6 | LK Bio Safety Cabinet.docx | 150,645 B | 17 tabel — paling kompleks |
| 7 | LK Blanket Warmer.docx | 121,436 B | |
| 8 | LK Blood Bank Refrigerator.docx | 133,390 B | |
| 9 | LK Blood Pressure Monitor.docx | 119,550 B | |
| 10 | LK Centrifuge Refrigerator.docx | 121,974 B | |
| 11 | LK Centrifuge.docx | 116,979 B | |
| 12 | LK Cold Chain, Vaccine Refrigerator.docx | 133,510 B | |
| 13 | LK CPAP.docx | 127,091 B | |
| 14 | LK Dental Unit.docx | 121,707 B | |
| 15 | LK Dental X-Ray.docx | 138,532 B | |
| 16 | LK Electro Accupunture (EST).docx | 117,425 B | |
| 17 | LK Electrocardiograph.docx | 125,504 B | |
| 18 | LK Examination Lamp.docx | 117,291 B | |
| 19 | LK Fetal Doppler.docx | 120,702 B | |
| 20 | LK Flow Meter.docx | 98,455 B | |
| 21 | LK Head Lamp Medik.docx | 117,012 B | |
| 22 | LK Hematologi Analyzer.docx | 121,120 B | |
| 23 | LK Humidifier.docx | 118,604 B | |
| 24 | LK Infant Warmer.docx | 200,297 B | |
| 25 | LK Infusion Pump.docx | 130,130 B | |
| 26 | LK Kelistrikan.docx | 107,874 B | Paling sederhana, 6 tabel |
| 27 | LK Laminar Air Flow.docx | 127,749 B | |
| 28 | LK Lampu Operasi.docx | 119,906 B | |
| 29 | LK Laryngoskop.docx | 117,511 B | Satu-satunya file dengan 3 header/3 footer |
| 30 | LK Medical Freezer.docx | 133,783 B | |
| 31 | LK Medical Refrigerator.docx | 133,512 B | |
| 32 | LK Mikroskop Laboratorium.docx | 118,840 B | |
| 33 | LK Nebulizer Compressor.docx | 115,070 B | |
| 34 | LK Nebulizer Ultrasonic.docx | 113,457 B | |
| 35 | LK Oksigen Concentrator.docx | 98,991 B | |
| 36 | LK Otoscope.docx | 114,712 B | |
| 37 | LK Oven.docx | 133,728 B | |
| 38 | LK pH Meter.docx | 97,440 B | |
| 39 | LK Phaco Emulsifikasi.docx | 124,361 B | |
| 40 | LK Phototherapy.docx | 123,973 B | |
| 41 | LK Platelet Agitator Incubator.docx | 133,828 B | |
| 42 | LK Pulse Oxymeter.docx | 120,505 B | |
| 43 | LK Resusitator Paru dan Neopuff.docx | 126,545 B | |
| 44 | LK Rotator.docx | 117,021 B | |
| 45 | LK Sphygmomanometer.docx | 110,698 B | |
| 46 | LK Spirometer.docx | 126,027 B | |
| 47 | LK Sterilisator.docx | 131,571 B | |
| 48 | LK Suction Pump.docx | 128,797 B | |
| 49 | LK Syringe Pump.docx | 129,990 B | |
| 50 | LK Thermohygrometer.docx | 101,916 B | |

Semua file dikonfirmasi valid OOXML ZIP (signature `PK`), tidak ada satu pun yang gagal dibuka sebagai ZIP/XML — artinya tidak ada file rusak, tidak ada file DOC biner lama yang menyamar sebagai `.docx`, dan tidak ada file hasil scan.

## Format Distribution

```text
DOCX (OOXML, valid ZIP): 50
DOC (biner lama):         0
PDF:                      0
XLSX:                     0
PNG/JPEG/gambar mandiri:  0 (gambar hanya ada SEBAGAI EMBEDDED MEDIA di dalam DOCX — lihat 03-format-forensics.md)
Lainnya:                  0
```

Folder ini **tidak memiliki subfolder**, tidak ada file PDF hasil export, tidak ada file XLSX pendukung, dan tidak ada scan gambar berdiri sendiri. Seluruh 50 file adalah dokumen Word yang tampaknya berupa **template kosong/isi-placeholder**, bukan contoh LK yang sudah terisi data kalibrasi nyata (lihat [02-classification.md](02-classification.md)).
