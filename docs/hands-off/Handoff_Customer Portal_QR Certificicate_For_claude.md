# Handoff — Customer Portal, QR Certificate & Customer Engagement

# Intended Audience

This handoff is intended for **Claude Code / engineering implementation agents working on the Medcal repository**.

Its purpose is to preserve product and architectural context from the discussion so that future implementation work does not make assumptions that have not been decided yet.

This is **not** a current implementation task and is **not** a business requirement specification for immediate execution.

Claude Code should treat this document as:
- product context,
- architectural direction,
- decision history,
- and scope guardrails.

Unless a separate task explicitly authorizes implementation, **do not modify the codebase based on this handoff alone**.



## Context

Dalam diskusi requirement Medcal, muncul kebutuhan/masukan terkait sertifikat kalibrasi:

* Sertifikat dapat dibuat **di luar Medcal**.
* Medcal mungkin perlu menyediakan QR Code yang mengarah ke sertifikat tersebut.
* Salah satu opsi yang dibahas adalah menyimpan link Google Drive dan membuat QR dari link tersebut.
* Namun, **Google Drive bukan keputusan arsitektur**. Google Drive hanya salah satu opsi yang perlu dibandingkan dengan Customer Portal.

Medcal juga memiliki rencana **Customer Portal yang terpisah dari Management Portal**.

> **Important:** Customer Portal adalah **future plan** dan **belum menjadi scope implementasi sekarang**.

---

# Key Direction

## Customer Portal = Future Customer-Facing Channel

Customer Portal nantinya bukan sekadar tempat mengambil sertifikat.

Target utamanya adalah memberikan customer **visibility terhadap lifecycle layanan** sekaligus menjadi channel customer-facing untuk membangun **engagement**.

Contoh future journey:

```text
Customer
   ↓
Customer Portal
   ↓
Melihat calibration/job
   ↓
Melihat progress/status
   ↓
Mendapat informasi sepanjang proses
   ↓
Calibration selesai
   ↓
Certificate available
   ↓
View / download certificate
   ↓
Customer feedback
```

Customer tidak hanya berinteraksi dengan Medcal ketika sertifikat sudah selesai.

---

# QR Code — Current Concept

Jangan langsung mengasumsikan:

```text
QR → Google Drive → Certificate PDF
```

Itu hanya **salah satu opsi**.

Alternatif yang perlu dipertimbangkan ketika Customer Portal dikerjakan:

```text
QR → Customer Portal → Certificate
```

atau mekanisme access lain yang sesuai.

Pertanyaan desain yang perlu dijawab nanti:

> Apakah QR merupakan **shortcut langsung menuju dokumen**, atau merupakan **entry point menuju Customer Portal/customer journey**?

**Belum ada keputusan final mengenai hal tersebut.**

---

# Option Comparison

## Option A — Direct Document / Google Drive

```text
QR
 ↓
Google Drive
 ↓
Certificate PDF
```

### Pros

* Sangat sederhana.
* Customer dapat langsung melihat sertifikat.
* Tidak membutuhkan Customer Portal hanya untuk membuka dokumen.
* Dapat bekerja tanpa login apabila permission dokumen memungkinkan.
* Implementasi relatif ringan.
* Tidak bergantung pada availability Customer Portal.

### Cons

* Access control relatif terbatas.
* Jika menggunakan `anyone with the link`, siapa pun yang memperoleh link/QR dapat mengakses dokumen.
* Customer experience berada di Google Drive, bukan Medcal.
* Tidak menyediakan progress/job visibility.
* Tidak menyediakan customer history.
* Tidak cocok sebagai foundation utama untuk customer engagement.
* Lifecycle dokumen bergantung pada external service.
* Jika file dipindahkan, URL berubah, atau permission berubah, QR yang sudah dicetak berpotensi bermasalah.

---

# Option B — Customer Portal

```text
QR
 ↓
Customer Portal
 ↓
Customer's calibration/job
 ├── Progress
 ├── Status
 ├── Information
 └── Certificate
```

### Pros

* Medcal tetap menjadi customer-facing channel.
* Customer dapat melihat progress kapan saja.
* Access control dapat dibuat customer-specific.
* Certificate menjadi bagian dari lifecycle layanan, bukan isolated document.
* Bisa dikembangkan menjadi:

  * calibration history
  * certificate history
  * device information
  * status/progress
  * customer feedback
  * fitur customer-facing lainnya.
* Branding dan UX tetap berada di Medcal.
* Memberikan foundation untuk customer engagement.

### Cons

* Lebih kompleks untuk dibangun dan dipelihara.
* Memerlukan authentication/access-control design.
* Customer experience harus dirancang agar tidak cumbersome.
* Jika Portal menjadi entry point utama, availability Portal menjadi dependency untuk customer access.

---

# Authentication / QR Access

Jangan berasumsi bahwa:

```text
QR → Portal
```

berarti customer harus login setiap kali scan.

Beberapa model dapat dipertimbangkan ketika Customer Portal dikerjakan.

## Model 1 — Portal + Login

```text
Scan QR
   ↓
Customer Portal
   ↓
Login
   ↓
Access
```

### Pros

* Security dan identity control jelas.

### Cons

* UX dapat terasa berat jika customer harus login setiap kali melakukan scan.

---

## Model 2 — Secure QR Token

```text
Scan QR
   ↓
Secure URL / Token
   ↓
Customer Portal
   ↓
Authorized Resource
```

Customer tidak harus memasukkan username/password setiap kali scan.

Token harus dirancang dengan memperhatikan security, expiration/revocation, scope, dan resource authorization.

---

## Model 3 — Session / Device-Aware Access

Scan pertama dapat melakukan authentication/access establishment, kemudian session yang masih valid dapat digunakan kembali.

**Belum ada keputusan final mengenai authentication model.**

> Do not implement one of these models based solely on this handoff.

---

# Customer Feedback / KAN Context

Dalam diskusi muncul informasi bahwa asesor/KAN meminta penyedia jasa kalibrasi menunjukkan review pelanggan.

Kesimpulan yang digunakan dalam diskusi:

* Yang relevan untuk compliance adalah **customer feedback**.
* ISO/IEC 17025 mensyaratkan laboratorium mencari feedback pelanggan, baik positif maupun negatif, kemudian menganalisis dan menggunakannya untuk improvement.
* Ini berbeda dengan kewajiban untuk menampilkan public review/testimonial.
* Jangan menjadikan **public review/testimonial** sebagai compliance requirement tanpa dasar spesifik dari requirement KAN yang berlaku.

Untuk future Customer Portal, feedback dapat menjadi bagian dari customer journey:

```text
Calibration Completed
        ↓
Customer views result/certificate
        ↓
Customer provides feedback
        ↓
Medcal stores feedback
        ↓
Internal / Quality
        ↓
Analysis → Improvement → Assessment Evidence
```

Feedback dan QR certificate adalah **dua concern yang berbeda**.

QR adalah mekanisme access.

Feedback adalah mekanisme customer experience measurement dan internal improvement/evidence.

---

# Important Product Direction

Customer Portal jangan diposisikan hanya sebagai:

> "tempat customer mengambil sertifikat."

Lebih tepat diposisikan sebagai:

> **Customer-facing channel untuk transparency, service experience, dan engagement.**

Contoh future journey:

```text
Customer
   ↓
Portal
   ↓
Service / Calibration
   ↓
Progress Visibility
   ↓
Completion
   ↓
Certificate
   ↓
Feedback
   ↓
Future Service
```

Dengan model ini, Medcal tetap menjadi **titik kontrol customer experience**, sementara sertifikatnya sendiri boleh saja berasal dari luar sistem.

---

# Scope Boundary — VERY IMPORTANT

**Do NOT implement anything from this handoff yet.**

Untuk saat ini:

* Customer Portal tetap **future plan**.
* Jangan membuat migration/schema berdasarkan diskusi ini.
* Jangan menambahkan `certificateNumber`, `certificateUrl`, atau field QR hanya berdasarkan handoff ini.
* Jangan mengimplementasikan Google Drive integration.
* Jangan mengimplementasikan QR authentication/token.
* Jangan mengubah existing Management Portal flow.
* Jangan menganggap Google Drive sebagai keputusan final.
* Jangan menganggap Customer Portal sebagai current implementation scope.

Handoff ini berfungsi sebagai **product/architecture direction untuk future Customer Portal**, bukan implementation task.

---

# Core Principle

Jangan terjebak pada requirement awal:

> "Customer scan QR → lihat sertifikat."

Requirement tersebut terlihat sederhana, tetapi ketika dibawa ke real customer journey, concern-nya meliputi:

```text
QR
 ↓
Identity / Access
 ↓
Customer Portal
 ↓
Authorization
 ↓
Customer / Job ownership
 ↓
Progress visibility
 ↓
Certificate availability
 ↓
Document access
 ↓
Feedback
 ↓
Audit / Compliance
```

Karena itu, ketika Customer Portal masuk ke roadmap, desain harus dilakukan sebagai **end-to-end customer journey**, bukan sebagai kumpulan fitur terpisah seperti "QR feature" atau "certificate link feature".

---

# Current Decision Summary

| Topic                    | Decision                                                    |
| ------------------------ | ----------------------------------------------------------- |
| Customer Portal          | **Future plan**                                             |
| Management Portal        | Tetap terpisah dari Customer Portal                         |
| Customer engagement      | Salah satu target Customer Portal                           |
| Progress visibility      | Salah satu fungsi utama Customer Portal                     |
| Certificate access       | Akan menjadi bagian dari future consideration               |
| QR Code                  | Belum ada final architecture                                |
| Google Drive             | Hanya opsi pembanding, bukan keputusan                      |
| Direct QR → Google Drive | Valid sebagai opsi, tetapi memiliki trade-off               |
| QR → Customer Portal     | Valid sebagai opsi, perlu didesain nanti                    |
| Login setiap scan        | **Tidak harus**, tergantung access model                    |
| Customer feedback        | Relevan untuk customer experience dan internal improvement  |
| Public customer reviews  | Jangan dianggap compliance requirement tanpa dasar spesifik |
| Migration/schema         | **Belum dilakukan**                                         |
| Implementation           | **Belum dilakukan**                                         |

## Bottom Line

Untuk sekarang, **park this topic**.

Ketika Customer Portal masuk roadmap, evaluasi ulang secara menyeluruh dengan pertanyaan:

> **"Bagaimana Medcal ingin mengelola seluruh customer journey dari customer pertama kali mendapatkan akses, melihat progress, menerima hasil/sertifikat, sampai memberikan feedback?"**

QR dan certificate delivery kemudian menjadi bagian dari desain tersebut, bukan sebaliknya.
