/**
 * Regression: admin Better Auth MUST take precedence over CHAT_SESSION_TOKEN
 * when both cookies coexist (same browser: widget then Portal).
 */
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@medcal/auth";
import { prisma } from "@medcal/db";
import { signChatSessionToken } from "@medcal/shared";
import { AppModule } from "../../app.module";
import { ChatSessionsService } from "./chat-sessions.service";
import { ContactMessagesService } from "../contact-messages/contact-messages.service";

const COMPANY_ID = process.env.COMPANY_ID ?? "PKM";
const CHAT_TOKEN_SECRET = process.env.CHAT_SESSION_TOKEN_SECRET!;

const chatSessions = new ChatSessionsService(new ContactMessagesService());

let nestApp: Awaited<ReturnType<typeof NestFactory.create>>;
let baseUrl: string;

const cleanup = {
  sessionIds: [] as string[],
  contactMessageIds: [] as string[],
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
    name: "Precedence Test Visitor",
    email: `precedence-${randomUUID().slice(0, 8)}@example.com`,
    message: "Halo dari visitor",
    ...overrides,
  });
  cleanup.sessionIds.push(result.id);
  if (result.contactMessageId) cleanup.contactMessageIds.push(result.contactMessageId);
  return result;
}

function visitorCookieFor(sessionId: string): string {
  return `chat_session_token=${signChatSessionToken(sessionId, CHAT_TOKEN_SECRET, 60_000)}`;
}

async function createAdminCookie(): Promise<{ cookie: string; userId: string }> {
  const shortId = randomUUID().slice(0, 8);
  const email = `precedence-admin-${shortId}@kalibrasimedika.co.id`;
  const password = "Password123!";

  await prisma.emailWhitelist.upsert({
    where: { email },
    create: { email, status: "ACTIVE", createdBy: null },
    update: { status: "ACTIVE" },
  });

  const signUp = await auth.api.signUpEmail({
    body: { email, password, name: "Precedence Test Admin" },
    headers: new Headers({ origin: "http://apps.localhost:3003" }),
  });
  cleanup.userIds.push(signUp.user.id);

  await prisma.user.update({
    where: { id: signUp.user.id },
    data: { status: "ACTIVE" },
  });

  await prisma.userMembership.create({
    data: { userId: signUp.user.id, companyId: COMPANY_ID, role: "ADMIN" },
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

  await prisma.userMembership.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
  await prisma.emailWhitelist.deleteMany({ where: { email: { endsWith: "@kalibrasimedika.co.id" } } });
}, 30_000);

describe("Socket identity precedence (admin over visitor token)", () => {
  it("admin-only cookie → ADMIN identity, reply persisted as ADMIN", async () => {
    const customerSession = await createVisitorSession();
    const { cookie: adminCookie, userId } = await createAdminCookie();

    const portalSocket = connect(adminCookie);
    await waitFor(portalSocket, "connect");

    portalSocket.emit("join_session", { sessionId: customerSession.id });
    await waitFor(portalSocket, "history");

    const replyBody = "Balasan admin (admin-only cookie)";
    portalSocket.emit("send_message", {
      sessionId: customerSession.id,
      body: replyBody,
      clientMessageId: randomUUID(),
    });
    const ack = await waitFor<{ message: { senderType: string; sessionId: string; body: string } }>(
      portalSocket,
      "message_ack",
    );

    const dbRow = await prisma.chatMessage.findFirstOrThrow({
      where: { sessionId: customerSession.id, body: replyBody },
    });

    expect(ack.message.senderType).toBe("ADMIN");
    expect(ack.message.sessionId).toBe(customerSession.id);
    expect(dbRow.senderType).toBe("ADMIN");
    expect(dbRow.senderUserId).toBe(userId);
  }, 15_000);

  it("valid ADMIN + valid CHAT_SESSION_TOKEN → ADMIN, join customer session, reply persisted as ADMIN", async () => {
    const customerSession = await createVisitorSession();
    const adminOwnVisitorSession = await createVisitorSession({
      name: "Admin Browser Widget Session",
      email: `admin-widget-${randomUUID().slice(0, 8)}@example.com`,
      message: "Admin tested widget earlier",
    });

    const { cookie: adminCookie, userId } = await createAdminCookie();
    const combinedCookie = `${visitorCookieFor(adminOwnVisitorSession.id)}; ${adminCookie}`;

    const portalSocket = connect(combinedCookie);
    await waitFor(portalSocket, "connect");

    portalSocket.emit("join_session", { sessionId: customerSession.id });
    const history = await waitFor<{ sessionId: string }>(portalSocket, "history");
    expect(history.sessionId).toBe(customerSession.id);

    const replyBody = "Balasan dari portal (both cookies present)";
    portalSocket.emit("send_message", {
      sessionId: customerSession.id,
      body: replyBody,
      clientMessageId: randomUUID(),
    });
    const ack = await waitFor<{ message: { senderType: string; sessionId: string; body: string } }>(
      portalSocket,
      "message_ack",
    );

    const dbInCustomer = await prisma.chatMessage.findFirstOrThrow({
      where: { sessionId: customerSession.id, body: replyBody },
    });
    const dbInAdminWidget = await prisma.chatMessage.findFirst({
      where: { sessionId: adminOwnVisitorSession.id, body: replyBody },
    });

    expect(ack.message.senderType).toBe("ADMIN");
    expect(ack.message.sessionId).toBe(customerSession.id);
    expect(dbInCustomer.senderType).toBe("ADMIN");
    expect(dbInCustomer.senderUserId).toBe(userId);
    expect(dbInAdminWidget).toBeNull();
  }, 15_000);

  it("visitor-only cookie → VISITOR identity on connect (history for token session)", async () => {
    const session = await createVisitorSession();
    const visitorSocket = connect(visitorCookieFor(session.id));
    const history = await waitFor<{ sessionId: string }>(visitorSocket, "history");
    expect(history.sessionId).toBe(session.id);
  });
});
