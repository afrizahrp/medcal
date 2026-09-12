# AUDIT REPORT — Leads Statistics, Message Status Transition & Client State Synchronization

Audit dilakukan: 2026-08-25. Mode: **AUDIT ONLY** — tidak ada kode/skema/database yang diubah. Query database yang dijalankan bersifat read-only (SELECT/COUNT saja).

---

## 1. Executive Verdict

> **YELLOW**

Pipeline inti (ContactMessage sebagai source of truth, satu endpoint statistik, satu mekanisme invalidation React Query di level shell) sudah **solid dan konsisten** untuk kombinasi *Leads List ↔ Chat/[id]*. Tidak ditemukan duplikasi implementasi statistik, tidak ada race condition struktural, dan tidak ada regresi status (REPLIED/CLOSED tidak pernah ditimpa balik ke READ — dijaga eksplisit oleh guard `where status: "PENDING"` di backend dan dikonfirmasi oleh unit test).

Namun ada **dua gap konkret** yang membuatnya tidak GREEN:

1. **Leads/[id] tidak mengikuti pola arsitektur yang sama** — halaman ini tidak memakai React Query dan tidak subscribe ke event bus yang menyinkronkan Leads List/Chat. Ia hanya konsisten dengan dirinya sendiri (re-fetch lokal setelah PATCH), tapi tidak menerima update dari luar (mis. Chat menutup sesi yang lead-nya sedang dibuka di tab lain) tanpa reload/navigasi ulang.
2. **Membuka Leads/[id] tidak otomatis men-trigger PENDING → READ** — berbeda dari Chat/[id] yang sudah benar melakukan ini. Saat ini transisi READ di Leads/[id] hanya terjadi jika admin memilih status secara manual dari dropdown.

Tidak ada isu CRITICAL (tidak ada korupsi data, tidak ada duplicate statistic API, historical data bersih — lihat §12). Root cause dari kedua gap adalah **inkonsistensi implementasi antar-halaman**, bukan kerusakan pada mekanisme sinkronisasi itu sendiri.

---

## 2. Current Architecture

```
Message Source                     ContactMessage                  API                              React Query / State                    UI
───────────────                    ──────────────                  ───                              ────────────────────                    ──

Contact Form  ─┐
               │  POST /public/contact-messages
WhatsApp form ─┤  POST /public/whatsapp-lead      (apps/web-api,    ┐
               │                                   edge/captcha)    │
Web Chat      ─┘  POST /public/chat-sessions                       │
                                                                     ▼
                              forwards → POST /internal/contact-messages / /internal/chat-sessions
                                                                     │
                                                       ContactMessagesService.create()
                                                       (status = PENDING, default, ALL 3 sources)
                                                                     │
                                                                     ▼
                                                          ContactMessage row (Prisma/Postgres)
                                                                     │
                              ┌──────────────────────────────────────┼───────────────────────────────────┐
                              │                                      │                                    │
                     GET /contact-messages                GET /contact-messages/statistics       ChatSessionsService
                     (list, paginated)                     (groupBy status → 4 buckets)           .markRead / .closeSession
                              │                                      │                             (transactional status writes)
                              ▼                                      ▼                                    │
                  useContactMessagesQuery                 useContactStatisticsQuery                       │
                  key ["contact-messages",...]             key ["contact-messages-statistics"]             │
                              │                                      │                                     │
                              ▼                                      ▼                                     ▼
                        Leads List table              Leads List MessageSummaryCards          notifyContactMessagesChanged()
                     (leads-page-client.tsx)                                                    (contact-messages-sync.ts,
                                                                                                  in-browser-tab pub/sub)
                                                                                                             │
                                                                                                             ▼
                                                                                        management-shell.tsx (mounted at
                                                                                        shell level, persists across nav)
                                                                                        → invalidateQueries(["contact-messages"])
                                                                                        → invalidateQueries(["contact-messages-statistics"])
                                                                                                             │
                                                                                                             ▼
                                                                                        Leads List refetches (even if unmounted)

Leads/[id]/page.tsx  ─── GET /leads/:id (plain apiFetch + useState, NOT React Query) ─── local `lead` state only
                     ─── PATCH /contact-messages/:id/status (manual dropdown) → local reload() → notifyContactMessagesChanged()
                     (does NOT subscribe to the bus → does not react to Chat/[id] or other-tab changes)

Chat/[id] (chat-conversation-panel.tsx) ── on load & on each new visitor socket message ── PATCH /chat-sessions/:id/read
                                        ── "End chat" → socket emit close_session → server closeSession() → broadcast session_closed
                                        both paths call notifyContactMessagesChanged() on success
```

---

## 3. Status Lifecycle

```
PENDING ──(admin buka Chat/[id], markRead)──► READ
PENDING ──(admin pilih dropdown status manual di Leads/[id])──► READ / REPLIED / CLOSED
READ    ──(admin reply — TIDAK diaudit terpisah, bukan bagian scope; diasumsikan manual via dropdown status)──► REPLIED
ANY (≠CLOSED) ──(admin "End chat" / close_session socket event)──► CLOSED
```

**Otomatis (backend-enforced, tidak bisa di-regress):**
- `ChatSessionsService.markRead`: **hanya** `PENDING → READ` (guard `where status: "PENDING"`; jika sudah READ/REPLIED/CLOSED, no-op). Ini menjamin FINAL RULE #5/#6 dari prompt (tidak ada REPLIED→READ atau CLOSED→READ) sudah otomatis benar di level database query — bukan hanya konvensi frontend.
- `ChatSessionsService.closeSession`: `(apapun ≠ CLOSED) → CLOSED` (guard `where status: { not: "CLOSED" }`).

**Manual (butuh aksi admin eksplisit):**
- Transisi PENDING→READ di **Leads/[id]** — tidak otomatis saat halaman dibuka; hanya lewat dropdown status + tombol "Update" (`PATCH /contact-messages/:messageId/status` tanpa guard status asal, jadi secara teknis admin *bisa* memilih status apa pun termasuk mundur — lihat §6 Bugs, MEDIUM).
- Transisi REPLIED — tidak ada trigger otomatis di seluruh codebase (tidak ada deteksi "admin membalas pesan" yang otomatis set REPLIED); ini murni manual via dropdown yang sama.

Bagian mana yang otomatis vs manual **tidak konsisten antar halaman**: Chat/[id] otomatis untuk mark-read, Leads/[id] tidak.

---

## 4. Statistic Source of Truth

**Ya — `ContactMessage.status` adalah source of truth tunggal**, dan hanya **satu** implementasi query statistik yang ada di seluruh codebase:

```
ContactMessagesService.getStatistics()
  apps/api/src/modules/contact-messages/contact-messages.service.ts:374-400
  → prisma.contactMessage.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } })
  → direduksi jadi { total, pending, read, replied, closed }

Route: GET /contact-messages/statistics
  apps/api/src/modules/contact-messages/contact-messages-query.controller.ts:49-53
```

Tidak ditemukan implementasi kedua di `leads.service.ts` (Lead detail hanya `include: { contactMessages }` mentah, tidak groupBy) maupun di modul Chat (`ChatSessionsService.countUnread` menghitung `ChatMessage` yang belum dibaca — **metrik berbeda**, bukan kandidat duplikasi statistik ContactMessage).

Trace lengkap: **Database (Postgres, tabel `ContactMessage`) → Prisma `groupBy` → NestJS controller → `GET /contact-messages/statistics` → `useContactStatisticsQuery` (React Query, key `["contact-messages-statistics"]`) → `MessageSummaryCards` component**. Tidak ada langkah client-side yang menghitung ulang angka dari list — stat cards murni hasil API, bukan turunan dari data tabel yang sudah ter-load.

---

## 5. Synchronization Matrix

| Event | Backend | Cache | Leads List | Leads/[id] | Chat |
|---|---|---|---|---|---|
| New ContactMessage (Contact Form) | `ContactMessagesService.create`, status=PENDING | Tidak ada invalidation otomatis (tidak ada socket/bus trigger dari create) | **STALE** hingga admin navigasi/mount ulang (`refetchOnMount:"always"` menolong saat kembali ke halaman, tapi tidak realtime jika sedang berada di halaman) | N/A | N/A |
| New ContactMessage (WhatsApp form) | sama seperti di atas | sama | **STALE** (sama) | N/A | N/A |
| New Web Chat / ChatMessage | `ChatSessionsService.createSession` / `addMessage` | Socket `message` event broadcast ke room company — tapi handler client (`management-chat-socket.tsx:51-54`) hanya update badge unread chat (`notifyUnreadCountChanged("chat")`), **tidak** invalidate `["contact-messages"]`/`["contact-messages-statistics"]` | **STALE** (statistik Leads List tidak tersentuh oleh pesan chat baru sampai ada mark-read/close atau reload) | N/A | UPDATED (local state via socket `message`) |
| Open Leads/[id] | Tidak ada PATCH otomatis | N/A (tidak ada React Query di halaman ini) | Tidak berubah (tidak ada mutation) | UPDATED (data sendiri termuat) tapi **status TIDAK berubah ke READ** | N/A |
| Open Chat/[id] | `markRead()` otomatis di load | REST sukses → `notifyContactMessagesChanged()` → shell invalidate | **UPDATED** (via shell listener, meski Leads List sedang unmounted) | **STALE** (tidak subscribe ke bus) | UPDATED (local) |
| Mark Read (Chat) | `ChatSessionsService.markRead`, PENDING→READ | sama seperti di atas | UPDATED | STALE | UPDATED |
| Reply / manual status change (Leads/[id] dropdown) | `PATCH /contact-messages/:id/status` | `notifyContactMessagesChanged()` dipanggil manual di `page.tsx:149` → shell invalidate | UPDATED | UPDATED (local `load()`) | STALE (Chat panel tidak subscribe ke bus baik) |
| Close Chat ("End chat") | `ChatSessionsService.closeSession`, socket `close_session`→`session_closed` | `onSessionClosed` → `notifyContactMessagesChanged()` → shell invalidate | UPDATED | **STALE** | UPDATED (local `sessionClosed` state) |

**Pola yang berulang:** setiap event yang lewat `notifyContactMessagesChanged()` selalu sampai ke Leads List (karena shell selalu ter-mount), tapi **tidak pernah** sampai ke Leads/[id] (karena halaman itu tidak subscribe apa pun) dan **tidak pernah** sampai balik ke Chat/[id] jika perubahan berasal dari Leads/[id].

---

## 6. Bugs / Gaps

### CRITICAL
*Tidak ditemukan.* Tidak ada duplikasi API statistik, tidak ada korupsi/regresi status, tidak ada mismatch data historis (lihat §12).

### HIGH
1. **Leads/[id] tidak React-Query-driven dan tidak subscribe ke `contact-messages-sync` bus.**
   File: `apps/portal/src/app/management/leads/[id]/page.tsx`.
   Akibat: jika status ContactMessage berubah dari sumber lain (Chat/[id] markRead, Chat close, atau admin lain yang membuka lead ini di tab lain) **selagi** halaman Leads/[id] terbuka, halaman ini tidak akan menampilkan perubahan tanpa reload/navigasi ulang. Ini melanggar AC-10 dan AC-12 secara spesifik untuk halaman ini.
2. **Membuka Leads/[id] tidak otomatis PENDING → READ**, berbeda dari ekspektasi Section 4 prompt dan berbeda dari perilaku Chat/[id] (yang sudah benar). Saat ini butuh aksi manual (pilih dropdown + klik Update). Jika business requirement memang "membuka detail = read", ini adalah gap fungsional, bukan hanya sinkronisasi.

### MEDIUM
3. **Statistik Leads List tidak realtime untuk ContactMessage baru** (Contact Form / WhatsApp / Chat pertama). Tidak ada socket event atau bus notify yang dipicu saat `ContactMessage` baru dibuat — hanya FCM push notification (`notifyNewContactMessage`) yang terpisah dari React Query. Admin yang sedang berada di halaman Leads List tidak akan melihat counter Total/Pending bertambah tanpa refetch manual/interval/reload, kecuali kebetulan trigger invalidation lain terjadi. Ini berpotensi melanggar AC-02/AC-03 ("tanpa browser reload") — lihat catatan di §7.
4. **`updateLeadStatus()` (field `Lead.status`, entitas berbeda dari `ContactMessage.status`) tidak memanggil `notifyContactMessagesChanged()`.** Konsisten secara semantik (beda entity), tapi tidak konsisten dengan pola "selalu notify setelah mutation" yang dipakai di fungsi `updateMessageStatus()` pada file yang sama. Perlu dikonfirmasi apakah Leads List/Needs-Review perlu tahu perubahan Lead.status.
5. **`PATCH /contact-messages/:messageId/status` (dropdown manual di Leads/[id]) tidak memiliki guard transisi di backend** sebagaimana `markRead`/`closeSession` yang eksplisit menjaga arah transisi. Perlu verifikasi apakah endpoint ini mengizinkan admin memilih mundur (mis. CLOSED → PENDING) secara manual — jika ya, ini valid sebagai override manual admin, tapi perlu didokumentasikan sebagai pengecualian terhadap FINAL RULES #5/#6 (yang tampaknya dimaksudkan untuk transisi *otomatis*, bukan pilihan eksplisit admin).

### LOW
6. **Event bus (`contact-messages-sync.ts`, `use-unread-count.ts`) bersifat in-tab/in-browser-session saja** (module-level `Set` di JS bundle client), bukan mekanisme cross-client. Jika dua admin login bersamaan di browser berbeda, perubahan status oleh Admin A tidak mendorong update realtime ke sesi browser Admin B — Admin B hanya mendapat data segar saat query di-refetch (mount, focus, atau `refetchOnMount:"always"` saat navigasi). Untuk single-admin-session, ini tidak masalah; untuk multi-admin concurrent, ini adalah gap realtime (lihat §"REAL-TIME REQUIREMENT" di §11).
7. `useConvertLeadToCustomer` menginvalidate query key `"lead-detail"` yang tidak pernah dipakai oleh `useQuery` manapun (dead invalidation, tidak berbahaya tapi sia-sia — kandidat cleanup kecil, bukan bug fungsional).

---

## 7. Zustand Assessment

> **Verdict: Tidak diperlukan** (sesuai matrix di bawah — kategori "Tidak diperlukan" pada §8 decision list).

**A. Apakah masalah sebenarnya server-state synchronization?**
Sebagian iya (gap §6.3, ContactMessage baru tidak mendorong invalidation), tapi mayoritas gap (HIGH #1, #2) adalah **satu halaman yang belum mengikuti pola arsitektur yang sudah berfungsi di halaman lain** — bukan keterbatasan React Query. React Query + event bus di `management-shell.tsx` sudah terbukti bekerja untuk pasangan Leads List ↔ Chat/[id]. Menambah Zustand tidak akan memperbaiki "Leads/[id] belum dikonversi ke React Query" — masalah itu selesai dengan mengonversi halaman tersebut ke pola yang sama, apa pun state library yang dipakai.

**B. Apakah terlalu banyak custom event?**
Ada 2 pub/sub hand-rolled (`contact-messages-sync.ts`, `use-unread-count.ts`), keduanya sangat sederhana (≤20 baris, `Set<Listener>`), **hanya 1 subscriber nyata** untuk masing-masing (`management-shell.tsx` dan `use-unread-count.ts` internal hook). Ini bukan proliferasi event yang liar — masih dalam batas wajar untuk 1 mekanisme "beritahu shell untuk invalidate". Complexity rendah.

**C. Apakah ada duplicated state?**
Tidak ditemukan. Server state (`ContactMessage`/`ChatSession`) hanya hidup di: (1) database, (2) React Query cache (`["contact-messages"]`, `["contact-messages-statistics"]`), dan (3) local component state pada halaman yang belum pakai React Query (`Leads/[id]`, Chat panel's `liveMessages`/`sessionClosed`). Pub/sub bus **tidak menyimpan data** — hanya sinyal string domain (`"contact"`/`"chat"`) untuk trigger refetch, jadi bukan cache paralel.

**D. Apakah Zustand sudah digunakan?**
**Tidak sama sekali.** Dikonfirmasi lewat pencarian seluruh monorepo (`apps/*`, `packages/*`): tidak ada `zustand` di `package.json` manapun, tidak ada di lockfile, tidak ada import `from 'zustand'`. Pertanyaan "apakah penggunaan sekarang konsisten" tidak relevan karena belum ada penggunaan.

**E. Apakah Zustand benar-benar menyelesaikan masalah?**

```
OPTION A (current, untuk Leads List + Chat)      OPTION B (React Query + Zustand)
Server → React Query → invalidate/refetch → UI    Server → React Query → Zustand → event sync → UI
```

Opsi B menambah satu lapisan (Zustand store + sinkronisasi Zustand↔React Query) untuk data yang **sudah** server-derived dan **sudah** punya cache layer (React Query). Ini adalah anti-pattern umum: menyimpan server state di client store menciptakan *dua* sumber kebenaran yang harus dijaga sinkron secara manual — persis kelas masalah yang audit ini sedang cari (§14.C "duplicated state"), bukan solusinya. Root cause gap (#1, #2 di §6) adalah **kurangnya adopsi pola yang sudah ada**, bukan kelemahan React Query.

**Untuk kategori state:**
- **Server state** (ContactMessage/ChatSession/statistics): React Query sudah cukup dan sudah menjadi source of truth di 2 dari 3 halaman. **Jangan** pindahkan ini ke Zustand.
- **UI state** (mis. dropdown terbuka, filter form Leads List, `sessionClosed` flag lokal di Chat panel): saat ini pakai `useState` biasa — sudah tepat, tidak butuh Zustand kecuali state tsb perlu dibagi antar komponen yang jauh secara hierarki (belum ditemukan kasus itu).
- **Event coordination** (notify-bus): sudah minimal dan berfungsi untuk kasus yang di-wire. Zustand bisa menggantikan pub/sub manual ini dengan store + subscribe, tapi ini pergantian *mekanisme notifikasi*, bukan penyelesaian gap struktural (Leads/[id] tetap harus di-wire, entah ke bus lama atau ke Zustand store).
- **Chat state** (`liveMessages`, koneksi socket): local component state per sesi chat, scope-nya memang sempit (1 conversation panel), tidak butuh global store.
- **Statistics**: murni server state via 1 endpoint — kandidat paling jelas untuk **tetap di React Query**, bukan Zustand.

---

## 8. Zustand Decision Matrix

| Requirement | React Query | Zustand | Current Architecture |
|---|---|---|---|
| Server statistics | Cocok — sudah dipakai (`useContactStatisticsQuery`) | Tidak cocok — akan duplikasi cache | Sudah pakai React Query di Leads List |
| Cache | Built-in (staleTime, invalidation) | Tidak ada caching bawaan, harus dibangun manual | React Query sudah menangani |
| Cross-component update | Via `invalidateQueries`/shared `QueryClient` — sudah terbukti jalan di shell | Bisa, via subscribe, tapi butuh state ekstra | Sudah berfungsi (Leads List ↔ Chat), gap hanya di 1 halaman yang belum ikut pola |
| WebSocket event | Bisa dipetakan ke `invalidateQueries`/`setQueryData` dalam handler socket | Bisa juga, tapi sama saja perlu wiring manual | Socket ada (`chat.gateway.ts`), sebagian sudah trigger invalidation (close), sebagian belum (new message) |
| Optimistic update | Didukung native (`onMutate`/`setQueryData`) | Perlu dibangun manual | Belum dipakai di mana pun saat ini (tidak krusial untuk kasus ini) |
| Derived statistics | Query terpisah dari server, bukan derivasi client | N/A — bukan use case Zustand | Statistik sudah dari API, bukan dihitung ulang di client (baik) |
| UI-only state | Bukan tujuannya | Cocok, tapi `useState` lokal sudah cukup untuk skala saat ini | `useState` dipakai, tidak ada masalah |
| Avoid duplicated server state | Ya, satu cache terpusat | Risiko tinggi kalau dipakai untuk server data | Tidak ada duplikasi ditemukan (§7.C) |
| Complexity | Rendah (sudah jadi dependency, dipakai luas) | Menambah dependency + pola baru untuk tim | Menambah Zustand = kompleksitas baru tanpa menyelesaikan root cause |

**Verdict:**

```text
Zustand:
[x] Tidak diperlukan
[ ] Berguna tetapi belum diperlukan
[ ] Mulai layak digunakan
[ ] Sangat direkomendasikan
```

Alasan: seluruh gap yang ditemukan (§6) dapat diselesaikan dengan mengonversi `Leads/[id]` ke pola React Query + bus yang sudah terbukti berfungsi di `Leads List` dan `Chat/[id]`, plus menambahkan invalidation pada event "new ContactMessage". Tidak ada requirement dalam audit ini yang React Query tidak mampu penuhi, dan tidak ada bukti duplicated state yang butuh Zustand sebagai obat.

---

## 9. Recommended Architecture

**Paling sederhana yang memenuhi requirement: React Query + event invalidation yang sudah ada, diperluas konsisten ke semua halaman.**

```
Current                          →  Gap: Leads/[id] di luar pola; New-message tidak trigger invalidation
React Query + event invalidation →  REKOMENDASI: samakan Leads/[id] dengan Leads List (React Query
                                     + subscribe ke `subscribeContactMessagesChanged`, atau langsung
                                     invalidate `["contact-messages", id]`-style query di halaman itu);
                                     tambahkan invalidation saat ContactMessage baru dibuat (via socket
                                     event baru "contact_message_created" → notifyContactMessagesChanged(),
                                     atau via query polling ringan pada statistik).
React Query + Zustand            →  Tidak direkomendasikan — menambah lapisan tanpa menyelesaikan
                                     root cause (lihat §7.E).
```

---

## 10. Recommended Implementation Plan

*(Untuk tahap implementasi berikutnya — tidak dieksekusi dalam audit ini.)*

```
1. Konversi Leads/[id]/page.tsx dari apiFetch+useState manual menjadi React Query
   (useQuery key ["lead-detail", id] yang benar-benar dipakai — sekaligus membenahi
   dead invalidation key "lead-detail" di use-customers-query.ts, §6.7).
2. Subscribe Leads/[id] ke subscribeContactMessagesChanged (sama seperti pola
   management-shell.tsx) agar ikut ter-refresh saat Chat/[id] atau halaman lain
   mengubah status ContactMessage yang sedang dibuka.
3. Putuskan business rule: apakah membuka Leads/[id] harus otomatis PENDING→READ
   (selaras Section 4 prompt & perilaku Chat/[id]), atau tetap manual by design —
   dokumentasikan keputusan sebelum implementasi.
4. Tambahkan invalidation untuk event "ContactMessage baru dibuat": server emit
   socket event ringan (mis. broadcast ke room company saat create), client
   panggil notifyContactMessagesChanged() saat menerima event tsb — menutup gap
   §6.3 tanpa mengubah source of truth statistik.
5. Verifikasi/dekumentasikan behavior PATCH /contact-messages/:id/status manual
   (§6.5) — apakah transisi mundur memang diizinkan sebagai override admin.
6. Test end-to-end sesuai matrix §11.
7. Manual verification: jalankan skenario AC-01 s/d AC-12 di browser tanpa reload.
```

---

## 11. Files Involved

| Path | Reason |
|---|---|
| `packages/db/prisma/schema.prisma` | Definisi `ContactStatus`, `ChatSessionStatus`, model `ContactMessage`/`ChatSession`/`Lead` |
| `apps/api/src/modules/contact-messages/contact-messages.service.ts` | `create()` (status default PENDING, 3 sumber), `getStatistics()` (source of truth statistik) |
| `apps/api/src/modules/contact-messages/contact-messages-query.controller.ts` | Route `GET /contact-messages/statistics`, `GET /contact-messages/unread-count` |
| `apps/api/src/modules/chat/chat-sessions.service.ts` | `markRead()` (PENDING→READ), `closeSession()` (→CLOSED), transisi transactional |
| `apps/api/src/modules/chat/chat.gateway.ts` | Socket events `send_message`, `close_session`→`session_closed`; tidak ada event new-ContactMessage/mark-read |
| `apps/web-api/src/index.ts` | 3 edge entry point: `/public/contact-messages`, `/public/whatsapp-lead`, `/public/chat-sessions` |
| `apps/portal/src/app/management/leads/leads-page-client.tsx` | Konsumsi React Query untuk Leads List (list + stats + needs-review) |
| `apps/portal/src/app/management/leads/use-contact-messages-query.ts` | Semua query key & mutation Leads List |
| `apps/portal/src/app/management/leads/[id]/page.tsx` | **Gap utama** — tidak React Query, tidak subscribe bus, tidak auto mark-read |
| `apps/portal/src/app/management/leads/leads-ui.tsx` | `MessageSummaryCards` (render stat cards dari `statsQuery.data`) |
| `apps/portal/src/lib/contact-messages-sync.ts` | Event bus `notifyContactMessagesChanged`/`subscribeContactMessagesChanged` |
| `apps/portal/src/lib/use-unread-count.ts` | Event bus kedua untuk unread badge (`notifyUnreadCountChanged`/`subscribeUnreadCount`) |
| `apps/portal/src/components/management/management-shell.tsx` | Satu-satunya subscriber bus → invalidate React Query (mekanisme sync utama) |
| `apps/portal/src/components/management/chat/chat-conversation-panel.tsx` | markRead otomatis (load + new message), "End chat" action |
| `apps/portal/src/lib/use-chat-socket.ts` | Socket client per sesi chat, listener `session_closed` → notify bus |
| `apps/portal/src/lib/management-chat-socket.tsx` | Socket client shell-level (shared connection), listener `message` → unread badge saja |
| `apps/portal/src/app/management/customers/use-customers-query.ts` | Dead invalidation key `"lead-detail"` (§6.7, minor) |

---

## 12. Historical Data

Query read-only dijalankan terhadap database saat ini (2026-08-25) — **tidak ada UPDATE/DELETE**:

- Total `ContactMessage`: 4 baris (1 PENDING, 1 READ, 2 CLOSED, 0 REPLIED)
- Total `ChatSession`: 3 baris
- Mismatch A (`ChatSession.lastReadByAdminAt != null` tapi `ContactMessage.status = PENDING`): **0 record**
- Mismatch B (`ChatSession.status = CLOSED` tapi `ContactMessage.status != CLOSED`): **0 record**
- Mismatch C (`ChatSession OPEN`, belum pernah dibaca, tapi `ContactMessage.status` sudah READ/REPLIED/CLOSED — drift kebalikan): **0 record**
- ContactMessage dengan `getFrom = CHAT_PERSON` tanpa `ChatSession` terkait (orphan): **0 dari 3**

**Kesimpulan:** pada dataset saat ini (kemungkinan besar environment development dengan data terbatas), **tidak diperlukan backfill**. Karena volume data sangat kecil, hasil ini tidak sepenuhnya representatif untuk environment production — rekomendasi: jalankan query yang sama (read-only) terhadap database production sebelum menyimpulkan tidak ada data historis yang perlu dibenahi di sana. Query yang dipakai tersedia untuk dijalankan ulang bila diperlukan (lihat script sementara yang dipakai selama audit ini, sudah dijalankan lewat scratchpad dan tidak disimpan di repo).

**Tidak ada backfill yang dilakukan atau direkomendasikan untuk dieksekusi sekarang.**

---

## Ringkasan Query Key Inventory (pendukung §10 prompt asli)

| Query | Query Key | Source | Dipakai di |
|---|---|---|---|
| Statistics | `["contact-messages-statistics"]` | `GET /contact-messages/statistics` | Leads List (`MessageSummaryCards`) |
| Contact Messages (list) | `["contact-messages", ...filters]` | `GET /contact-messages` | Leads List (table) |
| Needs Review | `["leads-needs-review"]` | `GET /leads/needs-review` | Leads List |
| Contact Topics | `["contact-topics"]` | `GET /contact-topics` | Leads List (filter) |
| Lead Detail | *(tidak ada — plain `apiFetch`)* | `GET /leads/:id` | Leads/[id] (bukan React Query) |
| Chat | *(tidak ada — plain state + socket)* | `GET /chat-sessions/:id` + socket | Chat/[id] (bukan React Query) |
| Customers | `["customers"]` / `["customers", id]` | `GET /customers*` | Customers page |
| Dead key | `["lead-detail", id]` | invalidated by `useConvertLeadToCustomer`, tidak pernah di-`useQuery` | Tidak ada consumer (§6.7) |
