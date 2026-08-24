Berikut laporan audit end-to-end berdasarkan trace source code. Query database langsung untuk record Dino/Jihan tidak bisa dijalankan di environment ini (terminal read-only sandbox tidak tersedia), tetapi bukti statistik UI (Pending = 2, Closed = 0) plus alur kode sudah cukup kuat untuk menentukan root cause.

1. Verdict
   Chat menampilkan CLOSED karena membaca ChatSession.status, sedangkan kartu statistik Pesan Kontak membaca ContactMessage.status. Ketika admin menutup chat (End chat), backend hanya meng-update ChatSession.status = CLOSED — tidak pernah meng-update ContactMessage.status pada record first-touch yang ter-link (ChatSession.contactMessageId). Akibatnya, meskipun Dino dan Jihan sudah CLOSED di halaman Chat, statistik Closed tetap 0 karena kedua ContactMessage terkait masih PENDING (sesuai bukti: Total = 2, Pending = 2, Closed = 0).

Ini bukan masalah cache/UI stale; backend memang akan mengembalikan closed: 0 selama ContactMessage.status belum berubah.

2. Root Cause
   Missing synchronization antara dua domain status yang sengaja dipisah di schema, tanpa bridge logic saat close chat.

Arsitektur saat ini:

Chat domain: lifecycle percakapan realtime → ChatSession.status (OPEN | CLOSED)
Pesan Kontak domain: workflow inbox intake → ContactMessage.status (PENDING | READ | REPLIED | CLOSED)
Keduanya terhubung lewat ChatSession.contactMessageId (1 first-touch ContactMessage per session), tetapi tidak ada kode yang mensinkronkan status saat session ditutup.

3. Evidence
   3.1 Data model — entity dan field berbeda
   Schema Prisma mendefinisikan dua enum terpisah:

schema.prisma
Lines 233-241
// Real-time Web Chat conversation domain (separate from the Lead-intake
// domain below) — locked 2026-08-16 Web Chat correction audit + technical
// spike. A ChatSession's OPEN/CLOSED lifecycle is deliberately the only two
// states for MVP (no IDLE/EXPIRED/AUTO_CLOSED/ARCHIVED — no auto-close
// requirement exists yet).
enum ChatSessionStatus {
OPEN
CLOSED
}

schema.prisma
Lines 68-73
enum ContactStatus {
PENDING
READ
REPLIED
CLOSED
}
Relasi:

schema.prisma
Lines 552-586
model ContactMessage {
...
status ContactStatus @default(PENDING)
...
chatSession ChatSession?
}
model ChatSession {
...
status ChatSessionStatus @default(OPEN)
contactMessageId String? @unique
closedAt DateTime?
...
contactMessage ContactMessage? @relation(fields: [contactMessageId], references: [id])
}
Jawaban eksplisit: status CLOSED pada Chat dan Closed pada Pesan Kontak berasal dari field/entity yang berbeda:

Chat Pesan Kontak
Entity
ChatSession
ContactMessage
Field
status
status
Enum
ChatSessionStatus
ContactStatus
Relasi
contactMessageId → ContactMessage.id
chatSession (reverse 1:1)
3.2 Close chat hanya update ChatSession
Alur close:

chat-conversation-panel.tsx
Lines 160-163
<DropdownMenuItem onSelect={() => closeSession()}>
<Check />
End chat
</DropdownMenuItem>

use-chat-socket.ts
Lines 101-104
const closeSession = useCallback(() => {
if (!socket?.connected) return;
socket.emit("close_session", { sessionId });
}, [socket, sessionId]);

chat.gateway.ts
Lines 232-234
const session = await this.chatSessions.closeSession(identity.companyId, sessionId);
this.server.to(roomForSession(sessionId)).emit("session_closed", { sessionId, closedAt: session.closedAt });

chat-sessions.service.ts
Lines 244-252
async closeSession(companyId: string, sessionId: string): Promise<ChatSession> {
const session = await prisma.chatSession.findFirst({ where: { id: sessionId, companyId } });
if (!session) {
throw new NotFoundException({ message: "Chat session not found", code: "CHAT_SESSION_NOT_FOUND" });
}
return prisma.chatSession.update({
where: { id: sessionId },
data: { status: "CLOSED", closedAt: new Date() },
});
}
Tidak ada contactMessage.update, ContactMessagesService.updateStatus, atau transaksi yang menyentuh ContactMessage.

Test lifecycle chat juga hanya assert ChatSession, bukan ContactMessage:

chat-sessions.service.test.ts
Lines 399-403
it("can be closed, setting closedAt", async () => {
const session = await createSession();
const closed = await service.closeSession(realCompanyId, session.id);
expect(closed.status).toBe("CLOSED");
expect(closed.closedAt).not.toBeNull();
});
Test integrasi chat→ContactMessage justru menegaskan pesan lanjutan tidak menyentuh ContactMessage:

chat-sessions.service.test.ts
Lines 432-448
describe("Web Chat -> Lead pipeline integration: subsequent messages never create additional ContactMessages", () => {
it("adding VISITOR/ADMIN messages after session creation does not touch ContactMessage at all", async () => {
...
expect(countAfter).toBe(countBefore);
});
});
3.3 Statistik Pesan Kontak membaca ContactMessage.status

contact-messages.service.ts
Lines 374-399
async getStatistics(companyId: string): Promise<{
total: number;
pending: number;
read: number;
replied: number;
closed: number;
}> {
const grouped = await prisma.contactMessage.groupBy({
by: ["status"],
where: { companyId },
_count: { _all: true },
});
const counts = { PENDING: 0, READ: 0, REPLIED: 0, CLOSED: 0 };
for (const row of grouped) {
counts[row.status] = row._count._all;
}
return {
total: counts.PENDING + counts.READ + counts.REPLIED + counts.CLOSED,
...
closed: counts.CLOSED,
};
}
Endpoint: GET /contact-messages/statistics → contact-messages-query.controller.ts:49-52.

Bukan ChatSession.status, bukan join ke chatSession.

3.4 Frontend statistik — pass-through dari API, tanpa cache khusus close chat

use-contact-messages-query.ts
Lines 88-92
export function useContactStatisticsQuery() {
return useQuery({
queryKey: ["contact-messages-statistics"],
queryFn: () => apiFetch<ContactMessageStatistics>("/contact-messages/statistics"),
});
}

leads-page-client.tsx
Lines 169-169
<MessageSummaryCards stats={statsQuery.data ?? null} loading={statsQuery.isLoading} />
contact-messages-statistics hanya di-invalidate oleh useResolveLeadMatch — tidak oleh close chat:

use-contact-messages-query.ts
Lines 119-123
onSuccess: () => {
queryClient.invalidateQueries({ queryKey: [CONTACT_MESSAGES_QUERY_KEY] });
queryClient.invalidateQueries({ queryKey: ["leads-needs-review"] });
queryClient.invalidateQueries({ queryKey: ["contact-messages-statistics"] });
},
Close chat hanya memanggil notifyUnreadCountChanged("chat") (badge chat), bukan statistik contact.

Namun, invalidation ini bukan root cause — bahkan setelah hard refresh, API tetap mengembalikan closed: 0 karena DB ContactMessage.status belum berubah.

3.5 Bukti inferensi untuk Dino & Jihan (tanpa query DB langsung)
Dari statistik screenshot:

Total = 2 → ada 2 row ContactMessage
Pending = 2 → keduanya ContactMessage.status = PENDING
Closed = 0 → tidak ada ContactMessage.status = CLOSED
Sementara Chat menampilkan CLOSED → ChatSession.status = CLOSED untuk session Dino & Jihan.

Mismatch yang diharapkan di DB:

Chat membaca:
ChatSession (visitorEmail = dino@gmail.com).status = CLOSED
ChatSession (visitorEmail = jihan@gmail.com).status = CLOSED
Pesan Kontak / statistik membaca:
ContactMessage (email = dino@gmail.com, getFrom = CHAT_PERSON).status = PENDING
ContactMessage (email = jihan@gmail.com, getFrom = CHAT_PERSON).status = PENDING
Query verifikasi (read-only) yang bisa Anda jalankan:

SELECT
cs.id AS session_id,
cs."visitorName",
cs."visitorEmail",
cs.status AS session_status,
cs."closedAt",
cm.id AS contact_message_id,
cm.status AS contact_message_status,
cm."getFrom"
FROM "ChatSession" cs
LEFT JOIN "ContactMessage" cm ON cm.id = cs."contactMessageId"
WHERE LOWER(cs."visitorEmail") IN ('dino@gmail.com', 'jihan@gmail.com')
ORDER BY cs."createdAt" DESC;
3.6 Temuan sekunder: markRead chat juga tidak sync ke ContactMessage
Saat admin membuka chat, markRead hanya set ChatSession.lastReadByAdminAt:

chat-sessions.service.ts
Lines 328-351
async markRead(...) {
...
return prisma.chatSession.update({
where: { id: sessionId },
data: { lastReadByAdminAt: next },
});
}
Comment schema mengatakan ini "mirrors ContactMessage's PENDING->READ convention", tetapi implementasinya terpisah. Ini menjelaskan mengapa Read = 0 meskipun admin sudah membaca chat.

4. Actual Data Flow
   User klik "End chat"
   ↓
   chat-conversation-panel.tsx → closeSession()
   ↓
   use-chat-socket.ts → socket.emit("close_session")
   ↓
   chat.gateway.ts → handleCloseSession()
   ↓
   ChatSessionsService.closeSession()
   ↓
   Database: UPDATE ChatSession SET status='CLOSED', closedAt=now()
   ContactMessage.status TIDAK DIUBAH (tetap default PENDING)
   ↓
   Statistic API: GET /contact-messages/statistics
   ↓
   ContactMessagesService.getStatistics()
   ↓
   GROUP BY ContactMessage.status → closed = count(status='CLOSED') = 0
   ↓
   Frontend: MessageSummaryCards menampilkan Closed = 0
5. Status Mapping
   Layer Entity Field Value (kondisi aktual)
   Chat UI
   ChatSession
   status
   CLOSED
   Chat UI badge
   ChatSession
   status
   OPEN / CLOSED
   Database (session)
   ChatSession
   status
   CLOSED
   Database (intake)
   ContactMessage
   status
   PENDING (inferensi dari Pending=2)
   Statistic API
   ContactMessage
   status
   groupBy → closed = 0
   Frontend card
   API response
   closed
   0
   Pesan Kontak row badge
   ContactMessage
   status
   PENDING (via ContactStatusBadge)
   Tidak ada mismatch casing/enum (CLOSED vs Closed vs RESOLVED) — nilai string sama (CLOSED), tetapi entity berbeda.

6. Root Cause Classification
   Missing synchronization — close chat tidak propagate ke ContactMessage.status
   Business rule mismatch — dua domain status dipisah di schema, tetapi tidak ada rule operasional yang menjembatani saat close
   Database inconsistency — bukan korupsi data; ini konsisten dengan kode saat ini
   Wrong backend query — query statistik benar untuk source of truth yang dipilih (ContactMessage)
   Wrong status mapping — enum mapping benar
   Frontend stale state — secondary/non-root; refresh pun tetap 0
   Cache invalidation issue — ada gap invalidation, tapi bukan penyebab angka salah di DB
   Case classification: Case C — database belum mencerminkan status yang dibutuhkan statistik Pesan Kontak, karena layer close chat tidak pernah menulis ke entity yang dibaca statistik.

7. Recommended Fix (rekomendasi saja, belum diimplementasikan)
   Source of truth yang benar secara arsitektur
   Halaman Pesan Kontak + statistik cards → source of truth: ContactMessage.status
   Halaman Chat (lifecycle percakapan) → source of truth: ChatSession.status
   Hubungan: ChatSession.contactMessageId adalah jembatan 1:1 untuk first-touch intake Web Chat
   Fix minimal yang paling tepat
   Di ChatSessionsService.closeSession, setelah (atau dalam) update session:

Jika session.contactMessageId ada, update ContactMessage.status → CLOSED
Guard bisnis (selaras pola email REPLIED):
Hanya update jika status saat ini bukan sudah CLOSED
Pertimbangkan allow transition dari PENDING | READ | REPLIED → CLOSED
Lakukan dalam satu transaksi dengan update ChatSession agar atomic
Contoh konsep (bukan implementasi):

await prisma.$transaction([
prisma.chatSession.update({ ... status: CLOSED }),
prisma.contactMessage.updateMany({
where: { id: session.contactMessageId, status: { not: "CLOSED" } },
data: { status: "CLOSED" },
}),
]);
Perbaikan pelengkap (opsional, terpisah dari root cause Closed)
Saat markRead chat: pertimbangkan sync ContactMessage.status PENDING → READ (menjelaskan Read = 0)
Setelah close: invalidate contact-messages-statistics + list query (UX, bukan perbaikan angka di DB)
Yang tidak direkomendasikan sebagai fix utama
Mengubah getStatistics agar menghitung ChatSession.status = CLOSED — ini mengaburkan source of truth Pesan Kontak dan tidak mencakup channel non-chat (Contact Form, WhatsApp, Email) 8. Regression Risk
Area Risiko jika sync close → ContactMessage.CLOSED
Chat
Rendah — ChatSession.status tetap source of truth UI chat
Pesan Kontak list/filter
Sedang — row Dino/Jihan akan pindah dari Pending ke Closed; filter status berperilaku benar
Statistic cards
Sedang — Closed naik, Pending turun; sesuai ekspektasi bisnis
Leads
Rendah — Lead.status tidak terpengaruh (entity terpisah)
Notification badge contact
Sedang — countUnread hitung ContactMessage.status = PENDING; close chat akan mengurangi unread contact (kemungkinan diinginkan)
Notification badge chat
Rendah — tetap pakai ChatSession.lastReadByAdminAt; test sudah menegaskan CLOSED ≠ read
Assignment
Tidak ada — chat MVP tidak punya assignment per session
Email REPLIED logic
Rendah — logic email skip jika sudah CLOSED; sync ke CLOSED justru konsisten
Lead detail manual status
Rendah — staff masih bisa ubah status via PATCH /contact-messages/:id/status
Reporting/audit
Perlu dipastikan: close chat = resolved intake, bukan hanya "tidak bisa kirim pesan lagi" 9. Reproduce dari Source Code (simulasi alur)
Tahap Hasil yang diharapkan dari kode

1. Buat session Dino via Web Chat
   ChatSession OPEN + ContactMessage PENDING (getFrom=CHAT_PERSON) + link contactMessageId
2. Admin buka chat
   markRead → lastReadByAdminAt set; ContactMessage.status tetap PENDING
3. Admin "End chat"
   ChatSession.status = CLOSED; ContactMessage.status tetap PENDING
4. Hit GET /contact-messages/statistics
   closed: 0, pending: +1 per session
5. Frontend Pesan Kontak
   Badge row = Pending; card Closed = 0
6. Frontend Chat
   Badge = CLOSED
   Ringkasan jawaban pertanyaan audit
   Pertanyaan Jawaban
   Field/entity sama atau berbeda?
   Berbeda — ChatSession.status vs ContactMessage.status, ter-link via contactMessageId
   Saat close chat, field apa yang di-update?
   Hanya ChatSession.status + closedAt
   Apakah ContactMessage seharusnya ikut berubah?
   Tidak diimplementasikan; statistik Pesan Kontak mensyaratkan ContactMessage.status
   Backend vs frontend stale?
   Backend juga 0 — bukan cache UI
   Apakah Chat CLOSED harus = Pesan Kontak CLOSED?
   Secara produk/inbox: ya, untuk first-touch Web Chat; secara kode saat ini: tidak disinkronkan (bug/gap implementasi, bukan expected behavior untuk statistik)
   Jika Anda ingin, setelah review audit ini, saya bisa implementasikan fix minimal di closeSession (+ test + invalidation query) di Agent mode. Untuk verifikasi DB Dino/Jihan, jalankan query SQL di atas di environment lokal Anda dan bandingkan kolom session_status vs contact_message_status.
