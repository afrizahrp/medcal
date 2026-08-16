"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Popover } from "@base-ui/react/popover";

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
// Must match apps/web-api's publicWebChatSchema max length exactly.
const MESSAGE_MAX_LENGTH = 2000;

type Status =
  | { kind: "idle" }
  | { kind: "success" }
  | { kind: "error"; message: string };

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

export function WebChatBubble() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [values, setValues] = useState({ name: "", email: "", message: "" });

  // A visitor reopening the bubble after a previous success should see a
  // fresh form, not the stale confirmation from last time.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setStatus({ kind: "idle" });
  }

  useEffect(() => {
    if (status.kind !== "success") return;
    const timer = setTimeout(() => setOpen(false), 4000);
    return () => clearTimeout(timer);
  }, [status.kind]);

  async function getCaptchaToken(): Promise<string> {
    if (!RECAPTCHA_SITE_KEY || !window.grecaptcha) {
      throw new Error("Verifikasi keamanan belum siap, silakan coba lagi.");
    }
    return new Promise((resolve, reject) => {
      window.grecaptcha!.ready(() => {
        window
          .grecaptcha!.execute(RECAPTCHA_SITE_KEY, { action: "webchat_submit" })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setStatus({ kind: "idle" });

    try {
      const captchaToken = await getCaptchaToken();
      const base =
        process.env.NEXT_PUBLIC_WEB_API_URL ?? "http://localhost:3002";
      const res = await fetch(`${base}/public/web-chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, captchaToken }),
      });

      if (res.ok) {
        setStatus({ kind: "success" });
        setValues({ name: "", email: "", message: "" });
      } else {
        // Never surface raw Zod/captcha error payloads to the visitor.
        setStatus({
          kind: "error",
          message: "Gagal mengirim pesan. Silakan coba lagi.",
        });
      }
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Terjadi kesalahan jaringan.",
      });
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <Popover.Root
      open={open}
      onOpenChange={handleOpenChange}
      modal="trap-focus"
    >
      {RECAPTCHA_SITE_KEY ? (
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

            {status.kind === "success" ? (
              <p className="mt-3 text-sm text-accent-700" role="status">
                Terkirim! Tim kami akan segera menghubungi Anda.
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

                {status.kind === "error" ? (
                  <p className="text-sm text-red-600" role="status">
                    {status.message}
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
