"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Popover } from "@base-ui/react/popover";
import { useVisitorChat } from "@/lib/use-visitor-chat";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (
        siteKey: string,
        options: { action: string },
      ) => Promise<string>;
    };
  }
}

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
// Must match apps/web-api's publicChatSessionSchema max length exactly.
const MESSAGE_MAX_LENGTH = 2000;

const CONNECTION_LABEL: Record<string, string> = {
  connecting: "Menghubungkan…",
  connected: "Terhubung",
  disconnected: "Terputus, mencoba menyambung kembali…",
  error: "Gagal terhubung",
};

function MessageIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function WebChatBubble() {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [values, setValues] = useState({ name: "", email: "", message: "" });
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);

  const chat = useVisitorChat(everOpened);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setEverOpened(true);
  }

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [chat.messages]);

  function waitForGrecaptcha(maxMs = 15_000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.grecaptcha) {
        resolve();
        return;
      }

      const deadline = Date.now() + maxMs;
      const tick = () => {
        if (window.grecaptcha) {
          resolve();
        } else if (Date.now() >= deadline) {
          reject(new Error("Verifikasi keamanan belum siap, silakan coba lagi."));
        } else {
          setTimeout(tick, 50);
        }
      };
      tick();
    });
  }

  async function getCaptchaToken(action: string): Promise<string> {
    if (!RECAPTCHA_SITE_KEY) {
      throw new Error("Verifikasi keamanan belum siap, silakan coba lagi.");
    }

    await waitForGrecaptcha();

    return new Promise((resolve, reject) => {
      window.grecaptcha!.ready(() => {
        window
          .grecaptcha!.execute(RECAPTCHA_SITE_KEY, { action })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setFormError(null);

    try {
      // Action must match apps/web-api's verifyRecaptcha(..., "chat_session_create") call exactly.
      const captchaToken = await getCaptchaToken("chat_session_create");
      const result = await chat.startSession({ ...values, captchaToken });
      if (!result.ok) {
        setFormError(result.error);
      }
      // On success the widget transitions into the conversation view itself
      // (chat.phase flips to "chat") — no terminal "Terkirim!" screen, and
      // values are left as-is (irrelevant once the form is gone).
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
    } finally {
      setPending(false);
    }
  }

  function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || chat.sessionClosed) return;
    // Only clear the draft if the message was actually emitted — the
    // socket may be disconnected (e.g. Enter-submitting while offline
    // bypasses the disabled submit button, which HTML only blocks clicks
    // on, not implicit Enter-submission). The connection-state line above
    // the composer already communicates why nothing was sent.
    const sent = chat.sendMessage(body);
    if (sent) setDraft("");
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <Popover.Root
      open={open}
      onOpenChange={handleOpenChange}
      modal="trap-focus"
    >
      {RECAPTCHA_SITE_KEY && everOpened ? (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          strategy="afterInteractive"
        />
      ) : null}

      <Popover.Trigger
        aria-label="Chat dengan kami"
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-black/10 transition-transform hover:bg-brand-700 active:scale-95 sm:right-6"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
      >
        <MessageIcon />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align="end"
          sideOffset={12}
          collisionPadding={16}
          className="z-40"
        >
          <Popover.Popup className="flex max-h-[min(75dvh,560px)] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-y-auto rounded-2xl border border-ink-100 bg-white p-4 shadow-xl sm:w-[380px]">
            <div className="flex items-start justify-between gap-2">
              <Popover.Title className="text-base font-semibold text-ink-900">
                Chat dengan kami
              </Popover.Title>
              <Popover.Close
                aria-label="Tutup"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-ink-50 hover:text-ink-600"
              >
                <CloseIcon />
              </Popover.Close>
            </div>

            {chat.phase === "chat" ? (
              <div className="mt-3 flex flex-1 flex-col overflow-hidden">
                <p className="text-xs text-ink-400" role="status">
                  {CONNECTION_LABEL[chat.connectionState]}
                </p>

                <div ref={threadRef} className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
                  {chat.messages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.senderType === "ADMIN"
                          ? "mr-auto max-w-[85%] rounded-xl rounded-bl-sm bg-ink-50 px-3 py-2 text-sm text-ink-900"
                          : "ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white"
                      }
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p
                        className={
                          message.senderType === "ADMIN"
                            ? "mt-1 text-[10px] text-ink-400"
                            : "mt-1 text-[10px] text-white/70"
                        }
                      >
                        {formatTime(message.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>

                {chat.sessionClosed ? (
                  <p className="mt-3 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2 text-xs text-ink-500">
                    Percakapan ini sudah ditutup.
                  </p>
                ) : (
                  <form onSubmit={handleSend} className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Tulis pesan…"
                      maxLength={MESSAGE_MAX_LENGTH}
                      className={inputClass}
                      aria-label="Tulis pesan"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || chat.connectionState !== "connected"}
                      className="shrink-0 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                    >
                      Kirim
                    </button>
                  </form>
                )}
              </div>
            ) : chat.phase === "checking" ? (
              <p className="mt-4 text-sm text-ink-500" role="status">
                Memuat percakapan…
              </p>
            ) : (
              <form className="mt-3 flex flex-col gap-3" onSubmit={onSubmit}>
                <p className="text-sm text-ink-600">
                  Kirim pesan Anda, tim kami akan segera menjawab
                </p>
                <div>
                  <label
                    htmlFor="web-chat-name"
                    className="mb-1 block text-xs font-medium text-ink-700"
                  >
                    Nama <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="web-chat-name"
                    className={inputClass}
                    value={values.name}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, name: e.target.value }))
                    }
                    required
                    maxLength={100}
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label
                    htmlFor="web-chat-email"
                    className="mb-1 block text-xs font-medium text-ink-700"
                  >
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="web-chat-email"
                    type="email"
                    className={inputClass}
                    value={values.email}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, email: e.target.value }))
                    }
                    required
                    maxLength={100}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label
                    htmlFor="web-chat-message"
                    className="mb-1 block text-xs font-medium text-ink-700"
                  >
                    Pesan <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="web-chat-message"
                    className={inputClass}
                    rows={4}
                    value={values.message}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, message: e.target.value }))
                    }
                    required
                    maxLength={MESSAGE_MAX_LENGTH}
                  />
                </div>

                {formError ? (
                  <p className="text-sm text-red-600" role="status">
                    {formError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={pending}
                  className="mt-1 inline-flex items-center justify-center rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                >
                  {pending ? "Mengirim…" : "Kirim Pesan"}
                </button>
              </form>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
