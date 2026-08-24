import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@medcal/auth";
import { prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { signChatSessionToken } from "@medcal/shared";
import { AppModule } from "../../app.module";
import { ChatSessionsService } from "./chat-sessions.service";
import { roomForCompany } from "./chat-socket-auth";
import { ContactMessagesService } from "../contact-messages/contact-messages.service";

// Real Postgres + a real listening Nest app (HTTP + Socket.IO on the same
// server), same "no mocking" convention as chat-sessions.service.test.ts /
// registration-gate.integration.test.ts. This is the BLOCKING acceptance
// suite for Phase 2: visitor-cross-session and admin-cross-company access
// must both provably fail against the real gateway, not a stand-in.

const COMPANY_ID = process.env.COMPANY_ID ?? "PKM";
const FOREIGN_COMPANY_ID = "ZZZ";
const CHAT_TOKEN_SECRET = process.env.CHAT_SESSION_TOKEN_SECRET!;

const chatSessions = new ChatSessionsService(new ContactMessagesService());

let nestApp: Awaited<ReturnType<typeof NestFactory.create>>;
let baseUrl: string;

const cleanup = {
  sessionIds: [] as string[],
  contactMessageIds: [] as string[],
  leadIds: [] as string[],
  userIds: [] as string[],
  sockets: [] as ClientSocket[],
};

function waitFor<T = unknown>(socket: ClientSocket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connect(cookie: string): ClientSocket {
  const socket = ioClient(baseUrl, {
    transports: ["websocket"],
    forceNew: true,
    extraHeaders: { Cookie: cookie },
    reconnection: false,
  });
  cleanup.sockets.push(socket);
  return socket;
}

async function createVisitorSession(overrides: Record<string, unknown> = {}) {
  const result = await chatSessions.createSession(COMPANY_ID, {
    name: "Security Test Visitor",
    email: `sec-${randomUUID().slice(0, 8)}@example.com`,
    message: "Halo",
    ...overrides,
  });
  cleanup.sessionIds.push(result.id);
  if (result.contactMessageId) cleanup.contactMessageIds.push(result.contactMessageId);
  return result;
}

function tokenFor(sessionId: string): string {
  return signChatSessionToken(sessionId, CHAT_TOKEN_SECRET, 60_000);
}

function cookieFor(sessionId: string): string {
  return `chat_session_token=${tokenFor(sessionId)}`;
}

async function createAdmin(role: MembershipRole): Promise<{ cookie: string; userId: string }> {
  const shortId = randomUUID().slice(0, 8);
  const email = `chat-${shortId}@kalibrasimedika.co.id`;
  const password = "Password123!";

  await prisma.emailWhitelist.upsert({
    where: { email },
    create: { email, status: "ACTIVE", createdBy: null },
    update: { status: "ACTIVE" },
  });

  const signUp = await auth.api.signUpEmail({
    body: { email, password, name: "Chat Test Admin" },
    headers: new Headers({ origin: "http://apps.localhost:3003" }),
  });
  cleanup.userIds.push(signUp.user.id);

  await prisma.user.update({
    where: { id: signUp.user.id },
    data: { status: "ACTIVE" },
  });

  await prisma.userMembership.create({
    data: { userId: signUp.user.id, companyId: COMPANY_ID, role },
  });

  const signInResponse = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const setCookies =
    typeof signInResponse.headers.getSetCookie === "function"
      ? signInResponse.headers.getSetCookie()
      : [signInResponse.headers.get("set-cookie") ?? ""].filter(Boolean);
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");

  return { cookie, userId: signUp.user.id };
}

beforeAll(async () => {
  await prisma.company.upsert({
    where: { id: FOREIGN_COMPANY_ID },
    create: { id: FOREIGN_COMPANY_ID, name: "Foreign Test Co" },
    update: {},
  });

  nestApp = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  nestApp.useWebSocketAdapter(new IoAdapter(nestApp));
  await nestApp.listen(0);
  const address = nestApp.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  for (const socket of cleanup.sockets) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  await nestApp.close();

  await prisma.chatMessage.deleteMany({ where: { sessionId: { in: cleanup.sessionIds } } });
  await prisma.chatSession.deleteMany({ where: { id: { in: cleanup.sessionIds } } });
  await prisma.contactMessage.deleteMany({ where: { id: { in: cleanup.contactMessageIds } } });
  if (cleanup.leadIds.length) await prisma.lead.deleteMany({ where: { id: { in: cleanup.leadIds } } });

  await prisma.userMembership.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
  await prisma.emailWhitelist.deleteMany({ where: { email: { endsWith: "@kalibrasimedika.co.id" } } });

  await prisma.company.deleteMany({ where: { id: FOREIGN_COMPANY_ID } });
}, 30_000);

describe("Visitor isolation (Attack A/B/C)", () => {
  it("Visitor A receives only their own session's history on connect", async () => {
    const sessionA = await createVisitorSession();
    const socket = connect(cookieFor(sessionA.id));
    const history = await waitFor<{ sessionId: string }>(socket, "history");
    expect(history.sessionId).toBe(sessionA.id);
  });

  it("Visitor A cannot read Visitor B's session — a client-supplied sessionId in send_message is ignored, message lands in A's own session", async () => {
    const sessionA = await createVisitorSession();
    const sessionB = await createVisitorSession();
    const socketA = connect(cookieFor(sessionA.id));
    await waitFor(socketA, "history");

    socketA.emit("send_message", { sessionId: sessionB.id, body: "trying to hit B" });
    const ack = await waitFor<{ message: { sessionId: string; body: string } }>(socketA, "message_ack");

    expect(ack.message.sessionId).toBe(sessionA.id);
    const inSessionB = await prisma.chatMessage.count({ where: { sessionId: sessionB.id, body: "trying to hit B" } });
    expect(inSessionB).toBe(0);
  });

  it("Visitor A never receives Visitor B's broadcast messages (room isolation)", async () => {
    const sessionA = await createVisitorSession();
    const sessionB = await createVisitorSession();
    const socketA = connect(cookieFor(sessionA.id));
    const socketB = connect(cookieFor(sessionB.id));
    await waitFor(socketA, "history");
    await waitFor(socketB, "history");

    let leaked = false;
    socketA.on("message", () => {
      leaked = true;
    });

    socketB.emit("send_message", { body: "B's own message" });
    await waitFor(socketB, "message_ack");
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(leaked).toBe(false);
  });

  it("token tampering is rejected — connection is disconnected with an error, no history delivered", async () => {
    const sessionA = await createVisitorSession();
    const tampered = tokenFor(sessionA.id).slice(0, -2) + "zz";
    const socket = connect(`chat_session_token=${tampered}`);

    const errorEvent = await waitFor<{ code: string }>(socket, "error");
    expect(errorEvent.code).toBe("INVALID_TOKEN");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(socket.connected).toBe(false);
  });

  it("a token for a nonexistent session is rejected", async () => {
    const socket = connect(cookieFor("nonexistent-session-id"));
    const errorEvent = await waitFor<{ code: string }>(socket, "error");
    expect(errorEvent.code).toBe("SESSION_NOT_FOUND");
  });

  it("CLOSED session: visitor may still read history but cannot send a new message", async () => {
    const session = await createVisitorSession();
    await chatSessions.closeSession(COMPANY_ID, session.id);

    const socket = connect(cookieFor(session.id));
    const history = await waitFor<{ sessionId: string }>(socket, "history");
    expect(history.sessionId).toBe(session.id);

    socket.emit("send_message", { body: "should be rejected" });
    const errorEvent = await waitFor<{ code: string }>(socket, "error");
    expect(errorEvent.code).toBe("CHAT_SESSION_CLOSED");
  });
});

describe("Admin authorization (Attack F/G/H/I)", () => {
  it("ADMIN with chat:read/reply/close can join, read, send, and close a same-company session; senderUserId is server-derived from the authenticated identity", async () => {
    const session = await createVisitorSession();
    const { cookie, userId } = await createAdmin("ADMIN");
    const socket = connect(cookie);

    socket.emit("join_session", { sessionId: session.id });
    const history = await waitFor<{ sessionId: string }>(socket, "history");
    expect(history.sessionId).toBe(session.id);

    socket.emit("send_message", {
      sessionId: session.id,
      body: "Balasan admin",
      clientMessageId: randomUUID(),
      senderUserId: "someone-else",
    });
    const ack = await waitFor<{ message: { senderType: string; senderUserId: string | null } }>(socket, "message_ack");
    expect(ack.message.senderType).toBe("ADMIN");
    expect(ack.message.senderUserId).toBe(userId);

    socket.emit("close_session", { sessionId: session.id });
    const closed = await waitFor<{ sessionId: string }>(socket, "session_closed");
    expect(closed.sessionId).toBe(session.id);
  });

  it("ADMIN with coexisting CHAT_SESSION_TOKEN still resolves as ADMIN — reply reaches the requested customer session", async () => {
    const customerSession = await createVisitorSession();
    const adminWidgetSession = await createVisitorSession({
      name: "Admin Widget Session",
      email: `admin-widget-${randomUUID().slice(0, 8)}@example.com`,
      message: "Earlier widget message",
    });
    const { cookie: adminCookie, userId } = await createAdmin("ADMIN");
    const combinedCookie = `${cookieFor(adminWidgetSession.id)}; ${adminCookie}`;

    const socket = connect(combinedCookie);
    await waitFor(socket, "connect");

    socket.emit("join_session", { sessionId: customerSession.id });
    const history = await waitFor<{ sessionId: string }>(socket, "history");
    expect(history.sessionId).toBe(customerSession.id);

    const replyBody = "Admin reply with both cookies";
    socket.emit("send_message", {
      sessionId: customerSession.id,
      body: replyBody,
      clientMessageId: randomUUID(),
    });
    const ack = await waitFor<{ message: { senderType: string; sessionId: string; senderUserId: string | null } }>(
      socket,
      "message_ack",
    );

    expect(ack.message.senderType).toBe("ADMIN");
    expect(ack.message.sessionId).toBe(customerSession.id);
    expect(ack.message.senderUserId).toBe(userId);

    const dbRow = await prisma.chatMessage.findFirstOrThrow({
      where: { sessionId: customerSession.id, body: replyBody },
    });
    expect(dbRow.senderType).toBe("ADMIN");
    expect(dbRow.senderUserId).toBe(userId);
  });

  it("Admin (company PKM) cannot join, read, send to, or close a foreign-company session", async () => {
    const foreignSession = await prisma.chatSession.create({
      data: { companyId: FOREIGN_COMPANY_ID, visitorName: "Foreign Visitor", visitorEmail: `f-${randomUUID().slice(0, 8)}@example.com` },
    });
    cleanup.sessionIds.push(foreignSession.id);

    const { cookie } = await createAdmin("ADMIN");
    const socket = connect(cookie);

    socket.emit("join_session", { sessionId: foreignSession.id });
    const joinError = await waitFor<{ code: string }>(socket, "error");
    expect(joinError.code).toBe("NOT_FOUND");

    socket.emit("send_message", { sessionId: foreignSession.id, body: "cross-company attempt" });
    const sendError = await waitFor<{ code: string }>(socket, "error");
    expect(["CHAT_SESSION_NOT_FOUND", "NOT_FOUND"]).toContain(sendError.code);

    socket.emit("close_session", { sessionId: foreignSession.id });
    const closeError = await waitFor<{ code: string }>(socket, "error");
    expect(closeError.code).toBe("NOT_FOUND");

    const stillOpen = await prisma.chatSession.findUniqueOrThrow({ where: { id: foreignSession.id } });
    expect(stillOpen.status).toBe("OPEN");
  });

  it("Admin without chat:read (SUPERVISOR) cannot join or read", async () => {
    const session = await createVisitorSession();
    const { cookie } = await createAdmin("SUPERVISOR");
    const socket = connect(cookie);

    socket.emit("join_session", { sessionId: session.id });
    const errorEvent = await waitFor<{ code: string }>(socket, "error");
    expect(errorEvent.code).toBe("FORBIDDEN");
  });

  it("Admin without chat:reply cannot send (SUPERVISOR)", async () => {
    const session = await createVisitorSession();
    const { cookie } = await createAdmin("SUPERVISOR");
    const socket = connect(cookie);

    socket.emit("send_message", { sessionId: session.id, body: "should be forbidden" });
    const errorEvent = await waitFor<{ code: string }>(socket, "error");
    expect(errorEvent.code).toBe("FORBIDDEN");
  });

  it("Admin without chat:close cannot close (SUPERVISOR)", async () => {
    const session = await createVisitorSession();
    const { cookie } = await createAdmin("SUPERVISOR");
    const socket = connect(cookie);

    socket.emit("close_session", { sessionId: session.id });
    const errorEvent = await waitFor<{ code: string }>(socket, "error");
    expect(errorEvent.code).toBe("FORBIDDEN");

    const stillOpen = await prisma.chatSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stillOpen.status).toBe("OPEN");
  });
});

describe("Persistence, idempotency, and client-controlled-field rejection", () => {
  it("duplicate clientMessageId over the socket creates exactly one ChatMessage row", async () => {
    const session = await createVisitorSession();
    const socket = connect(cookieFor(session.id));
    await waitFor(socket, "history");

    const clientMessageId = randomUUID();
    socket.emit("send_message", { body: "idempotent send", clientMessageId });
    const first = await waitFor<{ message: { id: string } }>(socket, "message_ack");

    socket.emit("send_message", { body: "idempotent send", clientMessageId });
    const second = await waitFor<{ message: { id: string } }>(socket, "message_ack");

    expect(second.message.id).toBe(first.message.id);
    const count = await prisma.chatMessage.count({ where: { sessionId: session.id, clientMessageId } });
    expect(count).toBe(1);
  });

  it("a visitor's client-supplied senderType is ignored — persisted message is always senderType VISITOR", async () => {
    const session = await createVisitorSession();
    const socket = connect(cookieFor(session.id));
    await waitFor(socket, "history");

    socket.emit("send_message", { body: "spoof attempt", senderType: "ADMIN", senderUserId: "someone-else" });
    const ack = await waitFor<{ message: { senderType: string; senderUserId: string | null } }>(socket, "message_ack");

    expect(ack.message.senderType).toBe("VISITOR");
    expect(ack.message.senderUserId).toBeNull();
  });

  it("a client-supplied companyId in the payload is ignored — message persists under the authenticated company", async () => {
    const session = await createVisitorSession();
    const socket = connect(cookieFor(session.id));
    await waitFor(socket, "history");

    socket.emit("send_message", { body: "companyId spoof", companyId: FOREIGN_COMPANY_ID });
    const ack = await waitFor<{ message: { companyId: string } }>(socket, "message_ack");

    expect(ack.message.companyId).toBe(COMPANY_ID);
  });
});

describe("Company admin room — live unread fan-out", () => {
  async function connectedAdmin(role: MembershipRole = "ADMIN") {
    const { cookie, userId } = await createAdmin(role);
    const socket = connect(cookie);
    await waitFor(socket, "connect");
    // handleConnection joins chat:company:<id> after identity resolves.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { socket, userId };
  }

  it("company room name is server-derived from the authenticated companyId", () => {
    expect(roomForCompany(COMPANY_ID)).toBe(`chat:company:${COMPANY_ID}`);
    expect(roomForCompany(FOREIGN_COMPANY_ID)).toBe(`chat:company:${FOREIGN_COMPANY_ID}`);
  });

  it("a VISITOR message is delivered to a same-company admin who has not joined the session", async () => {
    const session = await createVisitorSession();
    const { socket: admin } = await connectedAdmin("ADMIN");
    const visitor = connect(cookieFor(session.id));
    await waitFor(visitor, "history");

    const incoming = waitFor<{
      senderType: string;
      sessionId: string;
      id: string;
      createdAt: string;
      body: string;
    }>(admin, "message");
    visitor.emit("send_message", { body: "live unread ping" });
    const payload = await incoming;

    expect(payload.senderType).toBe("VISITOR");
    expect(payload.sessionId).toBe(session.id);
    expect(payload.body).toBe("live unread ping");
    expect(payload.id).toBeTruthy();
    expect(payload.createdAt).toBeTruthy();
  });

  it("the same VISITOR message reaches every same-company admin with chat:read, not only one socket", async () => {
    const session = await createVisitorSession();
    const { socket: adminA } = await connectedAdmin("ADMIN");
    const { socket: adminB } = await connectedAdmin("ADMIN");
    const visitor = connect(cookieFor(session.id));
    await waitFor(visitor, "history");

    const incomingA = waitFor<{ id: string; sessionId: string; senderType: string }>(adminA, "message");
    const incomingB = waitFor<{ id: string; sessionId: string; senderType: string }>(adminB, "message");
    visitor.emit("send_message", { body: "fan-out to both admins" });
    const [payloadA, payloadB] = await Promise.all([incomingA, incomingB]);

    expect(payloadA.senderType).toBe("VISITOR");
    expect(payloadB.senderType).toBe("VISITOR");
    expect(payloadA.sessionId).toBe(session.id);
    expect(payloadB.sessionId).toBe(session.id);
    expect(payloadA.id).toBe(payloadB.id);
  });

  it("staff whose only membership is a foreign company cannot connect — they never join this company's unread room", async () => {
    const shortId = randomUUID().slice(0, 8);
    const email = `chat-foreign-${shortId}@kalibrasimedika.co.id`;
    const password = "Password123!";

    await prisma.emailWhitelist.upsert({
      where: { email },
      create: { email, status: "ACTIVE", createdBy: null },
      update: { status: "ACTIVE" },
    });

    const signUp = await auth.api.signUpEmail({
      body: { email, password, name: "Foreign Chat Admin" },
      headers: new Headers({ origin: "http://apps.localhost:3003" }),
    });
    cleanup.userIds.push(signUp.user.id);
    await prisma.userMembership.create({
      data: { userId: signUp.user.id, companyId: FOREIGN_COMPANY_ID, role: "ADMIN" },
    });

    const signInResponse = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    const setCookies =
      typeof signInResponse.headers.getSetCookie === "function"
        ? signInResponse.headers.getSetCookie()
        : [signInResponse.headers.get("set-cookie") ?? ""].filter(Boolean);
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");

    const socket = connect(cookie);
    const errorEvent = await waitFor<{ code: string }>(socket, "error");
    expect(errorEvent.code).toBe("NO_MEMBERSHIP");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(socket.connected).toBe(false);
  });

  it("staff without chat:read (SUPERVISOR) are not in the company unread room", async () => {
    const session = await createVisitorSession();
    const { socket: supervisor } = await connectedAdmin("SUPERVISOR");
    const visitor = connect(cookieFor(session.id));
    await waitFor(visitor, "history");

    let received = false;
    supervisor.on("message", () => {
      received = true;
    });
    visitor.emit("send_message", { body: "should not reach supervisor" });
    await waitFor(visitor, "message_ack");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toBe(false);
  });

  it("an ADMIN reply is not broadcast to the company unread room", async () => {
    const session = await createVisitorSession();
    const { socket: dashboardAdmin } = await connectedAdmin("ADMIN");
    const { socket: threadAdmin } = await connectedAdmin("ADMIN");
    threadAdmin.emit("join_session", { sessionId: session.id });
    await waitFor(threadAdmin, "history");

    let dashboardSawMessage = false;
    dashboardAdmin.on("message", () => {
      dashboardSawMessage = true;
    });

    threadAdmin.emit("send_message", { sessionId: session.id, body: "Admin reply only" });
    const ack = await waitFor<{ message: { senderType: string } }>(threadAdmin, "message_ack");
    expect(ack.message.senderType).toBe("ADMIN");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(dashboardSawMessage).toBe(false);
  });

  it("existing session-room broadcast still delivers VISITOR messages to the visitor", async () => {
    const session = await createVisitorSession();
    const visitor = connect(cookieFor(session.id));
    await waitFor(visitor, "history");

    const incoming = waitFor<{ senderType: string; sessionId: string; body: string }>(visitor, "message");
    visitor.emit("send_message", { body: "session room still works" });
    const payload = await incoming;
    expect(payload.senderType).toBe("VISITOR");
    expect(payload.sessionId).toBe(session.id);
    expect(payload.body).toBe("session room still works");
  });
});
