import Link from "next/link";
import { TrustBadges } from "@/components/trust-badges";
import { waLink } from "@/data/site";

export function Hero() {
  return (
    <section className="border-b border-ink-100 bg-gradient-to-b from-brand-50/70 to-white">
      <div className="mx-auto max-w-8xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 sm:text-sm">
            Kalibrasi Alat Kesehatan & Laboratorium
          </p>

          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-ink-900 sm:text-4xl lg:text-5xl">
            Kalibrasi Alat Kesehatan yang Sertifikatnya Pasti Lolos Audit
            Akreditasi
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
            Terakreditasi KAN (LK-521-IDN) & berizin resmi — bantu RS dan
            laboratorium tipe C/D memenuhi kewajiban kalibrasi rutin tanpa
            risiko sertifikat ditolak saat audit.
          </p>

          <div className="mt-6 w-full">
            <TrustBadges />
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/kontak"
              className="inline-flex items-center justify-center rounded-full bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              Konsultasi Kebutuhan Kalibrasi
            </Link>
            <a
              href={waLink(
                "Halo, saya ingin konsultasi kebutuhan kalibrasi alat kesehatan.",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-200 bg-white px-6 py-3.5 text-base font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-800"
            >
              Chat WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
