Implementasi Selesai — Sync Chat Mark Read → ContactMessage READ

1. Audit Finding (sebelum fix)
   markRead() hanya meng-update ChatSession.lastReadByAdminAt. ContactMessage.status tetap PENDING meskipun admin sudah membuka conversation.

2. Root Cause
   Unread badge Web Chat dan workflow inbox Pesan Kontak menggunakan source of truth berbeda — sync ke ContactMessage.status belum pernah diimplementasikan (sudah diidentifikasi sebagai follow-up dari fix CLOSED sync).

3. Implementation
   Backend — markRead() sekarang dalam prisma.$transaction, dengan conditional update:

chat-sessions.service.ts
Lines 366-385
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
status: "PENDING",
},
data: { status: "READ" },
});
}
return updated;
});
Frontend — setelah PATCH /read sukses, statistik Pesan Kontak ikut di-refresh:

chat-conversation-panel.tsx
Lines 59-62
.then(() => {
notifyUnreadCountChanged("chat");
notifyContactMessagesChanged();
}) 4. Status Transition Matrix
Current markRead Result
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
CLOSED 5. Tests
Describe block baru: ChatSessionsService.markRead — linked ContactMessage PENDING → READ sync

Test Coverage
1
PENDING → READ + lastReadByAdminAt
2
READ tetap READ
3
REPLIED tidak mundur ke READ
4
CLOSED tidak mundur ke READ
5
contactMessageId = null — sukses, tidak buat ContactMessage
6
Repeated markRead idempotent
7
Statistik Pending↓ Read↑, Closed unchanged 6. Verification
Check Result
Typecheck (api)
PASS
Typecheck (portal)
PASS
Unit tests
PASS — 70/70
Lint
Tidak ada error pada file yang diubah 7. Files Changed
apps/api/src/modules/chat/chat-sessions.service.ts
apps/api/src/modules/chat/chat-sessions.service.test.ts
apps/portal/src/components/management/chat/chat-conversation-panel.tsx 8. Out of Scope
Tidak ada perubahan pada: closeSession(), REPLIED auto dari chat reply, Lead, assignment, notifications, email, WhatsApp, Contact Form, schema DB.

Manual test yang disarankan: buka Web Chat baru → kartu Pending berkurang, Read bertambah tanpa hard refresh. Untuk data historis yang sudah dibaca admin tapi masih PENDING, perlu one-time backfill SQL (follow-up terpisah).
