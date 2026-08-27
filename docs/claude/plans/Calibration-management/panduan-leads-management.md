# Panduan Pengguna — Menangani Pesan Calon Pelanggan (Leads Management)

Panduan ini ditujukan untuk staff yang tugasnya menangani pesan dari calon pelanggan sehari-hari
(bukan panduan teknis untuk developer). Isinya: dari mana saja pesan calon pelanggan bisa masuk,
bagaimana staff tahu ada pesan baru, dan langkah-langkah menindaklanjutinya sampai calon
pelanggan itu resmi menjadi Pelanggan di sistem.

---

## 1. Gambaran Besar

Ada 3 kemungkinan cara calon pelanggan pertama kali menghubungi perusahaan:

```
Formulir "Hubungi Kami" di website  ─┐
WebChat (chat langsung di website)  ─┼──▶  Lead (Calon Pelanggan)
Tombol WhatsApp di website          ─┘
```

Apapun jalur yang dipakai calon pelanggan, pesannya akan tercatat di sistem dan otomatis
dikumpulkan menjadi satu data yang disebut **"Lead"** (calon pelanggan). Kalau seorang calon
pelanggan menghubungi lewat lebih dari satu cara (misalnya isi formulir dulu, lalu chat juga),
sistem akan berusaha mengenali bahwa itu orang/perusahaan yang sama dan menggabungkannya ke satu
Lead yang sama — jadi staff tidak perlu menangani hal yang sama berkali-kali sebagai data
terpisah.

Semua Lead ini bisa dilihat staff di menu Portal yang bernama **"Leads"**, tapi perlu diketahui:
**halaman ini sebenarnya berjudul "Pesan Kontak"** di layar — isinya adalah daftar pesan-pesan
masuk dari ketiga sumber di atas. Jangan bingung kalau nama menu dan judul halaman terlihat
sedikit berbeda; keduanya merujuk ke tempat yang sama.

---

## 2. Penjelasan Tiap Sumber Pesan

### a. Pesan Formulir Kontak ("Contact Form")

**Apa ini?** Pesan yang dikirim calon pelanggan lewat formulir "Hubungi Kami" di website
perusahaan. Calon pelanggan mengisi nama, email, nomor telepon, nama perusahaan, dan pesannya,
lalu menekan kirim.

**Bagaimana bentuknya di sistem?** Muncul sebagai satu baris di halaman "Leads" (Pesan Kontak),
dengan tanda sumber "Contact Form".

### b. WebChat (chat langsung di website)

**Apa ini?** Pesan yang dikirim calon pelanggan lewat kotak chat langsung yang tersedia di
website perusahaan (bukan WhatsApp — ini chat bawaan website sendiri, biasa disebut "Web Chat").

**Bagaimana bentuknya di sistem?** Percakapan ini punya menu tersendiri di Portal, yaitu menu
**"Chat"**. Di menu ini staff bisa melihat daftar semua percakapan (dengan status "Open" untuk
yang masih berlangsung, atau "Closed" untuk yang sudah selesai) dan membalas langsung dari
sana secara real-time. Pesan pertama dari sebuah percakapan chat juga akan muncul sebagai satu
baris di halaman "Leads" (Pesan Kontak) dengan tanda sumber "Web Chat" — kalau baris itu diklik,
staff akan diarahkan ke halaman percakapan Chat, bukan ke halaman detail Lead.

### c. WhatsApp

**Apa ini?** Tombol/link WhatsApp yang tersedia di website perusahaan.

**Penting untuk dipahami:** ini **bukan** sistem WhatsApp otomatis yang menerima dan mencatat
semua pesan WhatsApp masuk ke dalam sistem. Alurnya adalah:
1. Calon pelanggan menekan tombol WhatsApp di website.
2. Sistem meminta calon pelanggan mengisi identitas singkat (nama, telepon, dll.) lebih dulu.
3. Setelah itu, sistem mencatat data ini sebagai pesan masuk dengan tanda sumber "WhatsApp",
   lalu **baru membuka aplikasi/WhatsApp Web biasa** di tab/jendela baru untuk memulai chat
   sesungguhnya di WhatsApp.

Jadi percakapan WhatsApp yang sebenarnya (balas-membalas pesan) terjadi di aplikasi WhatsApp
itu sendiri, **bukan** di dalam Portal — sistem cuma mencatat "ada calon pelanggan yang memulai
kontak lewat WhatsApp" sebagai satu Lead, supaya tetap tercatat dan bisa ditindaklanjuti staff.

**Bagaimana bentuknya di sistem?** Muncul sebagai satu baris di halaman "Leads" (Pesan Kontak)
dengan tanda sumber "WhatsApp". Di halaman detail Lead juga ada tombol cepat "WhatsApp" dan
"Reply via WhatsApp" yang kalau ditekan akan membuka `wa.me` (WhatsApp) di tab baru — tombol ini
hanya jalan pintas untuk membuka WhatsApp, bukan mengirim balasan dari dalam sistem.

---

## 3. Bagaimana Pesan Menjadi "Lead"

Proses ini berjalan **otomatis** — staff tidak perlu (dan tidak bisa) membuat Lead secara
manual dari awal. Setiap kali ada pesan baru masuk (dari Contact Form, WebChat, atau WhatsApp),
sistem akan mengecek dulu:

- **Kalau ternyata cocok kuat** dengan data Lead yang sudah ada sebelumnya (misalnya nomor
  telepon dan nama perusahaannya sama), pesan baru ini otomatis "ditempelkan" ke Lead lama
  tersebut — jadi riwayat kontaknya menyatu di satu tempat.
- **Kalau ini benar-benar calon pelanggan baru** (tidak cocok dengan data manapun), sistem
  otomatis membuat satu Lead baru untuk menampung pesan ini.
- **Kalau cocoknya tidak jelas/sebagian saja** (misalnya cuma nama yang mirip), pesan ini tidak
  langsung digabung ke mana-mana. Pesan seperti ini akan muncul di bagian **"Perlu Follow Up"**
  di halaman "Leads" (Pesan Kontak), dan staff perlu memutuskan sendiri: menempelkan pesan ini
  ke salah satu Lead yang sudah ada (dipilih dari daftar kandidat yang disarankan sistem), atau
  menekan tombol **"Buat Lead Baru"** untuk membuatnya jadi Lead terpisah.

---

## 4. Notifikasi — Bagaimana Staff Tahu Ada Pesan Masuk

- **Kapan notifikasi muncul:** setiap kali ada pesan/kontak baru masuk dari sumber manapun
  (Contact Form, WebChat, atau WhatsApp), notifikasi akan dikirim ke **semua staff** yang sudah
  mengaktifkan notifikasi. Selain itu, ada juga notifikasi terpisah yang dikirim **khusus ke
  satu staff tertentu** saja saat sebuah Lead ditugaskan (di-*assign*) kepadanya.
- **Di perangkat apa notifikasi ini muncul:** notifikasi ini hanya berjalan lewat aplikasi
  Portal dan aplikasi Tech-PWA yang dibuka lewat browser (Chrome, Edge, dsb) — **belum ada
  aplikasi mobile khusus** untuk notifikasi ini. Notifikasi TIDAK otomatis aktif begitu saja:
  setiap staff harus lebih dulu membuka Portal, menekan tombol untuk **mengaktifkan
  notifikasi**, dan mengizinkan browser menampilkan notifikasi saat diminta. Kalau langkah ini
  belum dilakukan, staff tidak akan menerima notifikasi apapun meski ada pesan masuk.
- **Isi notifikasinya:**
  - Untuk pesan/kontak baru: judul **"📢 Pesan Baru dari {nama pengirim}"**, dengan isi berupa
    topik pesan dan cuplikan singkat isi pesannya.
  - Untuk Lead yang di-assign: judul **"Lead assigned to you"** (Lead ditugaskan kepada Anda).

---

## 5. Langkah-Langkah Ketika Notifikasi Masuk

1. Notifikasi muncul di layar komputer/browser staff (selama notifikasi sudah diaktifkan
   sesuai bagian 4).
2. **Catatan penting:** saat ini mengklik notifikasi belum otomatis membuka halaman pesan yang
   bersangkutan (lihat Catatan Penutup). Jadi setelah melihat notifikasi, staff perlu membuka
   Portal secara manual.
3. Di Portal, buka menu **"Leads"** (halaman "Pesan Kontak") untuk melihat pesan-pesan baru,
   atau buka menu **"Chat"** kalau notifikasinya terkait percakapan WebChat.
4. Cari pesan yang baru masuk — bisa dikenali dari status "Pending" atau lewat urutan waktu
   terbaru di tabel. Kalau pesan itu masuk kategori "Perlu Follow Up", cek dulu di bagian
   tersebut di bagian atas halaman.
5. Klik baris pesan untuk melihat detailnya:
   - Kalau sumbernya WebChat, staff akan masuk ke halaman percakapan dan bisa membalas
     langsung di sana.
   - Kalau sumbernya Contact Form atau WhatsApp, staff akan masuk ke halaman detail Lead —
     di sana staff bisa melihat data kontak, memakai tombol "Reply via Email" atau
     "Reply via WhatsApp" (yang akan membuka aplikasi email/WhatsApp di luar sistem untuk
     membalas), dan mengubah status pesan (Pending/Read/Replied/Closed) sesuai perkembangan.
6. Staff juga bisa mengubah status Lead-nya sendiri (terpisah dari status pesan), misalnya dari
   "New" menjadi "Contacted" atau "Qualified", sesuai sejauh mana proses follow up berjalan.
7. Kalau calon pelanggan ini sudah pasti akan menjadi Pelanggan resmi, staff (yang punya izin
   untuk itu) bisa menekan tombol **"Convert to Customer"** di halaman detail Lead. Staff bisa
   melengkapi data tambahan (nama badan usaha resmi, NPWP, alamat) sebelum menekan tombol ini.
   Setelah dikonversi, Lead tersebut akan otomatis terhubung ke data Pelanggan yang baru dibuat,
   statusnya berubah menjadi "Converted", dan Lead yang sama tidak bisa dikonversi dua kali.

---

## 6. Catatan Penutup

Supaya staff tidak bingung kalau kenyataan di aplikasi sedikit berbeda dari harapan, berikut
bagian mana yang sudah benar-benar berjalan dan mana yang masih terbatas:

- **Sudah berjalan penuh:** pencatatan pesan dari ketiga sumber (Contact Form, WebChat,
  WhatsApp) ke dalam satu daftar "Leads"/Pesan Kontak; penggabungan otomatis pesan ke Lead yang
  sudah ada atau pembuatan Lead baru; antrean "Perlu Follow Up" untuk kasus yang tidak jelas;
  percakapan WebChat secara langsung (real-time) di menu Chat; pengiriman notifikasi ke staff
  saat ada pesan baru atau saat Lead di-assign; dan proses konversi Lead menjadi Pelanggan.
- **Perlu diketahui sebagai keterbatasan saat ini:**
  - **WhatsApp bukan sistem otomatis dua arah.** Sistem hanya mencatat siapa yang memulai
    kontak lewat WhatsApp (lewat formulir identitas singkat), lalu mengarahkan ke aplikasi
    WhatsApp biasa. Balasan/percakapan WhatsApp selanjutnya tidak tercatat otomatis di sistem.
  - **Mengklik notifikasi belum langsung membuka halaman pesan yang bersangkutan.** Staff perlu
    membuka Portal secara manual dan mencari sendiri pesan/Lead terkait di menu "Leads" atau
    "Chat".
  - **Notifikasi tidak otomatis aktif** — setiap staff harus mengaktifkannya sendiri lebih dulu
    lewat Portal, dan hanya berjalan lewat browser (belum ada aplikasi mobile khusus untuk
    notifikasi ini).
  - Tombol "Reply via Email" dan "Reply via WhatsApp" di halaman detail Lead hanyalah jalan
    pintas untuk membuka aplikasi email/WhatsApp di luar sistem — bukan fitur kirim balasan
    dari dalam Portal itu sendiri.
