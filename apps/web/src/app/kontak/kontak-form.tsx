"use client";

import { useState } from "react";
import { company, waLink } from "@/data/site";
import { Breadcrumb } from "@/components/breadcrumb";

export function KontakForm() {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setStatus(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      getFrom: "CONTACTFORM" as const,
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? "") || undefined,
      organizationName: String(fd.get("organizationName") ?? "") || undefined,
      subject: String(fd.get("subject") ?? "") || undefined,
      message: String(fd.get("message") ?? ""),
    };

    try {
      const base =
        process.env.NEXT_PUBLIC_WEB_API_URL ?? "http://localhost:3002";
      const res = await fetch(`${base}/public/contact-messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      setStatus(
        res.ok
          ? "Terkirim! Tim kami akan segera menghubungi Anda."
          : `Gagal: ${JSON.stringify(json.error ?? json)}`,
      );
      if (res.ok) e.currentTarget.reset();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-4 py-3 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">

      <div className="mx-auto mt-6 max-w-2xl text-center">
        <div className="flex justify-center">
          <Breadcrumb
            items={[
              { label: "Beranda", href: "/" },
              { label: "Kontak" },
            ]}
          />
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          Konsultasi Kebutuhan Kalibrasi
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-600">
          Ceritakan alat dan jadwal akreditasi Anda — tim kami akan
          menghubungi untuk membantu proses kalibrasi yang jelas dan tepat
          waktu.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-5">
        <form
          className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm sm:p-6 lg:col-span-3"
          onSubmit={onSubmit}
        >
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink-700">
              Nama <span className="text-red-500">*</span>
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
              Telepon
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
              Institusi
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
          {status ? (
            <p className="text-sm text-ink-600" role="status">
              {status}
            </p>
          ) : null}
        </form>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-semibold text-ink-900">
              Hubungi Langsung
            </p>
            <a
              href={waLink(
                "Halo, saya ingin konsultasi kebutuhan kalibrasi alat kesehatan.",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white"
            >
              Chat WhatsApp
            </a>
            <a
              href={`tel:${company.phoneRaw}`}
              className="mt-2 flex items-center justify-center rounded-full border border-ink-200 px-4 py-3 text-sm font-semibold text-ink-700"
            >
              Telepon {company.phoneDisplay}
            </a>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-semibold text-ink-900">Alamat</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              {company.address}
            </p>
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
