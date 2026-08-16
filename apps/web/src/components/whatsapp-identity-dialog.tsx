"use client";

import { useState } from "react";
import Script from "next/script";
import { Dialog } from "@base-ui/react/dialog";
import { WHATSAPP_DEFAULT_MESSAGE } from "@medcal/shared";
import { waLink } from "@/data/site";

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
const WEB_API_URL = process.env.NEXT_PUBLIC_WEB_API_URL ?? "http://localhost:3002";

type Status = "idle" | "pending" | "error";

const EMPTY_VALUES = { name: "", email: "", phone: "", organizationName: "" };

interface WhatsAppIdentityDialogProps {
  triggerLabel: string;
  triggerClassName: string;
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.45 1.33 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2zm0 18.2a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.03-.2-.31a8.24 8.24 0 1 1 6.97 3.85zm4.52-6.16c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.17.25-.64.8-.78.96-.14.17-.29.19-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.7-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.84-.86 2.04 0 1.2.88 2.37 1 2.53.12.17 1.73 2.64 4.19 3.7.59.25 1.04.4 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.46-.6 1.66-1.17.21-.58.21-1.08.15-1.18-.06-.11-.23-.17-.48-.29z" />
    </svg>
  );
}

/**
 * The ONLY WhatsApp entry point on the site (per the approved architecture:
 * Web Chat is the sole persistent/global CTA, WhatsApp lives only on
 * /kontak). Collects identity, creates a ContactMessage(getFrom=WHATSAPP)
 * through the existing Customer dedup + Lead matching pipeline, and only
 * opens the wa.me deep link after a successful backend response — never
 * before, and never on failure.
 */
export function WhatsAppIdentityDialog({ triggerLabel, triggerClassName }: WhatsAppIdentityDialogProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY_VALUES);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    // Never close mid-submission — Escape/outside-click/Batal must not be
    // able to drop an in-flight request or the values the visitor typed.
    if (status === "pending") return;
    setOpen(next);
    if (next) setError(null);
  }

  async function getCaptchaToken(): Promise<string> {
    if (!RECAPTCHA_SITE_KEY || !window.grecaptcha) {
      throw new Error("Verifikasi keamanan belum siap, silakan coba lagi.");
    }
    return new Promise((resolve, reject) => {
      window.grecaptcha!.ready(() => {
        window
          .grecaptcha!.execute(RECAPTCHA_SITE_KEY, { action: "whatsapp_lead_submit" })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Guards double-click / repeated Enter from firing a second request
    // while the first is still in flight — the submit button is also
    // disabled while pending, this is the belt-and-suspenders check.
    if (status === "pending") return;

    setStatus("pending");
    setError(null);

    try {
      const captchaToken = await getCaptchaToken();
      const res = await fetch(`${WEB_API_URL}/public/whatsapp-lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, captchaToken }),
      });

      if (!res.ok) {
        // Never expose CAPTCHA/rate-limit/validation internals — a single
        // generic, retryable message. Values and dialog state untouched.
        setStatus("error");
        setError("Gagal mengirim data. Silakan periksa kembali dan coba lagi.");
        return;
      }

      // Success: open WhatsApp only now, reset, close.
      window.open(waLink(WHATSAPP_DEFAULT_MESSAGE), "_blank", "noopener,noreferrer");
      setValues(EMPTY_VALUES);
      setStatus("idle");
      setOpen(false);
    } catch {
      setStatus("error");
      setError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    }
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-4 py-3 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60";
  const pending = status === "pending";

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      {RECAPTCHA_SITE_KEY ? (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          strategy="afterInteractive"
        />
      ) : null}

      <Dialog.Trigger className={triggerClassName}>{triggerLabel}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink-900/40" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-100 bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-ink-900">Hubungi via WhatsApp</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-600">
            Mohon isi identitas Anda agar kami dapat melayani dengan lebih baik
          </Dialog.Description>

          <form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="wa-name" className="mb-1.5 block text-sm font-medium text-ink-700">
                Nama Lengkap <span className="text-red-500">*</span>
              </label>
              <input
                id="wa-name"
                className={inputClass}
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                required
                maxLength={100}
                autoComplete="name"
                disabled={pending}
              />
            </div>
            <div>
              <label htmlFor="wa-email" className="mb-1.5 block text-sm font-medium text-ink-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="wa-email"
                type="email"
                className={inputClass}
                value={values.email}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                required
                maxLength={100}
                autoComplete="email"
                disabled={pending}
              />
            </div>
            <div>
              <label htmlFor="wa-phone" className="mb-1.5 block text-sm font-medium text-ink-700">
                Nomor HP <span className="text-red-500">*</span>
              </label>
              <input
                id="wa-phone"
                type="tel"
                className={inputClass}
                value={values.phone}
                onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                required
                maxLength={20}
                autoComplete="tel"
                placeholder="08xx-xxxx-xxxx"
                disabled={pending}
              />
            </div>
            <div>
              <label htmlFor="wa-org" className="mb-1.5 block text-sm font-medium text-ink-700">
                Perusahaan/Instansi <span className="text-red-500">*</span>
              </label>
              <input
                id="wa-org"
                className={inputClass}
                value={values.organizationName}
                onChange={(e) => setValues((v) => ({ ...v, organizationName: e.target.value }))}
                required
                maxLength={100}
                autoComplete="organization"
                placeholder="Nama rumah sakit / laboratorium"
                disabled={pending}
              />
            </div>

            {error ? (
              <p className="text-sm text-red-600" role="status">
                {error}
              </p>
            ) : null}

            <div className="mt-2 flex justify-end gap-3">
              <Dialog.Close
                disabled={pending}
                className="rounded-full border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:border-brand-300 disabled:opacity-60"
              >
                Batal
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-60"
              >
                {pending ? (
                  "Mengirim…"
                ) : (
                  <>
                    Lanjutkan <WhatsAppIcon />
                  </>
                )}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
