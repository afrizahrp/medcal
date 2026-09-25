import Link from "next/link";

type SectionCtaProps = {
  title?: string;
  description?: string;
  ctaLabel?: string;
  href?: string;
  variant?: "plain" | "banner" | "card" | "actions" | "nav";
  align?: "center" | "start";
  className?: string;
  onCtaClick?: () => void;
};

const CTA_TITLE = "Siap Memulai Kebutuhan Kalibrasi Anda?";
const CTA_LABEL = "Konsultasikan Kebutuhan Anda";
const CTA_DESCRIPTION =
  "Konsultasikan kebutuhan kalibrasi alat kesehatan Anda dan kami bantu menentukan layanan yang sesuai";

// The "nav" variant is the site's one entry point into apps/customer-portal
// (sign-in), deliberately distinct from every other variant's "Konsultasikan
// Kebutuhan Anda" -> /kontak lead CTA (hero included) — those stay unchanged.
// Not exposed via props: nav has exactly one caller pattern (site-header.tsx)
// and isn't meant to be a generic customizable CTA.
const NAV_CTA_LABEL = "Masuk";
const CUSTOMER_PORTAL_URL =
  process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ?? "http://customer.localhost:3005";
const NAV_CTA_HREF = `${CUSTOMER_PORTAL_URL}/sign-in`;

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function PrimaryCtaLink({
  href,
  className,
  onClick,
  label,
}: {
  href: string;
  className: string;
  onClick?: () => void;
  label: string;
}) {
  return (
    <Link href={href} onClick={onClick} className={className}>
      {label}
    </Link>
  );
}

// Web Chat (the floating bubble) is the site's one persistent/global visitor
// CTA; WhatsApp is intentionally not a global/floating CTA — it lives only
// on /kontak, behind the identity dialog (see kontak-form.tsx). This
// component therefore only ever renders the single primary CTA (-> /kontak),
// no WhatsApp secondary link, in any variant.
export function SectionCta({
  title = CTA_TITLE,
  description = CTA_DESCRIPTION,
  ctaLabel = CTA_LABEL,
  href = "/kontak",
  variant = "plain",
  align = "center",
  className,
  onCtaClick,
}: SectionCtaProps) {
  if (variant === "nav") {
    return (
      <PrimaryCtaLink
        href={NAV_CTA_HREF}
        onClick={onCtaClick}
        label={NAV_CTA_LABEL}
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
          "flex flex-col gap-3 sm:flex-row",
          align === "start"
            ? "items-start sm:justify-start"
            : "items-center sm:justify-center",
          className,
        )}
      >
        <PrimaryCtaLink
          href={href}
          onClick={onCtaClick}
          label={ctaLabel}
          className="inline-flex items-center justify-center rounded-full bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        />
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <section className={joinClasses("mx-auto max-w-8xl px-4 pb-16 sm:px-6 lg:px-8", className)}>
        <div className="rounded-3xl bg-brand-700 px-6 py-10 text-center sm:px-12 sm:py-14">
          {title ? (
            <h2 className="text-balance text-2xl font-bold text-white sm:text-3xl">{title}</h2>
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
              label={ctaLabel}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 text-base font-semibold text-brand-800 shadow-sm transition-colors hover:bg-brand-50"
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
            <p className="text-balance text-base font-semibold text-ink-900 sm:text-lg">{title}</p>
          ) : null}
          {description ? (
            <p className="mt-1 text-pretty text-base leading-relaxed text-ink-600">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PrimaryCtaLink
            href={href}
            onClick={onCtaClick}
            label={ctaLabel}
            className="inline-flex items-center justify-center rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={joinClasses("mx-auto mt-10 max-w-2xl text-center sm:mt-12", className)}>
      {title ? (
        <h3 className="text-balance text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{title}</h3>
      ) : null}
      {description ? (
        <p className="mt-3 text-pretty text-base leading-relaxed text-ink-600 sm:text-lg">{description}</p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <PrimaryCtaLink
          href={href}
          onClick={onCtaClick}
          label={ctaLabel}
          className="inline-flex items-center justify-center rounded-full bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        />
      </div>
    </div>
  );
}
