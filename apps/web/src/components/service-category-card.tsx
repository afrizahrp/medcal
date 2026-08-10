import Link from "next/link";
import {
  isCategoryAccredited,
  type ServiceCategory,
} from "@/data/site";

export function ServiceCategoryCard({
  category,
}: {
  category: ServiceCategory;
}) {
  return (
    <Link
      href={`/layanan/kalibrasi-${category.slug}`}
      className="group flex flex-col justify-between rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-sm font-bold text-brand-700">
            {category.name.charAt(0)}
          </span>
          {isCategoryAccredited(category) ? (
            <span className="rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
              KAN
            </span>
          ) : null}
        </div>
        <h3 className="mt-3 text-base font-semibold text-ink-900">
          Kalibrasi {category.name}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-base leading-relaxed text-ink-600">
          {category.servedEquipment.slice(0, 3).join(", ")}, dan lainnya.
        </p>
      </div>
      <span className="mt-4 inline-flex items-center text-sm font-medium text-brand-700 group-hover:text-brand-800">
        Lihat detail layanan →
      </span>
    </Link>
  );
}
