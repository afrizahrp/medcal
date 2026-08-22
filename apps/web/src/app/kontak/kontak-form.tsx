"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Dialog } from "@base-ui/react/dialog";
import { company } from "@/data/site";
import { WhatsAppIdentityDialog } from "@/components/whatsapp-identity-dialog";

interface ContactTopic {
  id: number;
  name: string;
}

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";

export function KontakForm() {
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [topics, setTopics] = useState<ContactTopic[]>([]);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_WEB_API_URL ?? "http://localhost:3002";
    fetch(`${base}/public/contact-topics`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTopics(Array.isArray(data) ? data : []))
      .catch(() => setTopics([]));
  }, []);

  async function getCaptchaToken(): Promise<string> {
    if (!RECAPTCHA_SITE_KEY || !window.grecaptcha) {
      throw new Error("Verifikasi keamanan belum siap, silakan coba lagi.");
    }
    return new Promise((resolve, reject) => {
      window.grecaptcha!.ready(() => {
        window
          .grecaptcha!.execute(RECAPTCHA_SITE_KEY, { action: "contact_submit" })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Captured synchronously: React clears e.currentTarget once the
    // synchronous event phase ends, so it's null by the time we reach any
    // code after an `await` below (getCaptchaToken/fetch).
    const formEl = e.currentTarget;
    setPending(true);
    setErrorStatus(null);
    const fd = new FormData(formEl);
    const topicIdRaw = String(fd.get("topicId") ?? "");

    try {
      const captchaToken = await getCaptchaToken();
      const payload = {
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        phone: String(fd.get("phone") ?? "") || undefined,
        organizationName: String(fd.get("organizationName") ?? "") || undefined,
        subject: String(fd.get("subject") ?? "") || undefined,
        message: String(fd.get("message") ?? ""),
        topicId: Number(topicIdRaw),
        captchaToken,
      };

      const base = process.env.NEXT_PUBLIC_WEB_API_URL ?? "http://localhost:3002";
      const res = await fetch(`${base}/public/contact-messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        formEl.reset();
        setSuccessOpen(true);
      } else {
        setErrorStatus(`Gagal: ${JSON.stringify(json.error ?? json)}`);
      }
    } catch (err) {
      setErrorStatus(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-4 py-3 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {RECAPTCHA_SITE_KEY ? (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          strategy="afterInteractive"
        />
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <form
          className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm sm:p-6 lg:col-span-3"
          onSubmit={onSubmit}
        >
          <div>
            <label htmlFor="topicId" className="mb-1.5 block text-sm font-medium text-ink-700">
              Topik Konsultasi <span className="text-red-500">*</span>
            </label>
            <select id="topicId" className={inputClass} name="topicId" required defaultValue="">
              <option value="" disabled>
                Pilih topik konsultasi
              </option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink-700">
              Nama Lengkap <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              className={inputClass}
              name="name"
              placeholder="Nama lengkap"
              required
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-700">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              className={inputClass}
              name="email"
              type="email"
              placeholder="nama@institusi.co.id"
              required
            />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-ink-700">
              Nomor Telepon
            </label>
            <input
              id="phone"
              className={inputClass}
              name="phone"
              type="tel"
              placeholder="08xx-xxxx-xxxx"
            />
          </div>
          <div>
            <label
              htmlFor="organizationName"
              className="mb-1.5 block text-sm font-medium text-ink-700"
            >
              Nama Perusahaan
            </label>
            <input
              id="organizationName"
              className={inputClass}
              name="organizationName"
              placeholder="Nama rumah sakit / laboratorium"
            />
          </div>
          <div>
            <label htmlFor="subject" className="mb-1.5 block text-sm font-medium text-ink-700">
              Subjek
            </label>
            <input
              id="subject"
              className={inputClass}
              name="subject"
              placeholder="Contoh: Kalibrasi Patient Monitor"
            />
          </div>
          <div>
            <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-ink-700">
              Pesan <span className="text-red-500">*</span>
            </label>
            <textarea
              id="message"
              className={inputClass}
              name="message"
              placeholder="Jelaskan kebutuhan kalibrasi Anda"
              required
              rows={5}
            />
          </div>
          <button
            className="mt-2 inline-flex items-center justify-center rounded-full bg-brand-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "Mengirim…" : "Kirim Permintaan Konsultasi"}
          </button>
          <p className="text-xs text-ink-400">
            Formulir ini dilindungi reCAPTCHA dan tunduk pada{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Kebijakan Privasi
            </a>{" "}
            dan{" "}
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Persyaratan Layanan
            </a>{" "}
            Google.
          </p>
          {errorStatus ? (
            <p className="text-sm text-red-600" role="status">
              {errorStatus}
            </p>
          ) : null}
        </form>

        <Dialog.Root open={successOpen} onOpenChange={setSuccessOpen}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink-900/40" />
            <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-100 bg-white p-6 shadow-xl">
              <Dialog.Title className="text-lg font-semibold text-ink-900">
                Pesan Terkirim
              </Dialog.Title>
              <Dialog.Description className="mt-2 space-y-2 text-sm leading-relaxed text-ink-600">
                <p>Terima kasih telah menghubungi</p>
                <p>Tim kami akan segera menghubungi Anda</p>
              </Dialog.Description>
              <div className="mt-6 flex justify-end">
                <Dialog.Close className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
                  Tutup
                </Dialog.Close>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-semibold text-ink-900">Hubungi Langsung</p>
            <WhatsAppIdentityDialog
              triggerLabel="Chat WhatsApp"
              triggerClassName="mt-3 flex w-full items-center justify-center rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white"
            />
            <a
              href={`tel:${company.phoneRaw}`}
              className="mt-2 flex items-center justify-center rounded-full border border-ink-200 px-4 py-3 text-sm font-semibold text-ink-700"
            >
              Telepon {company.phoneDisplay}
            </a>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-semibold text-ink-900">Alamat</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{company.address}</p>
            <p className="mt-3 text-sm font-semibold text-ink-900">Email</p>
            <a
              href={`mailto:${company.email}`}
              className="mt-1 block break-all text-sm text-brand-700"
            >
              {company.email}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
