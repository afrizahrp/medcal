import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { ChatMessage, ChatSession, Prisma } from "@medcal/db";
import { chatMessageCreateSchema, chatSessionCreateSchema } from "@medcal/shared";
import { ContactMessagesService } from "../contact-messages/contact-messages.service";

export interface ChatSessionWithMessages extends ChatSession {
  messages: ChatMessage[];
}

export interface ChatSessionListItem extends ChatSession {
  latestMessage: ChatMessage | null;
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

    return prisma.$transaction(async (tx) => {
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

      const linked = await this.linkContactMessage(tx, session.id, contactMessage.id);

      return { ...linked, messages: [firstMessage] };
    });
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
   * recent activity. No pagination/unread tracking yet — an intentionally
   * minimal skeleton, same as Chat Inbox's own UI.
   */
  async findAll(companyId: string): Promise<ChatSessionListItem[]> {
    const sessions = await prisma.chatSession.findMany({
      where: { companyId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: { messages: { orderBy: { seq: "desc" }, take: 1 } },
    });
    return sessions.map(({ messages, ...session }) => ({
      ...session,
      latestMessage: messages[0] ?? null,
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
}

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002");
}
