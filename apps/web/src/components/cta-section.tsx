import Link from "next/link";
import { waLink } from "@/data/site";

export function CtaSection() {
  return (
    <section className="mx-auto max-w-8xl px-4 pb-16 sm:px-6 lg:px-8">
      <div className="rounded-3xl bg-brand-700 px-6 py-10 text-center sm:px-12 sm:py-14">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">
          Siap Kalibrasi Tanpa Khawatir Sertifikat Ditolak Audit?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-brand-100 sm:text-base">
          Konsultasikan kebutuhan kalibrasi alat kesehatan Anda — kami bantu
          proses yang jelas dan tepat waktu.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/kontak"
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 text-base font-semibold text-brand-800 shadow-sm transition-colors hover:bg-brand-50"
          >
            Konsultasi Kebutuhan Kalibrasi
          </Link>
          <a
            href={waLink(
              "Halo, saya ingin konsultasi kebutuhan kalibrasi alat kesehatan.",
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-brand-300 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Chat WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
