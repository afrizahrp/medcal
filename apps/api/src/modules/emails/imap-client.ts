import { Logger } from "@nestjs/common";
import { loadEnv } from "@medcal/config";

export type FetchedImapMessage = {
  messageId: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  toName: string | null;
  ccEmail: string | null;
  subject: string;
  body: string;
  textBody: string | null;
  rfcInReplyTo: string | null;
  rfcReferences: string | null;
  receivedAt: Date;
};

const logger = new Logger("ImapClient");

const SYNC_LIMIT = 50;

export function imapSyncLimit(): number {
  return SYNC_LIMIT;
}

export async function fetchInboxFromHostinger(): Promise<FetchedImapMessage[]> {
  const env = loadEnv();
  if (!env.IMAP_HOST || !env.IMAP_USER || !env.IMAP_PASS) {
    throw new Error("EMAIL_NOT_CONFIGURED");
  }

  const Imap = require("imap") as typeof import("imap");
  const { simpleParser } = require("mailparser") as typeof import("mailparser");

  const imap = new Imap({
    user: env.IMAP_USER,
    password: env.IMAP_PASS,
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    tls: env.IMAP_TLS,
    tlsOptions: {
      rejectUnauthorized: env.IMAP_TLS_REJECT_UNAUTHORIZED,
    },
    connTimeout: 30000,
    authTimeout: 15000,
  });

  const messages: FetchedImapMessage[] = [];

  const openBox = (mailbox: string) =>
    new Promise<void>((resolve, reject) => {
      imap.openBox(mailbox, true, (err: Error | null) => {
        if (err) return reject(err);
        resolve();
      });
    });

  const fetchLast = () =>
    new Promise<void>((resolve, reject) => {
      imap.search(["ALL"], (err: Error | null, results: number[]) => {
        if (err) return reject(err);
        if (!results || results.length === 0) {
          logger.log("IMAP INBOX empty");
          return resolve();
        }

        const uids = results.slice(-SYNC_LIMIT);
        const f = imap.fetch(uids, { bodies: "", struct: true });
        const pending: Promise<void>[] = [];

        f.on("message", (msg: { on: Function; once: Function }) => {
          const chunks: Buffer[] = [];
          let uid: number | undefined;

          msg.on("body", (stream: NodeJS.ReadableStream) => {
            stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          });
          msg.once("attributes", (attrs: { uid?: number }) => {
            uid = attrs.uid;
          });
          msg.once("end", () => {
            pending.push(
              (async () => {
                try {
                  const raw = Buffer.concat(chunks);
                  const parsed = await simpleParser(raw);
                  const from = firstMailbox(parsed.from);
                  const to = firstMailbox(parsed.to);
                  const ccList = addressList(parsed.cc);
                  const messageId =
                    (parsed.messageId && String(parsed.messageId).trim()) ||
                    (uid != null ? `uid-${uid}` : null);
                  const inReplyTo = parsed.inReplyTo
                    ? Array.isArray(parsed.inReplyTo)
                      ? parsed.inReplyTo.join(" ")
                      : String(parsed.inReplyTo)
                    : null;
                  const references = parsed.references
                    ? Array.isArray(parsed.references)
                      ? parsed.references.join(" ")
                      : String(parsed.references)
                    : null;

                  messages.push({
                    messageId,
                    fromEmail: from?.address ?? "",
                    fromName: from?.name ?? null,
                    toEmail: to?.address ?? env.IMAP_USER ?? "",
                    toName: to?.name ?? null,
                    ccEmail: ccList,
                    subject: parsed.subject ?? "",
                    body: String(parsed.html || parsed.textAsHtml || parsed.text || ""),
                    textBody: parsed.text ? String(parsed.text) : null,
                    rfcInReplyTo: inReplyTo,
                    rfcReferences: references,
                    receivedAt: parsed.date ?? new Date(),
                  });
                } catch (parseErr) {
                  logger.warn(
                    `Skipped malformed IMAP message uid=${uid ?? "unknown"}: ${
                      parseErr instanceof Error ? parseErr.message : "parse error"
                    }`,
                  );
                }
              })(),
            );
          });
        });

        f.once("error", (e: Error) => reject(e));
        f.once("end", () => {
          Promise.all(pending).then(() => resolve()).catch(reject);
        });
      });
    });

  try {
    await new Promise<void>((resolve, reject) => {
      imap.once("ready", () => resolve());
      imap.once("error", (err: Error) => reject(err));
      imap.connect();
    });
    await openBox("INBOX");
    await fetchLast();
  } finally {
    try {
      imap.end();
    } catch {
      // ignore close errors
    }
  }

  return messages;
}

function firstMailbox(field: unknown): { address?: string; name?: string } | undefined {
  const obj = Array.isArray(field) ? field[0] : field;
  if (!obj || typeof obj !== "object") return undefined;
  const value = (obj as { value?: Array<{ address?: string; name?: string }> }).value;
  return value?.[0];
}

function addressList(field: unknown): string | null {
  const items = Array.isArray(field) ? field : field ? [field] : [];
  const addresses = items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    return ((item as { value?: Array<{ address?: string }> }).value ?? [])
      .map((v) => v.address)
      .filter((a): a is string => Boolean(a));
  });
  return addresses.length ? addresses.join(", ") : null;
}
