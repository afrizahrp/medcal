import { TrustBadges } from "@/components/trust-badges";
import { SectionCta } from "@/components/section-cta";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-ink-100 bg-brand-950 sm:flex sm:min-h-[560px] sm:items-center lg:min-h-[680px]">
      <video
        className="absolute inset-0 -z-20 h-full w-full object-cover object-[48%_28%] motion-reduce:hidden sm:object-[65%_38%] lg:object-center"
        src="/technician-team.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />

      {/* Mobile: dark-to-transparent from the top, behind the text, revealing the video lower down */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-950/88 via-brand-950/50 to-brand-950/20 motion-reduce:hidden sm:hidden"
        aria-hidden="true"
      />
      {/* Tablet: intermediate left-to-right blend */}
      <div
        className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-brand-950/78 via-brand-950/42 to-brand-950/10 motion-reduce:hidden sm:block lg:hidden"
        aria-hidden="true"
      />
      {/* Desktop: original left-to-right blend, strongest behind the text and clear on the right */}
      <div
        className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-brand-950/75 via-brand-950/30 to-transparent motion-reduce:hidden lg:block"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-8xl px-5 py-8 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="max-w-[350px] text-left sm:max-w-xl lg:max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-white/80 sm:text-sm sm:tracking-wider">
            Kalibrasi Alat Kesehatan
          </p>

          <h1 className="mt-3 max-w-[320px] text-[31px] font-bold leading-[1.12] tracking-[-0.015em] text-white sm:mt-3 sm:max-w-none sm:text-4xl sm:leading-tight sm:tracking-tight sm:[text-shadow:0_2px_16px_rgba(6,27,48,0.45)] lg:text-5xl">
            Layanan Terbaik Dimulai dari Alat yang Akurat
          </h1>

          <p className="mt-4 max-w-[320px] text-[15px] font-normal leading-[1.5] text-white/85 sm:max-w-lg sm:text-lg">
            Pastikan setiap pengukuran dapat diandalkan dengan layanan
            kalibrasi yang tertelusur dan terdokumentasi.
          </p>

          <SectionCta
            variant="actions"
            align="center-start"
            ctaLabel="Konsultasikan Kebutuhan Anda"
            ctaClassName="min-w-[220px] max-w-[calc(100%-2.5rem)]"
            className="mt-5 sm:mt-7"
          />

          <TrustBadges
            variant="compact"
            className="mt-6 max-w-[300px] sm:mt-8 sm:max-w-lg"
          />
        </div>
      </div>
    </section>
  );
}
