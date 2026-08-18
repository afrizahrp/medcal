import { company } from "@/data/site";

const badges = [
  {
    title: "Terakreditasi KAN",
    detail: `${company.accreditation.number} · 3 item scope`,
  },
  {
    title: "SNI ISO/IEC 17025:2017",
    detail: "Standar laboratorium",
  },
  {
    title: "Legalitas Lengkap",
    detail: "Akta PT · NIB · NPWP",
  },
];

type TrustBadgesProps = {
  className?: string;
  variant?: "pill" | "compact";
};

export function TrustBadges({ className = "", variant = "pill" }: TrustBadgesProps) {
  if (variant === "compact") {
    return (
      <ul
        className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2 ${className}`}
        aria-label="Sertifikasi dan legalitas"
      >
        {badges.map((badge) => (
          <li key={badge.title} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/15 text-[9px] font-bold text-white ring-1 ring-inset ring-white/40"
            >
              ✓
            </span>
            <span className="min-w-0 text-left leading-snug">
              <span className="block text-[13px] font-semibold text-white sm:text-sm">
                {badge.title}
              </span>
              <span className="block text-[11px] text-white/70 sm:text-xs">
                {badge.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul
      className={`grid w-full grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3 ${className}`}
      aria-label="Sertifikasi dan legalitas"
    >
      {badges.map((badge) => (
        <li
          key={badge.title}
          className="flex w-full min-w-0 items-center justify-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 shadow-sm sm:justify-start"
        >
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white"
          >
            ✓
          </span>
          <span className="min-w-0 text-left text-xs leading-tight sm:text-sm">
            <span className="block truncate font-semibold text-ink-900">
              {badge.title}
            </span>
            <span className="block truncate text-ink-500" title={badge.detail}>
              {badge.detail}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
