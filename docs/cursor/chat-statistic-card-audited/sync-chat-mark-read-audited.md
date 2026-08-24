Laporan Audit: Sync Chat Mark Read → ContactMessage READ
Mode saat ini: Ask — saya hanya bisa audit dan memberi panduan implementasi. Untuk menerapkan fix, test, dan verifikasi, silakan beralih ke Agent mode.

1. Audit Finding — Behavior Existing
   Alur lengkap (traced dari source code)
   Admin membuka /management/chat/[sessionId]
   ↓
   ChatConversationPanel.load()
   ↓
   GET /chat-sessions/:id (fetch history)
   ↓
   markRead(latest.createdAt) ← dipanggil setelah fetch sukses
   ↓
   PATCH /chat-sessions/:id/read { readUpTo?: ISO datetime }
   ↓
   ChatSessionsAdminController.markRead()
   ↓
   ChatSessionsService.markRead()
   ↓
   prisma.chatSession.update({ lastReadByAdminAt: next })
   ↓
   ContactMessage.status → TIDAK DIUBAH
   Trigger tambahan: setiap pesan VISITOR live via socket juga memanggil markRead:

chat-conversation-panel.tsx
Lines 53-65
const markRead = useCallback(
(readUpTo?: string) => {
apiFetch(`/chat-sessions/${sessionId}/read`, {
method: "PATCH",
body: JSON.stringify(readUpTo ? { readUpTo } : {}),
})
.then(() => {
notifyUnreadCountChanged("chat");
})
.catch(() => {});
},
[sessionId],
);
Yang di-update saat ini — hanya watermark baca admin:

chat-sessions.service.ts
Lines 345-369
async markRead(companyId: string, sessionId: string, rawInput: unknown = {}): Promise<ChatSession> {
// ... validasi + kalkulasi `next` watermark ...
return prisma.chatSession.update({
where: { id: sessionId },
data: { lastReadByAdminAt: next },
});
}
Relationship yang tersedia:

ChatSession.contactMessageId → ContactMessage.id (FK, @unique)
ContactMessage dibuat sekali saat createSession() dengan status = PENDING (default schema), lalu di-link via contactMessageId.

Tidak ada logic sync ContactMessage di markRead() — grep markRead.*ContactMessage dan sebaliknya = 0 match.

Precedent yang sudah ada — closeSession() sudah sync ContactMessage (fix sebelumnya):

chat-sessions.service.ts
Lines 251-268
return prisma.$transaction(async (tx) => {
const closed = await tx.chatSession.update({ ... });
if (session.contactMessageId) {
await tx.contactMessage.updateMany({
where: {
id: session.contactMessageId,
companyId,
status: { not: "CLOSED" },
},
data: { status: "CLOSED" },
});
}
return closed;
});
Helper ContactMessage existing: ContactMessagesService.updateStatus() — blind update tanpa guard status. Jangan dipakai untuk task ini; gunakan pola updateMany conditional seperti closeSession().

Frontend cache invalidation:

Event Invalidasi statistik Pesan Kontak?
session_closed (socket)
✅ notifyContactMessagesChanged() di use-chat-socket.ts
markRead (PATCH /read)
❌ Hanya notifyUnreadCountChanged("chat") — badge chat saja
leads-page-client.tsx sudah subscribe ke subscribeContactMessagesChanged() untuk invalidate contact-messages-statistics + contact-messages, tapi markRead tidak pernah memicu event itu.

Statistik dibaca dari ContactMessage.status via getStatistics() — bukan dari lastReadByAdminAt. Jadi admin bisa sudah membaca chat, tapi kartu Pending tetap tinggi dan Read tetap 0.

2. Root Cause
   markRead() dirancang hanya untuk unread badge Web Chat (ChatSession.lastReadByAdminAt + countUnread()), bukan untuk workflow inbox Pesan Kontak (ContactMessage.status).

Ini sudah diakui sebagai follow-up di laporan implementasi CLOSED sync sebelumnya:

"Chat markRead → ContactMessage tetap PENDING: Masih terpisah (lastReadByAdminAt vs ContactMessage.status)."

Schema comment di ChatSession.lastReadByAdminAt memang menyebut "mirrors ContactMessage's PENDING→READ convention", tetapi implementasi aktual belum menyinkronkan status tersebut.

3. Konfirmasi Gap — Fix Diperlukan
   Acceptance criterion Status saat ini
   PENDING → READ saat admin buka chat
   ❌ Belum
   READ → READ (no-op)
   ✅ Implicit (tidak diubah)
   REPLIED → REPLIED (tidak mundur)
   ✅ Implicit (tidak diubah)
   CLOSED → CLOSED (tidak mundur)
   ✅ Implicit (tidak diubah)
   Statistik Pending↓ Read↑
   ❌ Belum
   Frontend invalidate tanpa hard refresh
   ❌ Belum untuk markRead
   Test markRead + ContactMessage
   ❌ Belum ada
   Kesimpulan audit: gap terkonfirmasi — implementasi diperlukan.

4. Panduan Implementasi (belum diterapkan)
   4a. Backend — ChatSessionsService.markRead()
   Ubah menjadi transaction (mengikuti pola closeSession()):

return prisma.$transaction(async (tx) => {
const updated = await tx.chatSession.update({
where: { id: sessionId },
data: { lastReadByAdminAt: next },
});
if (session.contactMessageId) {
await tx.contactMessage.updateMany({
where: {
id: session.contactMessageId,
companyId,
status: "PENDING", // HANYA PENDING → READ
},
data: { status: "READ" },
});
}
return updated;
});
Poin penting:

updateMany + where: { status: "PENDING" } = aman race condition & idempotent
Tidak perlu guard ChatSession.status — jika ContactMessage sudah CLOSED/REPLIED, conditional where mencegah regress
contactMessageId = null → skip, tidak throw, tidak buat ContactMessage baru
Jangan pakai blind update({ status: "READ" })
4b. Frontend — invalidation setelah markRead sukses
Di chat-conversation-panel.tsx, setelah PATCH sukses:

import { notifyContactMessagesChanged } from "../../../lib/contact-messages-sync";
// dalam .then() markRead:
notifyUnreadCountChanged("chat");
notifyContactMessagesChanged(); // ← tambahkan ini
Ini konsisten dengan pola session_closed → tidak perlu ubah arsitektur global state.

4c. Tests — describe block baru
Tambahkan di chat-sessions.service.test.ts, mirror struktur closeSession — linked ContactMessage CLOSED sync:

Test Setup Assert
1 PENDING → READ
session linked, status PENDING
lastReadByAdminAt set + status READ
2 READ remains READ
pre-set READ
status tetap READ
3 REPLIED protection
pre-set REPLIED
status tetap REPLIED
4 CLOSED protection
pre-set CLOSED
status tetap CLOSED
5 null contactMessageId
session tanpa link
markRead sukses, tidak buat ContactMessage
6 repeated markRead
call 3×
PENDING→READ, lalu READ stabil
7 statistics
getStatistics before/after
pending -1, read +1, closed unchanged
Gunakan countCompanyId = "CHT" dan createSessionForCompany() seperti test existing.

5. Status Transition Matrix (expected setelah fix)
   Current ContactMessage.status Admin opens Chat (markRead) Result
   PENDING
   Yes
   READ
   READ
   Yes
   READ
   REPLIED
   Yes
   REPLIED
   CLOSED
   Yes
   CLOSED
   Lifecycle Web Chat lengkap (setelah fix ini + closeSession existing):

New Web Chat → PENDING
Admin opens → READ
Staff replies → REPLIED (out of scope — belum auto dari chat)
Admin closes → CLOSED 6. Verifikasi (belum dijalankan — Ask mode)
Check Status
Typecheck
NOT RUN
Unit tests
NOT RUN
Lint
NOT RUN
Manual test A–D
NOT RUN 7. Files yang Perlu Diubah
File Perubahan
apps/api/src/modules/chat/chat-sessions.service.ts
Transaction + conditional PENDING→READ di markRead()
apps/api/src/modules/chat/chat-sessions.service.test.ts
7 test baru (describe block markRead sync)
apps/portal/src/components/management/chat/chat-conversation-panel.tsx
Panggil notifyContactMessagesChanged() setelah markRead sukses
Tidak perlu diubah: schema, closeSession(), getStatistics(), query statistik, Lead, email, WhatsApp, FCM, UI layout.

8. Out of Scope / Follow-up
   REPLIED auto dari admin reply chat — belum ada di codebase (REPLIED hanya via PATCH /contact-messages/:id/status manual). Bukan bagian task ini.
   Backfill historis — chat yang sudah dibaca admin (lastReadByAdminAt set) tapi ContactMessage masih PENDING perlu one-time SQL backfill (sama seperti follow-up CLOSED sync).
   Cross-tab invalidation — invalidation statistik hanya aktif jika halaman Pesan Kontak mounted (limitation existing, bukan regresi baru).
