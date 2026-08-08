import { company } from "@/data/site";

const badges = [
  {
    title: "Terakreditasi KAN",
    detail: `${company.accreditation.number} · 3 item dalam scope`,
  },
  {
    title: "SNI ISO/IEC 17025:2017",
    detail: "Standar kompetensi laboratorium",
  },
  {
    title: "Legalitas Lengkap",
    detail: "Akta PT · NIB · NPWP",
  },
];

export function TrustBadges({ className = "" }: { className?: string }) {
  return (
    <ul
      className={`flex flex-wrap items-center gap-2.5 sm:gap-3 ${className}`}
      aria-label="Sertifikasi dan legalitas"
    >
      {badges.map((badge) => (
        <li
          key={badge.title}
          className="flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 shadow-sm"
        >
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white"
          >
            ✓
          </span>
          <span className="text-xs leading-tight sm:text-sm">
            <span className="block font-semibold text-ink-900">
              {badge.title}
            </span>
            <span className="block text-ink-500">{badge.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
