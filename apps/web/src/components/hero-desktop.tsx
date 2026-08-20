import { LazyVideo } from "@/components/lazy-video";
import { TrustBadges } from "@/components/trust-badges";
import { SectionCta } from "@/components/section-cta";
import type { HeroContent } from "@/components/hero";

export function HeroDesktop({ content }: { content: HeroContent }) {
  return (
    <section className="relative isolate hidden overflow-hidden border-b border-ink-100 bg-brand-950 lg:flex lg:min-h-[680px] lg:items-center">
      <LazyVideo
        src="/technician-team.mp4"
        className="absolute inset-0 -z-20 h-full w-full object-cover object-center motion-reduce:hidden"
      />

      <div
        className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-950/75 via-brand-950/30 to-transparent motion-reduce:hidden"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-8xl px-8 py-20">
        <div className="max-w-2xl text-left">
          <p className="text-sm font-semibold uppercase tracking-wider text-white/80">
            {content.eyebrow}
          </p>

          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-white [text-shadow:0_2px_16px_rgba(6,27,48,0.45)]">
            {content.headline}
          </h1>

          <p className="mt-4 max-w-2xl text-lg font-normal leading-[1.5] text-white/85">
            {content.description}
          </p>

          <SectionCta
            variant="actions"
            align="start"
            href={content.ctaHref}
            ctaLabel={content.ctaLabel}
            className="mt-7"
          />

          <TrustBadges variant="compact" className="mt-8 max-w-lg" />
        </div>
      </div>
    </section>
  );
}
