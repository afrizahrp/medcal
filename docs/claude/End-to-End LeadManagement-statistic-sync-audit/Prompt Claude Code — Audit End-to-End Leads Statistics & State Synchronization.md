# AUDIT END-TO-END — Leads Statistics, Message Status Transition & Client State Synchronization

## MODE: AUDIT ONLY

Lakukan **audit menyeluruh terlebih dahulu**.

**JANGAN mengubah kode apa pun.**

Jangan:
- refactor
- install Zustand
- menghapus Zustand
- mengubah React Query
- mengubah API
- mengubah database
- mengubah schema
- mengubah UI
- memperbaiki bug
- membuat migration

Saya ingin mengetahui **arsitektur dan root cause terlebih dahulu**.

Setelah audit selesai, berikan rekomendasi implementasi. Saya akan memberikan instruksi implementasi pada tahap berikutnya.

---

# 1. BUSINESS SCENARIO YANG HARUS DIAUDIT

Halaman yang terlibat:

```text
Leads List
Leads/[id]
Chat/[id]
```

Statistic card pada Leads page memiliki:

```text
Total
Pending
Read
Replied
Closed
```

Statistic harus merefleksikan **ContactMessage workflow** secara konsisten.

---

# 2. EXPECTED BUSINESS FLOW

Audit seluruh source code terhadap expected behavior berikut.

## STATE 0 — BELUM ADA MESSAGE

Initial state:

```text
Total   = 0
Pending = 0
Read    = 0
Replied = 0
Closed  = 0
```

---

# 3. NEW MESSAGE MASUK

Message dapat berasal dari seluruh source berikut:

```text
1. Contact Message / Contact Form
2. WhatsApp Message
3. Web Chat
```

Jangan mengasumsikan ketiganya menggunakan implementation yang sama.

Trace masing-masing source.

Ketika sebuah message baru masuk:

```text
Total   = N
Pending = N
Read    = 0
Replied = 0
Closed  = 0
```

Contoh:

Message pertama masuk:

```text
Total   = 1
Pending = 1
```

Message kedua masuk:

```text
Total   = 2
Pending = 2
```

dan seterusnya.

**Total harus bertambah berdasarkan ContactMessage yang masuk, bukan berdasarkan jumlah ChatSession.**

---

# 4. ADMIN MEMBUKA LEADS/[id]

Ketika admin membuka detail lead/message:

```text
PENDING → READ
```

Expected statistic:

Misalnya:

```text
Total   = 4
Pending = 4
Read    = 0
Closed  = 0
```

Admin membuka satu message:

```text
Total   = 4
Pending = 3
Read    = 1
Closed  = 0
```

Admin membuka message kedua:

```text
Total   = 4
Pending = 2
Read    = 2
Closed  = 0
```

dan seterusnya.

**Jangan mengubah REPLIED atau CLOSED menjadi READ.**

Status transition harus tetap:

```text
PENDING → READ
READ    → READ
REPLIED → REPLIED
CLOSED  → CLOSED
```

---

# 5. ADMIN MEMBUKA WEB CHAT/[id]

Web Chat juga harus mengikuti workflow ContactMessage.

Ketika admin membuka:

```text
Chat/[id]
```

dan linked ContactMessage masih:

```text
PENDING
```

maka:

```text
PENDING → READ
```

Statistic Leads harus ikut berubah.

Contoh:

```text
Before:

Total   = 4
Pending = 4
Read    = 0
Closed  = 0
```

Admin membuka Chat:

```text
After:

Total   = 4
Pending = 3
Read    = 1
Closed  = 0
```

Audit apakah implementation yang baru dibuat untuk Web Chat `markRead()` benar-benar membuat perubahan tersebut terlihat di:

1. Leads List
2. Leads/[id]
3. Chat/[id]

---

# 6. ADMIN MENUTUP / END CHAT

Ketika admin selesai dan menutup Web Chat:

```text
ContactMessage.status
```

harus mengikuti existing fix:

```text
PENDING → CLOSED
READ    → CLOSED
REPLIED → CLOSED
CLOSED  → CLOSED
```

Tetapi jangan mengubah business rule yang sudah ada.

Expected statistic:

Misalnya ada 4 message:

```text
Total   = 4
Pending = 3
Read    = 1
Closed  = 0
```

Admin menutup message yang sudah dibaca:

```text
Total   = 4
Pending = 3
Read    = 0
Closed  = 1
```

Jika ada 2 message yang sudah closed:

```text
Total   = 4
Pending = 2
Read    = 0
Closed  = 2
```

**Total tidak berubah ketika status berubah.**

Yang berubah hanya distribusi status.

---

# 7. CRITICAL REQUIREMENT — NO BROWSER RELOAD

Semua transition di atas harus tercermin **tanpa user melakukan browser reload**.

Audit secara khusus:

```text
New message arrives
        ↓
Leads List statistic update?

Admin opens Leads/[id]
        ↓
Leads List statistic update?

Admin opens Chat/[id]
        ↓
Leads List statistic update?

Admin closes Chat/[id]
        ↓
Leads List statistic update?

Admin berada di Leads/[id]
        ↓
Statistic cards update?

Admin berada di Chat/[id]
        ↓
Statistic cards update?
```

Cari apakah perubahan hanya terlihat setelah:

```text
F5
Ctrl + R
navigate away → back
```

Jika iya, itu harus dianggap sebagai synchronization defect.

---

# 8. AUDIT SEMUA MESSAGE ENTRY POINT

Jangan hanya audit Web Chat.

Trace bagaimana ContactMessage dibuat dari:

## A. Contact Form

Cari:

```text
submit contact form
        ↓
API
        ↓
ContactMessage creation
        ↓
status
        ↓
statistics
        ↓
frontend update
```

## B. WhatsApp

Cari:

```text
incoming WhatsApp message
        ↓
API / webhook / service
        ↓
ContactMessage creation/update
        ↓
status
        ↓
statistics
        ↓
frontend update
```

## C. Web Chat

Cari:

```text
new Web Chat
        ↓
ChatSession
        ↓
ContactMessage
        ↓
contactMessageId
        ↓
statistics
```

Pastikan ketiga source tersebut akhirnya memiliki behavior statistic yang konsisten.

---

# 9. IDENTIFY SOURCE OF TRUTH

Tentukan dengan jelas:

> Apa sebenarnya source of truth untuk statistic cards?

Saya mengharapkan audit menjawab secara eksplisit apakah:

```text
ContactMessage.status
```

adalah source of truth.

Jangan hanya melihat frontend.

Trace sampai:

```text
Database
→ API
→ query
→ React Query/cache
→ component
```

---

# 10. AUDIT STATISTIC API

Cari endpoint yang menghasilkan:

```text
Total
Pending
Read
Replied
Closed
```

Trace:

```text
UI
 ↓
hook
 ↓
query key
 ↓
API endpoint
 ↓
service
 ↓
Prisma query
 ↓
ContactMessage
```

Pastikan:

- `Total` dihitung benar
- `Pending` dari status PENDING
- `Read` dari status READ
- `Replied` dari status REPLIED
- `Closed` dari status CLOSED

Audit apakah terdapat multiple implementation untuk statistic yang sama.

Misalnya:

```text
Leads List → API A
Leads/[id] → API B
Chat → API C
```

Jika ada, tentukan apakah hal tersebut menyebabkan angka bisa berbeda.

---

# 11. AUDIT QUERY KEY

Ini sangat penting.

Cari seluruh query key yang berhubungan dengan:

```text
contact messages
leads
statistics
chat
unread
```

Buat mapping:

| Query | Query Key | Source | Dipakai di |
|---|---|---|---|
| Statistics | ? | ? | Leads List |
| Contact Messages | ? | ? | Leads List |
| Lead Detail | ? | ? | Leads/[id] |
| Chat | ? | ? | Chat/[id] |

Cari kemungkinan:

```text
Statistic API sudah benar
tetapi query cache tidak di-invalidate.
```

---

# 12. AUDIT EVENT / INVALIDATION SYSTEM

Cari semua mechanism yang saat ini digunakan untuk memberi tahu halaman lain bahwa data berubah.

Misalnya:

```text
notifyContactMessagesChanged()
notifyUnreadCountChanged()
session_closed
socket events
React Query invalidateQueries()
refetch()
queryClient.setQueryData()
custom event
```

Buat dependency map:

```text
Event
   ↓
Listener
   ↓
Query invalidated
   ↓
Component updated
```

Audit khusus:

### New ContactMessage

Apakah event tersebut meng-update:

```text
Leads List statistics?
Leads List table?
Leads/[id]?
```

### markRead

Apakah event tersebut meng-update:

```text
Leads List statistics?
Leads/[id] statistics?
Chat?
```

### close

Apakah event tersebut meng-update:

```text
Leads List statistics?
Leads/[id]?
Chat?
```

---

# 13. AUDIT REACT QUERY / SERVER STATE

Identifikasi apakah project menggunakan:

```text
TanStack Query / React Query
SWR
custom fetch state
Zustand
Context
local state
```

Untuk masing-masing data, tentukan apakah termasuk:

```text
Server state
atau
Client/UI state
```

Statistic cards adalah **server-derived state**.

Cari apakah project sudah memiliki mekanisme yang cukup untuk mengelola server state tersebut.

---

# 14. PERTANYAAN UTAMA: APAKAH SUDAH SAATNYA ZUSTAND?

Saya ingin Anda **mengaudit kebutuhan Zustand secara objektif**.

Jangan menjawab:

> "Zustand bagus, jadi gunakan Zustand."

Dan jangan juga menjawab:

> "Tidak perlu Zustand karena React Query cukup."

Buktikan berdasarkan architecture codebase saat ini.

Evaluasi:

### A. Apakah masalah sebenarnya adalah server-state synchronization?

Jika ya, jelaskan apakah React Query/query invalidation sudah cukup.

### B. Apakah ada terlalu banyak custom event?

Contoh:

```text
notifyContactMessagesChanged()
notifyUnreadCountChanged()
custom DOM events
socket event listeners
manual refetch
```

Hitung dan petakan complexity-nya.

### C. Apakah terdapat duplicated state?

Misalnya:

```text
ContactMessage status
+
ChatSession read state
+
local React state
+
React Query cache
+
Zustand state
```

Cari apakah data yang sama disimpan di beberapa tempat.

### D. Apakah Zustand sudah digunakan?

Jika ya:

- di mana?
- untuk state apa?
- apakah ada state server yang seharusnya tidak berada di Zustand?
- apakah penggunaan Zustand sekarang konsisten?

### E. Apakah Zustand akan benar-benar menyelesaikan masalah?

Bandingkan dua architecture:

```text
OPTION A

Server
 ↓
React Query
 ↓
invalidate/refetch
 ↓
UI
```

versus:

```text
OPTION B

Server
 ↓
React Query
 ↓
Zustand
 ↓
event synchronization
 ↓
UI
```

Jelaskan trade-off.

---

# 15. ZUSTAND DECISION MATRIX

Berikan keputusan menggunakan matrix:

| Requirement | React Query | Zustand | Current Architecture |
|---|---|---|---|
| Server statistics | ? | ? | ? |
| Cache | ? | ? | ? |
| Cross-component update | ? | ? | ? |
| WebSocket event | ? | ? | ? |
| Optimistic update | ? | ? | ? |
| Derived statistics | ? | ? | ? |
| UI-only state | ? | ? | ? |
| Avoid duplicated server state | ? | ? | ? |
| Complexity | ? | ? | ? |

Kemudian berikan verdict:

```text
Zustand:
[ ] Tidak diperlukan
[ ] Berguna tetapi belum diperlukan
[ ] Mulai layak digunakan
[ ] Sangat direkomendasikan
```

**Berikan alasan berdasarkan codebase, bukan preferensi pribadi.**

---

# 16. AUDIT CROSS-PAGE CONSISTENCY

Ini wajib.

Buat state transition table:

| Action | Leads List | Leads/[id] | Chat/[id] |
|---|---|---|---|
| New ContactMessage | ? | ? | N/A |
| New WhatsApp | ? | ? | ? |
| New Web Chat | ? | ? | ? |
| Open Leads/[id] | ? | ? | ? |
| Open Chat/[id] | ? | ? | ? |
| Mark Read | ? | ? | ? |
| Reply | ? | ? | ? |
| Close Chat | ? | ? | ? |

Isi dengan:

```text
UPDATED
STALE
REFETCH
INVALIDATED
SOCKET
EVENT
```

---

# 17. HISTORICAL DATA

Audit juga apakah terdapat data historis yang dapat menyebabkan statistic terlihat salah.

Contoh:

```text
ChatSession.lastReadByAdminAt != null
ContactMessage.status = PENDING
```

atau:

```text
ChatSession.status = CLOSED
ContactMessage.status = PENDING
```

Cari kemungkinan mismatch tersebut.

**Jangan melakukan UPDATE database.**

Hanya report:

```text
jumlah record affected
contoh record
reason
recommended backfill
```

---

# 18. REAL-TIME REQUIREMENT

Periksa apakah WebSocket sudah digunakan untuk:

```text
new message
session closed
mark read
```

Jika iya, tentukan apakah statistic cards seharusnya diperbarui melalui:

```text
socket event
→ query invalidation
```

atau:

```text
socket event
→ direct cache update
```

atau mekanisme existing lainnya.

Jangan langsung memilih.

Audit dulu pattern yang sudah ada.

---

# 19. PERFORMANCE

Audit apakah solusi synchronization sekarang menyebabkan:

- duplicate API request
- refetch berulang
- infinite invalidation
- event loop
- race condition
- stale cache
- unnecessary re-render
- request storm ketika banyak message masuk

Khususnya ketika:

```text
10 message masuk cepat
```

atau:

```text
markRead()
+
session_closed
+
new message
```

terjadi berdekatan.

---

# 20. ACCEPTANCE CRITERIA YANG HARUS DIVERIFIKASI

Audit harus menentukan apakah architecture saat ini mampu memenuhi seluruh criteria:

### AC-01

Initial:

```text
Total = 0
```

### AC-02

Satu ContactMessage masuk:

```text
Total = 1
Pending = 1
```

tanpa browser reload.

### AC-03

N ContactMessage masuk:

```text
Total = N
Pending = N
```

tanpa browser reload.

### AC-04

Admin membuka satu pending message:

```text
Pending = N - 1
Read = 1
```

tanpa browser reload.

### AC-05

Admin membuka Web Chat yang linked dengan ContactMessage PENDING:

```text
PENDING → READ
```

dan Leads statistics ikut berubah.

### AC-06

Admin membuka message yang sudah REPLIED:

```text
REPLIED → REPLIED
```

### AC-07

Admin membuka message yang sudah CLOSED:

```text
CLOSED → CLOSED
```

### AC-08

Admin menutup satu conversation yang sudah READ:

```text
Read ↓
Closed ↑
```

dan Total tetap.

### AC-09

Jika terdapat:

```text
N total
X pending
Y closed
```

maka:

```text
Total = N
Pending = X
Closed = Y
```

dan distribusi status konsisten di seluruh halaman.

### AC-10

Semua perubahan terlihat tanpa:

```text
F5
Ctrl + R
hard reload
navigate away → back
```

### AC-11

Leads List dan Leads/[id] tidak boleh menampilkan statistic berbeda untuk data yang sama hanya karena cache masing-masing berbeda.

### AC-12

Chat/[id] dan Leads/[id] tidak boleh memiliki status ContactMessage yang berbeda.

---

# 21. OUTPUT REPORT

Berikan laporan dengan struktur berikut.

## 1. Executive Verdict

Jawab langsung:

> Apakah statistic flow sekarang sudah benar end-to-end?

Pilih:

```text
GREEN
YELLOW
RED
```

## 2. Current Architecture

Gambarkan:

```text
Message Source
    ↓
ContactMessage
    ↓
API
    ↓
React Query / State
    ↓
Leads List
Leads/[id]
Chat/[id]
```

## 3. Status Lifecycle

Gambarkan actual implementation:

```text
PENDING
   ↓
READ
   ↓
REPLIED
   ↓
CLOSED
```

Tunjukkan bagian mana yang otomatis dan mana yang manual.

## 4. Statistic Source of Truth

Jelaskan source of truth dan query yang digunakan.

## 5. Synchronization Matrix

Gunakan tabel:

| Event | Backend | Cache | Leads List | Leads/[id] | Chat |
|---|---|---|---|---|---|

## 6. Bugs / Gaps

Pisahkan:

```text
CRITICAL
HIGH
MEDIUM
LOW
```

## 7. Zustand Assessment

Jawab secara eksplisit:

> Apakah sekarang sudah saatnya menggunakan Zustand?

Berikan verdict berdasarkan architecture aktual.

Jelaskan juga apakah Zustand sebaiknya digunakan untuk:

```text
server state
UI state
event coordination
chat state
statistics
```

Jangan mencampuradukkan server state dengan client UI state.

## 8. Recommended Architecture

Berikan architecture yang paling sederhana yang mampu memenuhi requirement.

Bandingkan:

```text
Current
vs
React Query + event invalidation
vs
React Query + Zustand
```

## 9. Recommended Implementation Plan

Jika terdapat gap, berikan urutan implementasi paling aman.

Contoh:

```text
1. Fix backend transition
2. Normalize event
3. Invalidate statistics
4. Invalidate list
5. Test
6. Manual verification
```

Tetapi **jangan implementasi**.

## 10. Files Involved

Daftar file yang relevan:

```text
path
reason
```

## 11. Tests Needed

Berikan test matrix untuk:

- new message
- pending
- read
- replied
- closed
- chat markRead
- chat close
- statistics
- cache invalidation
- realtime update

## 12. Historical Data

Laporkan apakah diperlukan backfill.

**Jangan melakukan backfill.**

---

# FINAL RULES

1. **Audit first. No code changes.**
2. Jangan menganggap semua message source memiliki implementation yang sama.
3. Jangan mengubah statistic API hanya untuk memperbaiki frontend.
4. Jangan menggunakan `ChatSession.status` sebagai pengganti `ContactMessage.status`.
5. Jangan membuat `REPLIED → READ`.
6. Jangan membuat `CLOSED → READ`.
7. Jangan menganggap browser reload sebagai synchronization mechanism.
8. Jangan merekomendasikan Zustand hanya karena banyak component membutuhkan data yang sama.
9. Bedakan dengan jelas **server state** dan **client/UI state**.
10. Jika React Query sudah mampu menjadi source of truth untuk server state, jelaskan mengapa Zustand tidak diperlukan.
11. Jika custom event/invalidation architecture sudah terlalu kompleks dan Zustand benar-benar memberikan manfaat, buktikan dengan evidence dari codebase.
12. Jangan install atau menambahkan dependency.
13. Jangan mengubah kode.
14. Jangan mengubah database.
15. Jangan melakukan backfill.

## Prinsip utama audit

Saya tidak mencari sekadar:

> "Angka statistic sudah berubah."

Saya ingin memastikan:

> **Satu perubahan status di backend memiliki satu source of truth dan seluruh UI yang relevan menerima perubahan tersebut secara konsisten, realtime, tanpa browser reload dan tanpa duplicated state.**

Fokus utama audit adalah menemukan apakah architecture saat ini sudah mampu melakukan itu secara reliable — dan apakah kita masih perlu mempertahankan banyak mekanisme event/invalidation terpisah atau sudah waktunya merapikannya.