import Link from "next/link";
import { serviceCategories, getServiceCategory } from "@/data/site";

const featuredSlugs = ["monitoring-pasien", "cold-chain"] as const;

export function FeaturedCategoriesSection() {
  const featured = featuredSlugs
    .map((slug) => getServiceCategory(slug))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const otherCategories = serviceCategories.filter(
    (c) => !featuredSlugs.includes(c.slug as (typeof featuredSlugs)[number]),
  );

  return (
    <section className="mx-auto max-w-8xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          Layanan Kalibrasi per Kategori Alat
        </h2>
        <p className="mt-3 text-base leading-relaxed text-ink-600">
          Dua kategori berikut mencakup alat yang masuk scope akreditasi KAN
          — prioritas trust signal tertinggi untuk audit akreditasi.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {featured.map((category) => (
          <Link
            key={category.slug}
            href={`/layanan/kalibrasi-${category.slug}`}
            className="group flex flex-col justify-between rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/30 sm:p-7"
          >
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-base font-bold text-brand-700">
                  {category.name.charAt(0)}
                </span>
                <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-800">
                  Terakreditasi KAN · LK-521-IDN
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink-900">
                Kalibrasi {category.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {category.exampleProducts.slice(0, 4).join(", ")}, dan
                lainnya.
              </p>
            </div>
            <span className="mt-5 inline-flex items-center text-sm font-medium text-brand-700 group-hover:text-brand-800">
              Lihat detail layanan →
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-ink-100 bg-ink-50/60 p-5 sm:p-6">
        <p className="text-sm font-semibold text-ink-900">Kategori Lainnya</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {otherCategories.map((category) => (
            <Link
              key={category.slug}
              href={`/layanan/kalibrasi-${category.slug}`}
              className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm text-ink-700 hover:border-brand-300 hover:text-brand-800"
            >
              {category.name}
            </Link>
          ))}
        </div>
        <div className="mt-5">
          <Link
            href="/layanan"
            className="inline-flex items-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Lihat Semua Kategori & Jenis Alat
          </Link>
        </div>
      </div>
    </section>
  );
}
