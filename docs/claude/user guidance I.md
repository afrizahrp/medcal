# Panduan Pengguna: Manajemen Alat & Manajemen Kalibrasi

Dokumen ini adalah panduan orientasi untuk pemilik usaha dan staf admin yang menggunakan
sistem PKM (Portal Management) untuk mengelola data alat medis dan proses kalibrasi. Panduan
ini menjelaskan setiap bagian sistem dengan bahasa sederhana: apa isinya, untuk apa
digunakan, dan bagaimana bagian-bagian itu saling berkaitan dalam pekerjaan sehari-hari.
Panduan ini bukan dokumen teknis — tidak ada istilah pemrograman di sini, hanya penjelasan
tentang cara kerja sistem dari sudut pandang pengguna.

Seluruh isi panduan ini sudah diperiksa langsung ke data dan tampilan Portal yang berjalan
saat ini (per 26 Agustus 2026), bukan disalin dari laporan-laporan lama yang mungkin sudah
tidak sesuai lagi dengan kondisi sistem sekarang.

---

# Bagian 1: Manajemen Alat (Device Management)

## 1. Kategori Alat (halaman "Categories")

**Apa ini?**
Kategori Alat adalah pengelompokan besar untuk jenis-jenis alat medis yang sejenis
fungsinya. Saat ini ada **13 Kategori Alat** di dalam sistem, misalnya "Patient Monitoring"
(alat pemantau tanda vital pasien), "Cold Chain & Storage" (lemari es dan freezer medis),
"Sterilization" (alat sterilisasi), dan "Respiratory & Oxygen" (alat bantu napas dan oksigen).

**Untuk apa?**
Kategori Alat membantu staf mengelompokkan puluhan Jenis Alat ke dalam kelompok yang masuk
akal, supaya lebih mudah dicari dan dikelola. Ini murni pengelompokan internal — pelanggan
tidak melihat "kategori" ini secara langsung, yang mereka lihat adalah nama alatnya.

**Contoh nyata**
Kategori "Patient Monitoring" menaungi 10 Jenis Alat, di antaranya Blood Pressure Monitor,
Bed Side Monitor, Electrocardiographs (ECG), Pulse Oximeters, dan Sphygmomanometers — semua
alat yang fungsinya memantau kondisi pasien.

**Kaitannya dengan bagian lain**
Kategori Alat → menaungi → Jenis Alat. Satu Kategori Alat bisa memiliki banyak Jenis Alat,
tapi satu Jenis Alat hanya boleh berada di satu Kategori.

---

## 2. Jenis Alat (halaman "Types")

**Apa ini?**
Jenis Alat (Device Type) adalah daftar induk jenis-jenis alat medis yang bisa dilayani
kalibrasinya oleh perusahaan. Ini bukan data alat milik pelanggan tertentu — ini semacam
"katalog" umum: apa saja jenis alat yang dikenal sistem. Saat ini ada **59 Jenis Alat**
terdaftar, tersebar di 13 Kategori Alat.

**Untuk apa?**
Setiap kali staf mendata alat milik pelanggan, membuat permintaan kalibrasi, atau menentukan
parameter kalibrasi, mereka selalu memilih dari daftar Jenis Alat ini. Jenis Alat menjadi
acuan tunggal supaya penamaan alat konsisten di seluruh sistem — tidak ada yang menulis
"Tensimeter" di satu tempat dan "Blood Pressure Monitor" di tempat lain untuk alat yang sama.

**Contoh nyata**
Beberapa Jenis Alat yang ada: Blood Pressure Monitor, Ventilator, CPAP, Infant Warmer,
Autoclave, Centrifuge, Infusion Pump, Syringe Pump, Dental Unit, Dental X-Ray, dan
Audiometer. Sebagian nama masih ditulis dalam Bahasa Indonesia sesuai istilah resmi
Kemenkes, misalnya "Kulkas Vaksin," "Lampu Operasi," dan "Mikroskop Laboratorium."

**Kaitannya dengan bagian lain**
Jenis Alat → berada di bawah → Kategori Alat.
Jenis Alat → menentukan → Parameter Kalibrasi apa saja yang berlaku untuknya.
Setiap Data Alat (alat fisik milik pelanggan) dan setiap baris pada Permintaan Kalibrasi
wajib memilih satu Jenis Alat dari daftar ini.

---

## 3. Model Alat (halaman "Models")

**Apa ini?**
Model Alat dimaksudkan sebagai katalog merek dan model/tipe alat (misalnya "Omron — HEM-7130"
di bawah Jenis Alat "Blood Pressure Monitor"), supaya staf tidak perlu mengetik ulang nama
merek/model setiap kali. Halaman untuk menambah dan mengelola Model Alat sudah tersedia di
Portal (staf bisa membuka daftar Jenis Alat lalu menambahkan Model baru dengan mengisi merek
dan nama model).

**Untuk apa?**
Fitur ini disiapkan untuk mempercepat pengisian data ke depannya, terutama saat mendata alat
pelanggan yang mereknya berulang.

**Catatan jujur:** saat ini **belum ada satu pun data Model Alat yang tersimpan** di sistem.
Fiturnya sudah dibangun, tapi belum digunakan secara aktif oleh staf. Saat mendata alat
pelanggan (lihat Bagian 6), kolom merek dan model masih diisi manual sebagai teks bebas, tidak
memilih dari katalog Model Alat ini.

**Kaitannya dengan bagian lain**
Model Alat → berada di bawah → Jenis Alat (satu Jenis Alat bisa punya banyak Model/merek).
Belum terhubung ke Data Alat — pengisian merek/model pada Data Alat masih manual, belum
menarik dari daftar Model Alat.

---

## 4. Kemampuan Pengukuran (halaman "Capabilities")

**Apa ini?**
Ini adalah konsep yang paling penting untuk dipahami, karena berbeda dari Jenis Alat.
Kalau Jenis Alat menjawab "alat ini jenisnya apa?" (misalnya Blood Pressure Monitor,
Ventilator), maka Kemampuan Pengukuran menjawab pertanyaan yang berbeda: **"apa saja yang
bisa/perlu diperiksa/diukur saat kalibrasi?"** — dan daftar pemeriksaan ini dipakai bersama
oleh banyak Jenis Alat yang berbeda, bukan dibuat ulang untuk tiap alat.

Saat ini ada **30 Kemampuan Pengukuran** di sistem, masing-masing berisi beberapa butir
pemeriksaan (disebut "item").

**Untuk apa?**
Supaya definisi pemeriksaan tidak perlu ditulis berulang-ulang untuk setiap Jenis Alat.
Cukup didefinisikan satu kali, lalu "dipasangkan" ke Jenis Alat mana saja yang relevan lewat
Parameter Kalibrasi (Bagian 5).

**Contoh nyata**
Kemampuan Pengukuran "Electrical Safety" (Keamanan Kelistrikan) berisi 4 item pemeriksaan:
Protective Earth Resistance (tahanan pembumian), Insulation Resistance (tahanan isolasi),
Equipment Leakage Current, dan Applied Part Leakage Current (arus bocor). Keempat pemeriksaan
ini persis sama dipakai oleh hampir semua alat elektronik — Blood Pressure Monitor,
Ventilator, ECG, dan puluhan Jenis Alat lain semuanya memakai definisi Electrical Safety yang
sama ini, karena secara fisik semuanya sama-sama alat listrik yang perlu diperiksa keamanan
kelistrikannya.

Contoh lain: Kemampuan "Non-Invasive Blood Pressure" (NIBP) berisi 3 item — Systolic Pressure,
Diastolic Pressure, dan Mean Arterial Pressure — dan ini khusus dipakai oleh alat-alat yang
mengukur tekanan darah.

**Kaitannya dengan bagian lain**
Kemampuan Pengukuran → berisi → beberapa Item Pengukuran (contoh: Electrical Safety → berisi
→ Earth Resistance, Insulation Resistance, dst.).
Kemampuan Pengukuran (lewat item-itemnya) → dipakai oleh → Parameter Kalibrasi pada banyak
Jenis Alat sekaligus.

---

## 5. Parameter Kalibrasi (halaman "Calibration Parameters")

**Apa ini?**
Kalau Kemampuan Pengukuran adalah "daftar pemeriksaan yang mungkin," maka Parameter Kalibrasi
adalah keputusan konkret: **untuk Jenis Alat tertentu, pemeriksaan mana saja dari daftar itu
yang benar-benar berlaku, dan berapa batas lolos/tidak lolosnya (toleransi).** Saat ini ada
**481 Parameter Kalibrasi** yang sudah didefinisikan, tersebar ke 59 Jenis Alat.

**Untuk apa?**
Ini adalah acuan resmi yang dipakai teknisi saat melakukan kalibrasi: apa saja yang harus
diukur untuk alat tertentu, dan angka berapa yang dianggap masih dalam batas aman
(toleransi).

**Contoh nyata**
Untuk Jenis Alat **Blood Pressure Monitor**, sistem mendefinisikan 10 Parameter Kalibrasi,
antara lain:

| Kemampuan Pengukuran        | Yang Diukur                  | Satuan | Batas Toleransi |
| --------------------------- | ---------------------------- | ------ | --------------- |
| Electrical Safety           | Protective Earth Resistance  | Ω      | ≤ 0,3 Ω         |
| Electrical Safety           | Insulation Resistance        | MΩ     | > 2 MΩ          |
| Electrical Safety           | Equipment Leakage Current    | µA     | ≤ 100 µA        |
| Electrical Safety           | Applied Part Leakage Current | µA     | ≤ 50 µA         |
| Non-Invasive Blood Pressure | Systolic Pressure            | mmHg   | ± 5 mmHg        |
| Non-Invasive Blood Pressure | Diastolic Pressure           | mmHg   | ± 5 mmHg        |
| Non-Invasive Blood Pressure | Mean Arterial Pressure       | mmHg   | ± 5 mmHg        |
| Environmental Conditions    | Suhu Ruangan                 | °C     | 25 ± 6 °C       |
| Environmental Conditions    | Kelembapan Ruangan           | %      | 55% ± 20% RH    |
| Environmental Conditions    | Tegangan Input               | V      | 220 ± 10% Volt  |

Perhatikan bahwa 4 baris pertama (Electrical Safety) adalah definisi yang sama persis yang
dipakai puluhan Jenis Alat lain — inilah contoh nyata "berbagi" Kemampuan Pengukuran yang
dijelaskan di Bagian 4.

**Kaitannya dengan bagian lain**
Jenis Alat + Item dari Kemampuan Pengukuran → digabungkan menjadi → satu Parameter Kalibrasi
(lengkap dengan angka toleransinya). Saat teknisi melakukan pekerjaan kalibrasi di lapangan
(di luar cakupan panduan ini), Parameter Kalibrasi inilah acuan pass/fail yang mereka pakai.

---

## 6. Data Alat (halaman "Devices")

**Apa ini?**
Data Alat adalah catatan satu unit alat fisik yang benar-benar dimiliki oleh seorang
pelanggan tertentu — bukan lagi konsep umum seperti Jenis Alat, tapi barang sungguhan dengan
merek, nomor seri, dan lokasi tertentu.

**Untuk apa?**
Setiap kali sebuah alat milik pelanggan pernah/akan dikalibrasi, alat itu perlu dicatat di
sini supaya riwayatnya bisa dilacak dari waktu ke waktu.

**Bagaimana staf membuatnya**
Di halaman "Devices," staf menekan tombol untuk menambah Data Alat baru, lalu mengisi:

- **Jenis Alat** — wajib dipilih dari daftar 59 Jenis Alat (Bagian 2).
- **Pelanggan** — wajib dipilih, alat ini milik pelanggan mana.
- **Merek** dan **Model** — diketik manual (belum menarik dari katalog Model Alat, lihat
  catatan di Bagian 3).
- **Nomor Seri**, **Kategori** (catatan bebas), **Lokasi**, dan **Status** (Aktif/Tidak
  Aktif).

**Catatan jujur:** saat ini **belum ada satu pun Data Alat tersimpan** di sistem (jumlahnya
masih 0). Ini wajar untuk sistem yang baru mulai dipakai — datanya akan bertambah seiring
staf mendata alat pelanggan satu per satu, bukan tanda ada yang salah.

**Kaitannya dengan bagian lain**
Data Alat → milik → satu Pelanggan tertentu.
Data Alat → mengacu ke → satu Jenis Alat (untuk menentukan Parameter Kalibrasi mana yang
berlaku untuknya).

---

# Bagian 2: Manajemen Kalibrasi (Calibration Management)

## 1. Pelanggan (halaman "Customers")

**Apa ini?**
Data Pelanggan berisi informasi perusahaan atau instansi (biasanya rumah sakit, klinik, atau
puskesmas) yang memakai jasa kalibrasi. Saat ini ada **1 Pelanggan** tercatat di sistem,
yaitu "Bumi Indah Putra, PT."

**Untuk apa?**
Data Pelanggan menjadi acuan utama untuk mencatat siapa pemilik suatu Data Alat, dan siapa
yang mengajukan suatu Permintaan Kalibrasi. Setiap Pelanggan juga bisa punya beberapa
kontak (nama, email, telepon orang yang bisa dihubungi).

**Contoh nyata**
Pelanggan "Bumi Indah Putra, PT" memiliki nomor pelanggan otomatis `CUS/2026/08/00001`, nama
resmi "PT. Bumi Indah Putra," dan alamat "Jl. Alex Bangun, Cipendawa." Nomor pelanggan ini
dibuat otomatis oleh sistem setiap kali staf menyimpan Pelanggan baru — polanya
`CUS/[tahun]/[bulan]/[nomor urut]`.

**Bagaimana staf membuatnya**
Di halaman "Customers," staf mengisi: Nama (wajib), Nama Resmi/Badan Hukum, NPWP, Alamat,
Telepon, Handphone, Email, dan opsional satu Kontak Utama (nama, email, telepon orang yang
bisa dihubungi di perusahaan tersebut).

**Kaitannya dengan bagian lain**
Pelanggan → memiliki → banyak Data Alat.
Pelanggan → mengajukan → banyak Permintaan Kalibrasi.

---

## 2. Permintaan Kalibrasi (halaman "Requisition")

**Apa ini?**
Permintaan Kalibrasi adalah catatan resmi bahwa seorang Pelanggan meminta satu atau beberapa
alat miliknya dikalibrasi. Ini adalah titik awal dari seluruh alur kerja kalibrasi di
sistem.

**Untuk apa?**
Sebagai bukti tertulis apa saja yang diminta pelanggan, kapan mereka ingin alatnya
dikalibrasi, dan status permintaan itu sekarang ada di tahap mana.

**Bagaimana alurnya (workflow nyata di Portal saat ini)**

1. **Membuat Permintaan Baru.** Staf membuka "New Requisition," lalu mengisi:
   - **Pelanggan** (wajib) — dipilih dari daftar Pelanggan yang sudah ada.
   - **Cara Layanan** (wajib) — pilih "On Site" (teknisi datang ke lokasi pelanggan) atau
     "Send to Lab" (alat dikirim ke laboratorium kalibrasi).
   - **Tanggal yang Diharapkan** — tanggal kapan pelanggan ingin kalibrasi dilakukan.
   - **Catatan** — catatan bebas untuk permintaan ini.
   - **Daftar Alat** — minimal satu baris, masing-masing berisi Jenis Alat (dipilih dari
     daftar 59 Jenis Alat) dan Device ID (nomor/identitas alat yang diberikan pelanggan,
     ditulis bebas — belum tentu sama dengan Data Alat yang sudah tercatat di Bagian 6), plus
     catatan opsional per alat.

   Saat disimpan, sistem otomatis memberi nomor permintaan dengan pola
   `CRQ/[tahun]/[bulan]/[nomor urut]`, dan statusnya dimulai dari **Draft**.

2. **Submit.** Permintaan yang masih berstatus Draft bisa diedit bebas. Setelah datanya
   siap, staf menekan tombol **Submit**, dan statusnya berubah menjadi **Submitted** —
   sejak titik ini datanya sudah dianggap final ("read-only," tidak bisa diedit lagi lewat
   halaman Permintaan Kalibrasi).

3. **Batalkan (opsional).** Selama permintaan belum berstatus Fulfilled atau Cancelled, staf
   bisa menekan **Cancel Requisition** untuk membatalkannya. Statusnya berubah menjadi
   **Cancelled**.

**Status yang ada saat ini:**

- **Draft** — baru dibuat, masih bisa diedit bebas.
- **Submitted** — sudah dikirim/difinalkan, tidak bisa diedit lagi.
- **In Quotation** — sedang dalam proses penawaran harga (lihat catatan di akhir bagian ini).
- **Cancelled** — dibatalkan.
- **Fulfilled** — sudah selesai dipenuhi.

**Contoh nyata**
Permintaan `CRQ/2026/08/00001` dari Pelanggan "Bumi Indah Putra, PT," cara layanan On Site,
tanggal yang diharapkan 25 Agustus 2026, berisi 1 alat: Jenis Alat "Blood Pressure Monitor"
dengan Device ID "BPM-019XC-1KD1" dan catatan "alat ini sudah dikirimkan pada tanggal
01/08/2026." Permintaan ini sempat dibuat lalu dibatalkan (status sekarang **Cancelled**) —
contoh nyata bahwa alur Draft → Submit → Cancel benar-benar berjalan di sistem, bukan sekadar
rencana.

**Kaitannya dengan bagian lain**
Permintaan Kalibrasi → diajukan oleh → satu Pelanggan.
Permintaan Kalibrasi → berisi → satu atau lebih baris alat, masing-masing mengacu ke satu
Jenis Alat.

Catatan: **modul Penawaran Harga (Quotation)** — langkah lanjutan setelah status "In
Quotation" — direncanakan tapi **belum dibangun** di Portal saat ini, sehingga bagian
alur setelah status tersebut belum bisa didokumentasikan.

---

## Yang belum tercakup

Panduan ini baru mencakup Manajemen Alat dan Manajemen Kalibrasi (sampai tahap Permintaan
Kalibrasi). Bagian-bagian sistem yang akan datang setelah ini — Penawaran Harga (Quotation),
Purchase Order, Work Order/Penugasan Teknisi, Sertifikat Kalibrasi, dan Penagihan (Invoice) —
belum dibangun/aktif di Portal pada saat panduan ini ditulis, sehingga belum bisa
didokumentasikan. Panduan ini perlu diperbarui begitu bagian-bagian tersebut mulai
digunakan.
