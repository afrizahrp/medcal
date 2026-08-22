import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { ChatMessage, ChatSession, Prisma } from "@medcal/db";
import { chatMessageCreateSchema, chatSessionCreateSchema, chatSessionMarkReadSchema } from "@medcal/shared";
import { ContactMessagesService } from "../contact-messages/contact-messages.service";

export interface ChatSessionWithMessages extends ChatSession {
  messages: ChatMessage[];
}

export interface ChatSessionListItem extends ChatSession {
  latestMessage: ChatMessage | null;
  /** VISITOR messages newer than lastReadByAdminAt — same semantics as countUnread. */
  unreadCount: number;
}

/**
 * Web Chat conversation domain (Phase 1 — persistence/domain foundation
 * only, per the Web Chat correction audit locked 2026-08-16). No Socket.IO,
 * no visitor auth, no admin UI here — this service is what Phase 2's
 * ChatGateway will call once it exists.
 *
 * Transaction boundary (corrected 2026-08-16, per explicit review): the
 * entire initial-creation sequence — ChatSession, first ChatMessage, the
 * reused ContactMessagesService.create() call (Customer dedup + Lead
 * matching + ContactMessage row), and the final ChatSession.contactMessageId
 * link — runs inside ONE `prisma.$transaction`. ContactMessagesService.
 * create() now accepts an optional transaction-scoped client (`Db`, see
 * lead-matching.ts), defaulting to the module-level `prisma` singleton so
 * every other caller is unaffected; here it's passed the same `tx` this
 * method's own statements use. Any failure at any step — including a
 * failure inside the reused matching pipeline — rolls back the whole
 * sequence: no orphan ChatSession, no orphan first ChatMessage, no orphan
 * ContactMessage, no ChatSession left without its intended ContactMessage.
 */
@Injectable()
export class ChatSessionsService {
  // Explicit @Inject() — plain type-based constructor injection silently
  // resolves to undefined under this project's tsx dev-server runtime
  // (esbuild's design:paramtypes emission isn't reliable there, unlike
  // under Vitest's transform); every other provider in this codebase
  // (see contact-topics.controller.ts, whitelist.controller.ts) already
  // follows this same explicit-token convention.
  constructor(@Inject(ContactMessagesService) private readonly contactMessagesService: ContactMessagesService) {}

  async createSession(companyId: string, rawInput: unknown): Promise<ChatSessionWithMessages> {
    const parsed = chatSessionCreateSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid chat session payload",
        code: "INVALID_CHAT_SESSION",
        issues: parsed.error.flatten(),
      });
    }
    const input = parsed.data;

    let contactMessageId: string | undefined;

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.chatSession.create({
        data: {
          companyId,
          visitorName: input.name,
          visitorEmail: input.email,
        },
      });
      const firstMessage = await tx.chatMessage.create({
        data: {
          companyId,
          sessionId: session.id,
          senderType: "VISITOR",
          body: input.message,
        },
      });

      // Existing ContactMessage -> Lead pipeline, reused unmodified (same
      // tx). getFrom is hardcoded here, server-side, exactly like every
      // other channel's internal-endpoint caller — the client never
      // supplies it (this method itself has no getFrom parameter at all).
      const contactMessage = await this.contactMessagesService.create(
        companyId,
        {
          getFrom: "CHAT_PERSON",
          name: input.name,
          email: input.email,
          message: input.message,
        },
        tx,
      );
      contactMessageId = contactMessage.id;

      const linked = await this.linkContactMessage(tx, session.id, contactMessage.id);

      return { ...linked, messages: [firstMessage] };
    });

    if (contactMessageId) {
      void this.contactMessagesService.notifyNewContactMessage(companyId, contactMessageId);
    }

    return result;
  }

  // Extracted so tests can simulate a failure specifically at the "link
  // back" step (vi.spyOn this method) without needing to fabricate a real
  // DB-constraint violation — a small, test-only seam, not production
  // complexity (the method itself is just the final write, same as before).
  private async linkContactMessage(
    tx: Prisma.TransactionClient,
    sessionId: string,
    contactMessageId: string,
  ): Promise<ChatSession> {
    return tx.chatSession.update({
      where: { id: sessionId },
      data: { contactMessageId },
    });
  }

  /**
   * senderUserId is a SEPARATE, trusted parameter — never part of rawInput /
   * chatMessageCreateSchema, so it can never be client-supplied (Phase 2
   * "ADMIN IDENTITY — NON-NEGOTIABLE" requirement). Callers (ChatGateway)
   * pass the authenticated Better Auth user's id for ADMIN sends only; it is
   * always undefined/omitted for VISITOR sends.
   */
  async addMessage(
    companyId: string,
    sessionId: string,
    rawInput: unknown,
    senderUserId?: string,
  ): Promise<ChatMessage> {
    const parsed = chatMessageCreateSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid chat message payload",
        code: "INVALID_CHAT_MESSAGE",
        issues: parsed.error.flatten(),
      });
    }
    const input = parsed.data;

    const session = await prisma.chatSession.findFirst({ where: { id: sessionId, companyId } });
    if (!session) {
      throw new NotFoundException({ message: "Chat session not found", code: "CHAT_SESSION_NOT_FOUND" });
    }

    if (input.clientMessageId) {
      // Idempotent resend: the DB-level unique constraint is the real
      // guard; on conflict, return the message that already exists instead
      // of erroring, so a retried client submission is a no-op, not a
      // duplicate row or a surfaced failure. Checked BEFORE the CLOSED
      // guard below so a replayed submission of an already-persisted
      // message still succeeds (idempotent read) even if the session was
      // closed in the meantime — only genuinely NEW content is blocked.
      const existing = await prisma.chatMessage.findFirst({
        where: { sessionId, clientMessageId: input.clientMessageId },
      });
      if (existing) {
        return existing;
      }
    }

    // Phase 2 (ChatGateway) dependency: Phase 1 had no live send path, so
    // this guard didn't exist yet. Decision (Attack E, "closed session"):
    // a visitor MAY still reconnect and read a CLOSED session's history,
    // but no new ChatMessage — from either side — may be created once
    // closed. Reopening isn't part of the OPEN/CLOSED lifecycle.
    if (session.status === "CLOSED") {
      throw new ForbiddenException({ message: "Chat session is closed", code: "CHAT_SESSION_CLOSED" });
    }

    try {
      return await prisma.chatMessage.create({
        data: {
          companyId,
          sessionId,
          senderType: input.senderType,
          senderUserId: input.senderType === "ADMIN" ? senderUserId : undefined,
          body: input.body,
          clientMessageId: input.clientMessageId,
        },
      });
    } catch (err) {
      // Race: another request inserted the same clientMessageId between our
      // check above and this create — fetch-and-return rather than fail.
      if (input.clientMessageId && isUniqueConstraintError(err)) {
        const existing = await prisma.chatMessage.findFirst({
          where: { sessionId, clientMessageId: input.clientMessageId },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  /**
   * Chat Inbox listing (Phase 2 admin UI) — company-scoped, OPEN sessions
   * first (Prisma orders a native Postgres enum by its declaration order,
   * and OPEN is declared before CLOSED in schema.prisma), then by most
   * recent activity. unreadCount is the per-session VISITOR unread total
   * (same filter as countUnread); CLOSED is not treated as read.
   */
  async findAll(companyId: string): Promise<ChatSessionListItem[]> {
    const sessions = await prisma.chatSession.findMany({
      where: { companyId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: { messages: { orderBy: { seq: "desc" }, take: 1 } },
    });
    if (sessions.length === 0) return [];

    const grouped = await prisma.chatMessage.groupBy({
      by: ["sessionId"],
      where: this.unreadVisitorWhere(companyId, sessions),
      _count: { _all: true },
    });
    const unreadBySessionId = new Map(grouped.map((row) => [row.sessionId, row._count._all]));

    return sessions.map(({ messages, ...session }) => ({
      ...session,
      latestMessage: messages[0] ?? null,
      unreadCount: unreadBySessionId.get(session.id) ?? 0,
    }));
  }

  async findById(companyId: string, sessionId: string): Promise<ChatSessionWithMessages> {
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, companyId },
      include: { messages: { orderBy: { seq: "asc" } } },
    });
    if (!session) {
      throw new NotFoundException({ message: "Chat session not found", code: "CHAT_SESSION_NOT_FOUND" });
    }
    return session;
  }

  async findMessages(companyId: string, sessionId: string): Promise<ChatMessage[]> {
    const session = await prisma.chatSession.findFirst({ where: { id: sessionId, companyId } });
    if (!session) {
      throw new NotFoundException({ message: "Chat session not found", code: "CHAT_SESSION_NOT_FOUND" });
    }
    return prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { seq: "asc" } });
  }

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

  /**
   * Management header badge (notification audit, 2026-08-17; corrected
   * 2026-08-17 — contract mismatch found by Cursor audit). The badge must
   * be the total count of unread VISITOR *messages*, not the count of
   * sessions that happen to have at least one unread message — a session
   * with 5 unread visitor messages must contribute 5, not 1. A VISITOR
   * message counts as unread when it's newer than that session's
   * lastReadByAdminAt (or the admin has never read the session at all);
   * ADMIN messages never count.
   *
   * Counting happens at the DB layer via a single `ChatMessage.count`. The
   * per-session `lastReadByAdminAt` watermarks are fetched first (one small
   * row per session, no message bodies) because Prisma's query layer can't
   * express "message.createdAt > this message's own session's watermark"
   * as a single filter — each session's watermark becomes one OR branch of
   * the count query.
   */
  async countUnread(companyId: string): Promise<number> {
    const sessions = await prisma.chatSession.findMany({
      where: { companyId },
      select: { id: true, lastReadByAdminAt: true },
    });
    if (sessions.length === 0) return 0;

    return prisma.chatMessage.count({
      where: this.unreadVisitorWhere(companyId, sessions),
    });
  }

  /**
   * Shared VISITOR-unread filter: message.createdAt > that session's
   * lastReadByAdminAt, or every VISITOR message when the watermark is null.
   * Used by both the header total (count) and Inbox per-session (groupBy)
   * so the two cannot drift.
   */
  private unreadVisitorWhere(
    companyId: string,
    sessions: { id: string; lastReadByAdminAt: Date | null }[],
  ): Prisma.ChatMessageWhereInput {
    return {
      companyId,
      senderType: "VISITOR",
      OR: sessions.map((session) => ({
        sessionId: session.id,
        createdAt: session.lastReadByAdminAt ? { gt: session.lastReadByAdminAt } : undefined,
      })),
    };
  }

  /**
   * Explicit admin action, same convention as ContactMessage's
   * PENDING->READ PATCH — not implicit on every fetch, since findById is
   * also used by the visitor-facing gateway reconnect path (see
   * chat.gateway.ts) and must NOT be treated as an admin read.
   *
   * `readUpTo` (timing fix, 2026-08-17 audit — Gap A/B): the caller passes
   * the createdAt of the newest message it actually fetched/rendered,
   * rather than this always stamping wall-clock "now". Two guards make that
   * safe against both audit-identified races:
   *  - Gap B (initial fetch vs. mark-read race): a visitor message that
   *    arrives between the page's GET and this PATCH lands AFTER the
   *    caller-supplied `readUpTo` snapshot, so it can never be swallowed by
   *    this call — it stays correctly unread until a later markRead
   *    explicitly covers it.
   *  - Gap A (live messages while the page is open): the page calls this
   *    again for each newly rendered VISITOR message, each with its own
   *    later `readUpTo`. Concurrent/out-of-order requests (the initial
   *    load's call landing after a live-message call, or vice versa) are
   *    handled by only ever moving the stored value FORWARD — an older
   *    `readUpTo` arriving late can never regress a newer one.
   * `readUpTo` is also clamped to "now" so a bad/future client value can't
   * push the watermark ahead of reality.
   */
  async markRead(companyId: string, sessionId: string, rawInput: unknown = {}): Promise<ChatSession> {
    const parsed = chatSessionMarkReadSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid mark-read payload",
        code: "INVALID_CHAT_SESSION_MARK_READ",
        issues: parsed.error.flatten(),
      });
    }

    const session = await prisma.chatSession.findFirst({ where: { id: sessionId, companyId } });
    if (!session) {
      throw new NotFoundException({ message: "Chat session not found", code: "CHAT_SESSION_NOT_FOUND" });
    }

    const now = new Date();
    const requested = parsed.data.readUpTo ? new Date(parsed.data.readUpTo) : now;
    const candidate = requested > now ? now : requested;
    const next =
      session.lastReadByAdminAt && session.lastReadByAdminAt > candidate ? session.lastReadByAdminAt : candidate;

    return prisma.chatSession.update({
      where: { id: sessionId },
      data: { lastReadByAdminAt: next },
    });
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002");
}
