import { TrustBadges } from "@/components/trust-badges";
import { SectionCta } from "@/components/section-cta";

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[420px] items-center overflow-hidden border-b border-ink-100 bg-gradient-to-b from-brand-50/70 to-white sm:min-h-[520px] lg:min-h-[640px]">
      <video
        className="absolute inset-0 -z-20 h-full w-full object-cover motion-reduce:hidden"
        src="/technician-team.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 -z-10 bg-white/55 motion-reduce:hidden"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-8xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 sm:text-sm">
            Kalibrasi Alat Kesehatan & Laboratorium
          </p>

          <h1 className="mt-3 whitespace-nowrap text-[clamp(0.8rem,4.5vw,2.25rem)] font-bold leading-none tracking-tight text-ink-900">
            Kalibrasi Alat Kesehatan Terakreditasi
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-ink-600 sm:text-xl">
            Kami bantu memastikan akurasi pengukuran alat Anda, dengan hasil
            yang terdokumentasi rapi dan mudah ditelusuri, termasuk untuk
            keperluan audit akreditasi. Didukung izin resmi dan akreditasi KAN
            (LK-521-IDN) sesuai ruang lingkupnya
          </p>

          <div className="mt-6 w-full">
            <TrustBadges />
          </div>

          <SectionCta variant="actions" className="mt-8" />
        </div>
      </div>
    </section>
  );
}
