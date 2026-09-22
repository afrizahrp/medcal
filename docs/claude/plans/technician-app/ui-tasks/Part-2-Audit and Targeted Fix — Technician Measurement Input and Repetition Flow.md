# Audit Komprehensif — Parameter Kalibrasi BSM, Measurement Point, dan Tolerance Inheritance

Lakukan AUDIT READ-ONLY secara komprehensif terhadap kasus parameter kalibrasi Bed Side Monitor (BSM), khususnya parameter Tegangan dengan measurement point L-N, L-G, dan N-G.

JANGAN mengubah code, database, seed, configuration, atau data apa pun.
JANGAN melakukan migration.
JANGAN memperbaiki implementation terlebih dahulu.

Tujuan audit adalah memahami model/domain yang sebenarnya digunakan Medcal saat ini dan menentukan apakah kasus ini sebaiknya diselesaikan melalui konfigurasi parameter per-device atau membutuhkan perubahan model sistem.

---

## 1. CASE AKTUAL

Pada dokumen kalibrasi BSM yang sedang digunakan:

Parameter:
    Tegangan

Measurement point:
    L-N
    L-G
    N-G

Hasil aktual:
    L-N = 225.3 Vac
    L-G = 226.0 Vac
    N-G = 0.6 Vac

Pada worksheet kalibrasi, tolerance `±10% Vac` muncul bersama pengukuran L-N.

Pada sertifikat resmi, bagian kondisi ruangan mencatat:

    Sumber Tegangan L-N : 225.3 Vac

Dokumen tidak memberikan tolerance terpisah untuk L-G dan N-G.

Penting:
- `0.6` adalah hasil pengukuran yang valid.
- `OR` juga merupakan contoh hasil pengukuran valid pada bagian Resistansi Isolasi.
- Masalah yang sedang diaudit BUKAN kemampuan input decimal/string.
- Deployment juga sudah diverifikasi dan bukan masalah.
- Production menjalankan source terbaru yang sudah mengandung commit measurement-related fixes.

Pada tech-pwa saat ini, parameter Tegangan menampilkan:

    Toleransi: 220 ± 10% Volt

dan hasil:

    L-N 225.3 → Sesuai
    L-G 226   → Sesuai
    N-G 0.6   → Tidak sesuai

Konfigurasi Named Measurement Point untuk N-G saat ini sebenarnya KOSONG:
- Setting: kosong
- Toleransi Minimum: kosong
- Toleransi Maksimum: kosong
- Catatan Toleransi: kosong

UI menjelaskan:
    "Kosongkan untuk mewarisi toleransi parameter induk."

Jadi audit harus memastikan apakah N-G memang sedang mewarisi tolerance parameter induk `220 ±10%`.

---

# 2. PERTANYAAN UTAMA

Jangan langsung berasumsi bahwa solusi yang benar adalah menambahkan konsep global "No Tolerance".

Audit terlebih dahulu kemungkinan bahwa:

> Satu device memang boleh memiliki konfigurasi parameter kalibrasi yang berbeda dari device/model/device lainnya.

Dengan kata lain, secara konseptual mungkin lebih tepat jika:

    Device BSM A
        → memiliki konfigurasi parameter kalibrasinya sendiri

daripada:

    Global Master Parameter Tegangan
        → dipaksa berlaku ke semua device

Walaupun pendekatan per-device tersebut mungkin menghasilkan konfigurasi yang lebih redundant dari sisi desain database, jangan menganggap redundancy sebagai masalah sebelum memahami kebutuhan domain dan existing architecture.

Prioritaskan:
    correctness
    flexibility
    traceability
    operability
    backward compatibility

bukan database normalization semata.

---

# 3. AUDIT DOMAIN MODEL

Telusuri secara lengkap:

- Master parameter kalibrasi
- Parameter template/master
- Device/model-specific parameter
- Device calibration parameter assignment
- Named Measurement Point
- Setting
- tolerance minimum
- tolerance maksimum
- tolerance note
- inheritance mechanism
- measurement result
- conformity evaluation

Jawab secara eksplisit:

### A. Parameter itu sebenarnya milik siapa?

Apakah:

1. Global master parameter
2. Device type/model
3. Individual device
4. Calibration job/SPK
5. Snapshot parameter pada saat calibration

atau kombinasi beberapa level?

### B. Jika satu parameter diubah untuk BSM tertentu, apakah device/model lain ikut berubah?

Ini sangat penting.

Cari bukti dari:
- schema
- relation
- API
- service
- query
- UI
- seed
- existing data

Jangan hanya membaca nama model/table.

### C. Apakah parameter calibration saat ini di-clone/snapshot ketika digunakan oleh device/job?

Jika iya, jelaskan lifecycle-nya.

Contoh:

    Master Parameter
          ↓
    Device Parameter
          ↓
    Calibration Job
          ↓
    Measurement

atau apakah sebenarnya:

    Master Parameter
          ↓
    semua device/job secara live

---

# 4. AUDIT DATA AKTUAL BSM

Cari data BSM yang sedang digunakan pada production/dev environment yang dapat diakses.

Identifikasi:

- device
- model/type
- calibration parameter
- measurement point
- tolerance
- setting
- relation ke master parameter

Jangan mengubah data.

Saya ingin tahu apakah kasus BSM ini memang memiliki konfigurasi parameter yang berbeda dari device lain.

Cari juga apakah parameter "Tegangan" yang sama digunakan oleh device/model lain.

Jika digunakan oleh beberapa device, bandingkan konfigurasi dan measurement point-nya.

---

# 5. AUDIT KASUS L-N / L-G / N-G

Telusuri source code dari:

    parameter
       ↓
    measurement points
       ↓
    tolerance resolution
       ↓
    measurement input
       ↓
    conformity evaluation
       ↓
    report/PDF

Jawab:

1. Mengapa N-G mendapatkan tolerance 220 ±10%?
2. Apakah karena explicit tolerance N-G?
3. Apakah karena NULL → inherit parent?
4. Di mana inheritance tersebut dilakukan?
5. Apakah semua measurement point selalu harus memiliki conformity evaluation?
6. Apakah sistem membedakan:
       - measurement point tanpa tolerance
       - measurement point yang inherit tolerance
       - measurement point dengan explicit tolerance override
7. Apakah `null tolerance` memang bermakna "inherit" secara universal?

Jangan hanya mencari di UI.
Telusuri sampai service/domain layer dan database schema.

---

# 6. AUDIT TERHADAP DOKUMEN KALIBRASI

Gunakan fakta berikut sebagai evidence, bukan sebagai alasan untuk memaksakan business rule:

Dokumen S.638:
- L-N = 225.3 Vac
- L-G = 226.0 Vac
- N-G = 0.6 Vac
- `±10% Vac` muncul pada bagian L-N
- Sertifikat resmi mencatat `Sumber Tegangan L-N : 225.3 Vac`
- Tidak ada tolerance terpisah yang dinyatakan untuk L-G dan N-G.

Jangan menyimpulkan sendiri bahwa:
    "N-G pasti tidak boleh dievaluasi."

Yang harus ditentukan adalah apakah existing domain/configuration model mampu merepresentasikan fakta tersebut dengan benar.

---

# 7. BANDINKAN DUA MODEL SOLUSI

Audit dan bandingkan secara objektif dua kemungkinan berikut.

## Model A — Shared Master Parameter

Contoh:

    Master Parameter: Tegangan
        tolerance = 220 ±10%

    L-N → inherit
    L-G → inherit
    N-G → inherit

Masalah potensial:
    N-G otomatis dinilai terhadap 220 ±10%.

Audit apakah model ini memang terlalu kaku untuk kebutuhan calibration Medcal.

## Model B — Device/Model-Specific Calibration Parameter

Contoh:

    BSM Model X
        Parameter Tegangan
            L-N
            L-G
            N-G

    Device/model lain
        memiliki konfigurasi parameter sendiri

Tidak masalah jika konfigurasi menjadi lebih redundant, selama:
- data lebih akurat terhadap kebutuhan device
- tidak menyebabkan perubahan parameter secara tidak sengaja pada device lain
- traceability tetap baik
- maintenance masih manageable

Tentukan dari existing architecture apakah Model B sebenarnya sudah didukung atau bahkan sudah menjadi pattern yang digunakan di bagian lain.

---

# 8. JANGAN TERJEBAK OVER-ENGINEERING

Secara khusus, jangan langsung menyarankan:

- global "No Tolerance" enum
- tolerance mode baru
- inheritance hierarchy baru
- generic calibration rule engine
- polymorphic parameter system
- migration besar

kecuali audit membuktikan bahwa hal tersebut memang diperlukan.

Pertimbangkan terlebih dahulu kemungkinan bahwa kebutuhan sebenarnya sederhana:

    Device/model tertentu
        memiliki calibration parameter configuration sendiri

Jika itu sudah didukung oleh sistem, mungkin solusi terbaik cukup berupa konfigurasi data, bukan perubahan architecture.

---

# 9. AUDIT REGRESSION / IMPACT

Jika ditemukan bahwa parameter calibration saat ini shared/global, periksa:

- berapa banyak device/model yang menggunakan parameter tersebut
- apakah perubahan tolerance pada satu parameter akan memengaruhi device lain
- apakah ada existing device yang sudah memiliki konfigurasi berbeda
- apakah seed/master data mengasumsikan parameter global
- apakah report mengambil parameter dari master atau snapshot
- apakah historical calibration result tetap aman jika konfigurasi parameter berubah

Jangan mengubah data untuk melakukan eksperimen.

---

# 10. OUTPUT YANG SAYA INGINKAN

Berikan laporan dengan struktur:

## A. Existing Architecture

Jelaskan hubungan:

    Device
    Model
    Calibration Parameter
    Measurement Point
    Tolerance
    Measurement Result
    Calibration Job

sertakan file/schema/service utama yang terlibat.

## B. Actual BSM Configuration

Tampilkan konfigurasi aktual BSM:

    Parameter:
    Measurement points:
    Setting:
    Tolerance:
    Inheritance:
    Evaluation behavior:

## C. Root Cause

Jawab secara spesifik:

    Mengapa N-G = 0.6 saat ini menjadi "Tidak sesuai"?

## D. Domain Finding

Jawab:

    Apakah ini bug implementation,
    salah konfigurasi data,
    keterbatasan model,
    atau mismatch antara shared master parameter
    dengan kebutuhan parameter calibration per-device/model?

## E. Architecture Options

Bandingkan:

    Option A — tetap shared/master
    Option B — device/model-specific parameter
    Option C — perubahan minimal lain jika memang ada

Untuk masing-masing jelaskan:
- kelebihan
- kekurangan
- impact
- risiko regression
- kompleksitas implementasi

Jangan memberikan ranking "terbaik".
Berikan fakta dan trade-off.

## F. Recommendation

Berikan rekomendasi teknis berdasarkan existing architecture dan evidence yang ditemukan.

Tetapi jangan implementasikan.

## G. Required Changes

Jika memang diperlukan perubahan:
- data/configuration change
- UI change
- API change
- schema change
- migration
- seed change
- test

Pisahkan mana yang:
    REQUIRED
    OPTIONAL
    TIDAK DIPERLUKAN

---

# IMPORTANT

Ini adalah AUDIT SAJA.

Jangan:
- edit code
- edit database
- update seed
- migration
- mengubah parameter BSM
- mengubah tolerance
- rebuild Docker
- restart container

Saya ingin memahami terlebih dahulu apakah masalah ini sebenarnya:

    "engine tolerance salah"

atau:

    "shared parameter model tidak cocok dengan kebutuhan calibration per-device/model"

atau:

    "cukup diperbaiki melalui konfigurasi parameter BSM tanpa perubahan code".

Jangan memaksakan solusi yang paling "bersih" secara software engineering jika existing system yang lebih sederhana dan sedikit redundant justru lebih sesuai dengan kebutuhan operasional Medcal.