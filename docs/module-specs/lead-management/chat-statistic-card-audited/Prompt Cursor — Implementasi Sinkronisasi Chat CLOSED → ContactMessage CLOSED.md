# IMPLEMENTATION TASK — Sync Chat CLOSED → ContactMessage CLOSED

Implementasikan **HANYA** fix yang dijelaskan di bawah ini.

Root cause sudah diaudit dan dikonfirmasi:

- `ChatSession.status` adalah source of truth untuk lifecycle Chat.
- `ContactMessage.status` adalah source of truth untuk workflow Pesan Kontak.
- Keduanya terhubung melalui `ChatSession.contactMessageId`.
- Saat admin melakukan `End chat`, saat ini hanya `ChatSession.status` yang berubah menjadi `CLOSED`.
- `ContactMessage.status` tetap `PENDING`.
- Akibatnya halaman Pesan Kontak tetap menghitung contact message tersebut sebagai `Pending`, bukan `Closed`.

Referensi hasil audit:
- `ChatSessionsService.closeSession()` hanya update `ChatSession`.
- `ContactMessagesService.getStatistics()` menghitung statistik dari `ContactMessage.status`.
- Tidak ada synchronization saat close chat.

## TUJUAN

Ketika admin melakukan:

```text
Chat → End chat
```

dan `ChatSession.contactMessageId` memiliki nilai, maka:

```text
ChatSession.status      → CLOSED
ContactMessage.status   → CLOSED
```

Keduanya harus dilakukan secara **atomic transaction**.

---

# 1. SCOPE — WAJIB DIPATUHI

Implementasi HANYA mencakup:

1. Synchronization `ChatSession.status = CLOSED`
2. Synchronization linked `ContactMessage.status = CLOSED`
3. Atomic transaction
4. Test untuk behavior tersebut
5. Query invalidation/refetch yang diperlukan agar UI langsung merefleksikan perubahan
6. Regression verification

## JANGAN mengubah hal-hal berikut

Jangan:

- mengubah `getStatistics()` agar membaca `ChatSession`
- mengubah source of truth statistik
- mengubah enum status
- mengubah Prisma schema jika sebenarnya tidak diperlukan
- membuat migration jika tidak diperlukan
- mengubah Lead status
- mengubah Lead assignment
- mengubah notification business logic
- mengubah FCM
- mengubah ChatSession lifecycle selain synchronization yang diperlukan
- mengubah `markRead()`
- mengubah behavior `PENDING → READ`
- mengimplementasikan synchronization READ sebagai bagian task ini
- mengubah Email / WhatsApp behavior
- mengubah Contact Form behavior
- melakukan refactor besar
- melakukan cleanup unrelated
- mengubah UI/layout
- memperbaiki issue lain yang ditemukan

**Jika menemukan issue lain selama implementasi, jangan ikut diperbaiki. Laporkan sebagai follow-up item saja.**

---

# 2. IMPLEMENTASI BACKEND

Cari implementation aktual:

```text
ChatSessionsService.closeSession()
```

Saat ini behavior-nya kira-kira:

```text
ChatSession
    status = CLOSED
    closedAt = now()
```

Ubah menjadi transaction yang secara atomic melakukan:

```text
BEGIN TRANSACTION

1. Update ChatSession
   status = CLOSED
   closedAt = now()

2. Jika session.contactMessageId != null:
   Update linked ContactMessage
   status = CLOSED

COMMIT
```

Gunakan transaction mechanism yang sudah digunakan project.

Jangan memperkenalkan abstraction baru jika tidak diperlukan.

---

# 3. CONTACT MESSAGE UPDATE

Update hanya `ContactMessage` yang benar-benar linked dengan session tersebut.

Relationship yang harus digunakan:

```text
ChatSession.contactMessageId
        ↓
ContactMessage.id
```

**Jangan mencari ContactMessage berdasarkan:**

- email
- visitorName
- phone
- latest message
- company
- fuzzy matching
- timestamp

Gunakan foreign-key relationship yang sudah ada.

---

# 4. STATUS TRANSITION

Saat close chat, linked `ContactMessage` harus menjadi:

```text
CLOSED
```

Guard yang direkomendasikan:

```text
status != CLOSED
```

sehingga operasi close bersifat idempotent.

Expected behavior:

```text
PENDING  → CLOSED
READ     → CLOSED
REPLIED  → CLOSED
CLOSED   → CLOSED
```

Jangan membuat status transition lain.

Secara khusus:

**JANGAN mengubah logic `PENDING → READ`.**

Itu bukan bagian task ini.

---

# 5. ATOMICITY

Ini penting.

Jangan melakukan:

```text
update ChatSession

kemudian

update ContactMessage
```

sebagai dua operasi database independen.

Gunakan transaction sehingga:

```text
ChatSession update berhasil
+
ContactMessage update berhasil
```

atau:

```text
keduanya rollback
```

Tidak boleh ada kondisi:

```text
ChatSession = CLOSED
ContactMessage = PENDING
```

akibat partial failure dari operation `closeSession()`.

---

# 6. NULL contactMessageId

Jika:

```text
ChatSession.contactMessageId = null
```

maka:

- ChatSession tetap boleh ditutup
- Jangan membuat ContactMessage baru
- Jangan mencari ContactMessage lain
- Jangan melakukan fallback berdasarkan email/name
- Jangan error hanya karena tidak ada ContactMessage

Expected:

```text
ChatSession → CLOSED
ContactMessage → tidak ada perubahan
```

---

# 7. IDEMPOTENCY

Perhatikan kemungkinan `closeSession()` dipanggil ketika session sudah `CLOSED`.

Behavior tidak boleh menghasilkan data corruption atau membuat ContactMessage menjadi state yang salah.

Expected:

```text
ChatSession CLOSED
ContactMessage CLOSED
```

tetap valid.

Jangan membuat duplicate ContactMessage.

Jangan membuat timestamp tambahan yang tidak diperlukan jika existing implementation sudah memiliki guard/business behavior untuk kondisi tersebut.

Pertahankan behavior existing sejauh mungkin.

---

# 8. FRONTEND CACHE / QUERY INVALIDATION

Setelah backend fix, pastikan UI tidak menampilkan data lama setelah End Chat.

Cari mutation/event flow yang dipicu oleh:

```text
close_session
session_closed
```

Jika architecture existing menggunakan React Query, invalidate query yang memang relevan.

Minimal evaluasi:

```text
contact-messages-statistics
contact-messages list/query
```

Tujuannya:

setelah Chat ditutup:

```text
Pesan Kontak:

Pending ↓
Closed  ↑
```

tanpa user harus melakukan hard refresh.

Namun:

**Jangan mengubah global cache architecture.**

Gunakan mekanisme invalidation/refetch yang sudah digunakan project.

Jika event architecture saat ini lebih tepat untuk melakukan refetch melalui existing mechanism, gunakan pola existing tersebut.

---

# 9. TEST WAJIB

Tambahkan atau update test pada service yang relevan.

Minimal harus ada test untuk:

## Test 1 — Close linked ContactMessage

Setup:

```text
ChatSession.status = OPEN
ChatSession.contactMessageId = existing ContactMessage
ContactMessage.status = PENDING
```

Call:

```text
closeSession()
```

Assert:

```text
ChatSession.status === CLOSED
ChatSession.closedAt !== null
ContactMessage.status === CLOSED
```

---

## Test 2 — READ → CLOSED

Setup:

```text
ContactMessage.status = READ
```

Close session.

Assert:

```text
ContactMessage.status === CLOSED
```

---

## Test 3 — REPLIED → CLOSED

Setup:

```text
ContactMessage.status = REPLIED
```

Close session.

Assert:

```text
ContactMessage.status === CLOSED
```

---

## Test 4 — Already CLOSED

Setup:

```text
ContactMessage.status = CLOSED
ChatSession.status = OPEN
```

Close session.

Assert:

```text
ContactMessage.status === CLOSED
ChatSession.status === CLOSED
```

Tidak ada duplicate record.

---

## Test 5 — No contactMessageId

Setup:

```text
ChatSession.contactMessageId = null
```

Close session.

Assert:

```text
ChatSession.status === CLOSED
```

dan operation tidak gagal hanya karena tidak ada ContactMessage.

---

## Test 6 — Statistics behavior

Pastikan behavior berikut ter-cover:

Sebelum close:

```text
Pending = N
Closed  = X
```

Setelah close:

```text
Pending = N - 1
Closed  = X + 1
```

untuk linked ContactMessage yang sebelumnya bukan `CLOSED`.

Test harus memverifikasi bahwa statistik tetap dihitung dari:

```text
ContactMessage.status
```

Bukan dari `ChatSession.status`.

---

# 10. TRANSACTION FAILURE TEST

Jika test infrastructure memungkinkan tanpa membuat test menjadi artificial, tambahkan test yang membuktikan atomicity.

Expected:

Jika update ContactMessage gagal:

```text
ChatSession tidak boleh tersimpan sebagai CLOSED
```

dan vice versa.

Tujuan:

```text
NO PARTIAL COMMIT
```

Jika testing transaction failure membutuhkan mocking yang terlalu kompleks dan tidak sesuai pola existing project, jangan membuat test infrastructure baru yang besar.

Dalam laporan, cukup jelaskan bagaimana atomicity dijamin oleh transaction implementation.

---

# 11. ACCEPTANCE CRITERIA

Implementasi dianggap **BERHASIL** hanya jika seluruh kondisi berikut terpenuhi.

### AC-01 — Chat tetap CLOSED

Setelah End Chat:

```text
ChatSession.status = CLOSED
```

dan existing behavior Chat tidak berubah.

### AC-02 — Linked ContactMessage menjadi CLOSED

Jika:

```text
ChatSession.contactMessageId != null
```

maka:

```text
ContactMessage.status = CLOSED
```

### AC-03 — Atomic

Update ChatSession dan ContactMessage terjadi dalam **satu database transaction**.

### AC-04 — Correct relationship

Synchronization menggunakan:

```text
ChatSession.contactMessageId → ContactMessage.id
```

Tidak menggunakan email/name/heuristic matching.

### AC-05 — No ContactMessage creation

Close Chat tidak boleh membuat ContactMessage baru.

### AC-06 — Null-safe

Session tanpa `contactMessageId` tetap dapat ditutup dengan normal.

### AC-07 — Idempotent

Closing session yang sudah CLOSED tidak menyebabkan:

- duplicate ContactMessage
- status corruption
- exception yang tidak diperlukan

### AC-08 — Statistic correct

Setelah close:

```text
ContactMessage.status = CLOSED
```

sehingga:

```text
Closed statistic bertambah
Pending statistic berkurang
```

sesuai jumlah record yang berubah.

### AC-09 — UI refresh

Setelah End Chat, halaman Pesan Kontak tidak membutuhkan hard refresh untuk mendapatkan statistic terbaru, menggunakan mekanisme query invalidation/refetch existing project.

### AC-10 — Source of truth tetap benar

Jangan mengubah:

```text
ContactMessage statistics
```

menjadi query terhadap `ChatSession`.

### AC-11 — Read behavior unchanged

Task ini **tidak mengubah** behavior:

```text
Chat markRead
ContactMessage PENDING → READ
```

Itu tetap seperti existing implementation.

### AC-12 — Lead behavior unchanged

Tidak ada perubahan terhadap:

```text
Lead.status
Lead assignment
Lead lifecycle
```

### AC-13 — Other channels unchanged

Tidak ada perubahan terhadap status workflow:

```text
Email
WhatsApp
Contact Form
```

### AC-14 — Existing tests pass

Semua test yang relevan harus tetap pass.

### AC-15 — No unrelated changes

Diff harus minimal dan hanya berisi perubahan yang diperlukan untuk task ini.

---

# 12. VERIFICATION

Setelah implementasi:

1. Jalankan unit/service tests yang relevan.
2. Jalankan test terkait ContactMessage statistics.
3. Jalankan test terkait ChatSession close.
4. Jalankan typecheck.
5. Jalankan lint jika project menggunakan lint.
6. Periksa git diff.
7. Pastikan tidak ada perubahan unrelated.

Jika environment memungkinkan, lakukan manual verification:

```text
1. Buat/ambil Web Chat yang memiliki ContactMessage
2. Pastikan ContactMessage = PENDING
3. Buka Chat
4. Klik End Chat
5. Pastikan Chat = CLOSED
6. Buka Pesan Kontak
7. Pastikan row = CLOSED
8. Pastikan Pending berkurang
9. Pastikan Closed bertambah
10. Pastikan tidak perlu hard refresh
```

---

# 13. DATA VERIFICATION — DINO & JIHAN

Setelah implementasi, jika database environment tersedia, verifikasi record:

```text
dino@gmail.com
jihan@gmail.com
```

Expected:

```text
ChatSession.status       = CLOSED
ContactMessage.status    = CLOSED
```

Gunakan relationship:

```text
ChatSession.contactMessageId
```

untuk memastikan record yang benar yang berubah.

Jangan hanya mencocokkan berdasarkan email.

---

# 14. FINAL REPORT

Setelah selesai, jangan hanya mengatakan:

> "Done."

Berikan laporan:

## 1. Root cause addressed

Apa yang diperbaiki.

## 2. Files changed

Daftar file yang benar-benar diubah.

## 3. Exact implementation

Jelaskan bagaimana:

```text
ChatSession
+
ContactMessage
```

sekarang di-update secara atomic.

## 4. Tests added/changed

Daftar test dan hasilnya.

## 5. Verification result

Contoh:

```text
Typecheck: PASS
Unit tests: PASS
Relevant tests: PASS
Lint: PASS
```

Jika ada yang gagal, tuliskan **failure sebenarnya**. Jangan menyatakan PASS jika belum benar-benar dijalankan.

## 6. Acceptance criteria

Buat checklist:

```text
[PASS] AC-01 Chat remains CLOSED
[PASS] AC-02 ContactMessage becomes CLOSED
[PASS] AC-03 Atomic transaction
...
```

Jangan menandai PASS berdasarkan asumsi.

## 7. Out of scope

Secara eksplisit nyatakan bahwa task ini **tidak mengubah**:

```text
markRead synchronization
Lead status
assignment
notification business logic
Email
WhatsApp
Contact Form
```

## 8. Remaining follow-up

Jika masih ada issue seperti:

```text
Chat markRead → ContactMessage tetap PENDING
```

laporkan sebagai **FOLLOW-UP**, jangan implementasikan sekarang.

# FINAL RULE

**Jangan memperluas scope.**

Jika menemukan sesuatu yang menurut Anda "sebaiknya sekalian diperbaiki", jangan implementasikan.

Laporkan saja sebagai:

```text
FOLLOW-UP — NOT IMPLEMENTED
```

Prioritas task ini hanya satu:

> **Ketika Web Chat ditutup, linked ContactMessage harus ikut menjadi CLOSED secara atomic, sehingga status row dan statistic Pesan Kontak konsisten dengan lifecycle Chat.**