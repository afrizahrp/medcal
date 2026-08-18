import Link from "next/link";
import { LazyVideo } from "@/components/lazy-video";
import { TrustBadges } from "@/components/trust-badges";
import type { HeroContent } from "@/components/hero";

export function HeroCompact({ content }: { content: HeroContent }) {
  return (
    <section className="border-b border-ink-100 bg-brand-950 lg:hidden">
      <div className="relative h-[200px] w-full overflow-hidden bg-brand-900 sm:h-[260px] md:h-[320px]">
        <LazyVideo
          src="/technician-team.mp4"
          className="absolute inset-0 h-full w-full object-cover object-[45%_32%] motion-reduce:hidden sm:object-[55%_32%] md:object-[60%_35%]"
        />
        <div
          className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-brand-950"
          aria-hidden="true"
        />
      </div>

      <div className="px-5 py-8 sm:px-8 sm:py-10 md:px-10 md:py-12">
        <div className="mx-auto max-w-[350px] text-left justify-center sm:max-w-xl md:max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-white/80 sm:text-sm sm:tracking-wider">
            {content.eyebrow}
          </p>

          <h1 className="mt-3 max-w-[340px] text-[28px] font-bold leading-[1.12] tracking-[-0.015em] text-white sm:max-w-none sm:text-[34px] sm:leading-[1.15] md:text-4xl">
            {content.headline}
          </h1>

          <p className="mt-4 max-w-[320px] text-[15px] leading-[1.5] text-white/85 sm:max-w-lg sm:text-base md:text-lg">
            {content.description}
          </p>

          <div className="mt-5 flex justify-center sm:mt-6 sm:justify-start">
            <Link
              href={content.ctaHref}
              className="inline-flex min-w-[220px] items-center justify-center rounded-full bg-brand-600 px-6 py-3 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 sm:min-w-0 sm:px-7 sm:py-3.5 sm:text-base"
            >
              {content.ctaLabel}
            </Link>
          </div>

          <TrustBadges
            variant="compact"
            className="mt-7 mx-auto max-w-[300px] sm:mx-0 sm:mt-8 sm:max-w-md md:max-w-lg"
          />
        </div>
      </div>
    </section>
  );
}
