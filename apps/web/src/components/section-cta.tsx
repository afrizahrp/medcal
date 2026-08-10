import Link from "next/link";
import { waLink } from "@/data/site";

type SectionCtaProps = {
  title?: string;
  description?: string;
  href?: string;
  waMessage?: string;
  variant?: "plain" | "banner" | "card" | "actions" | "nav";
  className?: string;
  onCtaClick?: () => void;
};

const CTA_TITLE = "Siap Memulai Kebutuhan Kalibrasi Anda?";
const CTA_DESCRIPTION = "Konsultasikan kebutuhan kalibrasi alat kesehatan Anda dan kami bantu menentukan layanan yang sesuai";
const CTA_LABEL = "Konsultasikan Kebutuhan Anda";
const SECONDARY_CTA_LABEL = "Chat WhatsApp";
const DEFAULT_WA_MESSAGE =
  "Halo, saya ingin konsultasi kebutuhan kalibrasi alat kesehatan.";

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function PrimaryCtaLink({
  href,
  className,
  onClick,
}: {
  href: string;
  className: string;
  onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className={className}>
      {CTA_LABEL}
    </Link>
  );
}

function SecondaryCtaLink({
  message,
  className,
}: {
  message: string;
  className: string;
}) {
  return (
    <a
      href={waLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {SECONDARY_CTA_LABEL}
    </a>
  );
}

export function SectionCta({
  title =CTA_TITLE,
  description = CTA_DESCRIPTION,
  href = "/kontak",
  waMessage = DEFAULT_WA_MESSAGE,
  variant = "plain",
  className,
  onCtaClick,
}: SectionCtaProps) {
  if (variant === "nav") {
    return (
      <PrimaryCtaLink
        href={href}
        onClick={onCtaClick}
        className={
          className ??
          "inline-flex items-center justify-center rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        }
      />
    );
  }

  if (variant === "actions") {
    return (
      <div
        className={joinClasses(
          "flex flex-col gap-3 sm:flex-row sm:justify-center",
          className,
        )}
      >
        <PrimaryCtaLink
          href={href}
          onClick={onCtaClick}
          className="inline-flex items-center justify-center rounded-full bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        />
        <SecondaryCtaLink
          message={waMessage}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-200 bg-white px-6 py-3.5 text-base font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-800"
        />
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <section
        className={joinClasses(
          "mx-auto max-w-8xl px-4 pb-16 sm:px-6 lg:px-8",
          className,
        )}
      >
        <div className="rounded-3xl bg-brand-700 px-6 py-10 text-center sm:px-12 sm:py-14">
          {title ? (
            <h2 className="text-balance text-2xl font-bold text-white sm:text-3xl">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mx-auto mt-3 max-w-xl text-pretty text-base leading-relaxed text-brand-100">
              {description}
            </p>
          ) : null}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <PrimaryCtaLink
              href={href}
              onClick={onCtaClick}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 text-base font-semibold text-brand-800 shadow-sm transition-colors hover:bg-brand-50"
            />
            <SecondaryCtaLink
              message={waMessage}
              className="inline-flex items-center justify-center rounded-full border border-brand-300 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-brand-600"
            />
          </div>
        </div>
      </section>
    );
  }

  if (variant === "card") {
    return (
      <div
        className={joinClasses(
          "mt-10 flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between",
          className,
        )}
      >
        <div>
          {title ? (
            <p className="text-balance text-base font-semibold text-ink-900 sm:text-lg">
              {title}
            </p>
          ) : null}
          {description ? (
            <p className="mt-1 text-pretty text-base leading-relaxed text-ink-600">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PrimaryCtaLink
            href={href}
            onClick={onCtaClick}
            className="inline-flex items-center justify-center rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          />
          <SecondaryCtaLink
            message={waMessage}
            className="inline-flex items-center justify-center rounded-full border border-ink-200 px-5 py-3 text-sm font-semibold text-ink-700 hover:border-brand-300"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={joinClasses(
        "mx-auto mt-10 max-w-2xl text-center sm:mt-12",
        className,
      )}
    >
      {title ? (
        <h3 className="text-balance text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
          {title}
        </h3>
      ) : null}
      {description ? (
        <p className="mt-3 text-pretty text-base leading-relaxed text-ink-600 sm:text-lg">
          {description}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <PrimaryCtaLink
          href={href}
          onClick={onCtaClick}
          className="inline-flex items-center justify-center rounded-full bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        />
        <SecondaryCtaLink
          message={waMessage}
          className="inline-flex items-center justify-center rounded-full border border-ink-200 bg-white px-6 py-3.5 text-base font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-800"
        />
      </div>
    </div>
  );
}
