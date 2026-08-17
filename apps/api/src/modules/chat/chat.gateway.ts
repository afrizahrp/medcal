import { Inject, Injectable } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
// Value import (not type-only): `Server` is also used as the type of a
// @WebSocketServer()-decorated property, and a real runtime reference is
// the safer choice for anything decorator metadata touches under this
// project's esbuild-based dev runtime (see the @Inject() note below).
import { Server, Socket } from "socket.io";
import { serializeChatMessage } from "./chat-serialization";
import { ChatSessionsService } from "./chat-sessions.service";
import { ChatSocketAuthError, requireChatPermission, resolveSocketIdentity, roomForCompany, roomForSession } from "./chat-socket-auth";
import type { SocketIdentity } from "./chat-socket-auth";

function parseTrustedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

interface JoinSessionPayload {
  sessionId?: unknown;
}

interface SendMessagePayload {
  sessionId?: unknown;
  body?: unknown;
  clientMessageId?: unknown;
}

interface CloseSessionPayload {
  sessionId?: unknown;
}

/**
 * Phase 2 real-time transport. This gateway does NOT contain business logic
 * — it is a thin, authorization-gated wrapper around ChatSessionsService
 * (Phase 1). Every handler follows the same invariant before touching a
 * ChatSession:
 *
 *   VISITOR: authorizedSessionId (from the verified ChatSessionToken,
 *            resolved once at handleConnection) === targetSessionId.
 *            A visitor socket is auto-joined to exactly that one room at
 *            connect time and NEVER accepts a client-supplied sessionId.
 *
 *   ADMIN:   every operation re-derives companyId from the authenticated
 *            identity (never the socket payload) and re-checks the
 *            required chat:* permission; ChatSessionsService's own
 *            companyId-scoped queries are what actually enforce "this
 *            session belongs to my company" at the DB level.
 *
 * Room membership (`chat:<sessionId>`) is a transport detail only — it is
 * established AFTER authorization succeeds, never before.
 */
@Injectable()
@WebSocketGateway({
  cors: {
    origin: parseTrustedOrigins(process.env.TRUSTED_ORIGINS),
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // Explicit @Inject() — plain type-based constructor injection silently
  // resolves to undefined under this project's tsx dev-server runtime
  // (confirmed: design:paramtypes reflection isn't reliably emitted there,
  // unlike under Vitest's transform, where this same code worked). Every
  // other provider in this codebase already follows this explicit-token
  // convention (see contact-topics.controller.ts, whitelist.controller.ts).
  constructor(@Inject(ChatSessionsService) private readonly chatSessions: ChatSessionsService) {}

  async handleConnection(socket: Socket): Promise<void> {
    // Stored as a promise, not just the resolved value: @SubscribeMessage
    // handlers can fire on this same socket before this async function
    // finishes (Socket.IO does not serialize "connection" against other
    // incoming packets) — every handler below awaits this same promise via
    // getIdentity() instead of reading socket.data.identity synchronously,
    // so a message sent immediately after connecting can never race past
    // authentication.
    const identityPromise = resolveSocketIdentity(socket);
    socket.data.identityPromise = identityPromise;

    try {
      const identity = await identityPromise;
      socket.data.identity = identity;

      if (identity.type === "VISITOR") {
        // The visitor's only authorized room, joined immediately —
        // there is no "join_session" event for visitors at all (Attack C:
        // arbitrary room joins from client payload are simply not a
        // reachable code path for this identity type).
        await socket.join(roomForSession(identity.sessionId));
        const messages = await this.chatSessions.findMessages(identity.companyId, identity.sessionId);
        socket.emit("history", { sessionId: identity.sessionId, messages: messages.map(serializeChatMessage) });
      } else if (requireChatPermission(identity.role, "read")) {
        // Company-scoped unread fan-out for Management header. companyId is
        // the authenticated membership, never a client payload. Visitors and
        // staff without chat:read are not admitted.
        await socket.join(roomForCompany(identity.companyId));
      }
    } catch (err) {
      const code = err instanceof ChatSocketAuthError ? err.code : "UNAUTHENTICATED";
      socket.emit("error", { code, message: "Authentication failed" });
      socket.disconnect(true);
    }
  }

  handleDisconnect(_socket: Socket): void {
    // No presence/typing tracking in Phase 2 — nothing to clean up beyond
    // what Socket.IO already does (room membership is torn down for us).
  }

  @SubscribeMessage("join_session")
  async handleJoinSession(@ConnectedSocket() socket: Socket, @MessageBody() body: JoinSessionPayload): Promise<void> {
    const identity = await this.getIdentity(socket);
    if (!identity || identity.type !== "ADMIN") {
      this.emitError(socket, "FORBIDDEN", "Only staff may join a session by id");
      return;
    }
    if (!requireChatPermission(identity.role, "read")) {
      this.emitError(socket, "FORBIDDEN", "Missing chat:read permission");
      return;
    }

    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;
    if (!sessionId) {
      this.emitError(socket, "BAD_REQUEST", "sessionId is required");
      return;
    }

    try {
      // companyId here is the AUTHENTICATED admin's company, never anything
      // from the payload — ChatSessionsService.findById scopes the query by
      // it, so a foreign-company sessionId simply doesn't resolve (Attack F).
      const session = await this.chatSessions.findById(identity.companyId, sessionId);
      await socket.join(roomForSession(sessionId));
      socket.emit("history", { sessionId, messages: session.messages.map(serializeChatMessage) });
    } catch {
      this.emitError(socket, "NOT_FOUND", "Chat session not found");
    }
  }

  @SubscribeMessage("send_message")
  async handleSendMessage(@ConnectedSocket() socket: Socket, @MessageBody() body: SendMessagePayload): Promise<void> {
    const identity = await this.getIdentity(socket);
    if (!identity) {
      this.emitError(socket, "UNAUTHENTICATED", "Not authenticated");
      return;
    }

    const text = typeof body?.body === "string" ? body.body : undefined;
    const clientMessageId = typeof body?.clientMessageId === "string" ? body.clientMessageId : undefined;

    let sessionId: string;
    if (identity.type === "VISITOR") {
      // The visitor NEVER supplies sessionId — even if the payload contains
      // one, it is ignored entirely in favor of the token-derived session
      // (Attack B/C: a client-supplied sessionId can never override this).
      sessionId = identity.sessionId;
    } else {
      if (!requireChatPermission(identity.role, "reply")) {
        this.emitError(socket, "FORBIDDEN", "Missing chat:reply permission");
        return;
      }
      const requested = typeof body?.sessionId === "string" ? body.sessionId : undefined;
      if (!requested) {
        this.emitError(socket, "BAD_REQUEST", "sessionId is required");
        return;
      }
      sessionId = requested;
    }

    try {
      // senderType is derived from the authenticated identity, never from
      // the payload — a VISITOR socket can never persist an ADMIN message
      // and vice versa (Attack: client-supplied senderType/senderUserId).
      // companyId is likewise always the authenticated identity's, and
      // ChatSessionsService re-validates session ownership by it on every
      // call — persistence happens before any broadcast, and only on
      // success does the room receive the message.
      const message = await this.chatSessions.addMessage(
        identity.companyId,
        sessionId,
        {
          senderType: identity.type,
          body: text,
          clientMessageId,
        },
        identity.type === "ADMIN" ? identity.userId : undefined,
      );
      const wireMessage = serializeChatMessage(message);
      socket.emit("message_ack", { clientMessageId, message: wireMessage });
      this.server.to(roomForSession(sessionId)).emit("message", wireMessage);
      // Live unread badge: VISITOR messages also reach company admins who
      // are not in this session room (Dashboard / Inbox / another thread).
      // ADMIN replies stay session-scoped so they do not refetch unread-count.
      if (wireMessage.senderType === "VISITOR") {
        this.server.to(roomForCompany(identity.companyId)).emit("message", wireMessage);
      }
    } catch (err) {
      this.emitSendFailure(socket, err);
    }
  }

  @SubscribeMessage("close_session")
  async handleCloseSession(@ConnectedSocket() socket: Socket, @MessageBody() body: CloseSessionPayload): Promise<void> {
    const identity = await this.getIdentity(socket);
    if (!identity || identity.type !== "ADMIN") {
      this.emitError(socket, "FORBIDDEN", "Only staff may close a session");
      return;
    }
    if (!requireChatPermission(identity.role, "close")) {
      this.emitError(socket, "FORBIDDEN", "Missing chat:close permission");
      return;
    }

    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;
    if (!sessionId) {
      this.emitError(socket, "BAD_REQUEST", "sessionId is required");
      return;
    }

    try {
      const session = await this.chatSessions.closeSession(identity.companyId, sessionId);
      this.server.to(roomForSession(sessionId)).emit("session_closed", { sessionId, closedAt: session.closedAt });
    } catch {
      this.emitError(socket, "NOT_FOUND", "Chat session not found");
    }
  }

  private async getIdentity(socket: Socket): Promise<SocketIdentity | undefined> {
    try {
      return await (socket.data.identityPromise as Promise<SocketIdentity> | undefined);
    } catch {
      return undefined;
    }
  }

  private emitError(socket: Socket, code: string, message: string): void {
    socket.emit("error", { code, message });
  }

  private emitSendFailure(socket: Socket, err: unknown): void {
    const code =
      err && typeof err === "object" && "response" in err
        ? ((err as { response?: { code?: string } }).response?.code ?? "SEND_FAILED")
        : "SEND_FAILED";
    this.emitError(socket, code, "Message could not be sent");
  }
}
