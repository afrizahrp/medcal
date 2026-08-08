import Link from "next/link";
import Image from "next/image";
import { serviceCategories, getServiceCategory } from "@/data/site";
import { categoryImages } from "@/data/category-images";

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
        <p className="mt-3 text-base leading-relaxed text-ink-600 sm:text-lg">
          Dua kategori berikut mencakup alat yang masuk scope akreditasi KAN
          — prioritas trust signal tertinggi untuk audit akreditasi.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:gap-5 lg:grid-cols-2">
        {featured.map((category) => {
          const image = categoryImages[category.slug];
          return (
            <Link
              key={category.slug}
              href={`/layanan/kalibrasi-${category.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/30"
            >
              {image ? (
                <div className="relative aspect-[2/1] w-full shrink-0 overflow-hidden bg-brand-50 sm:aspect-[16/9] lg:aspect-[2.2/1]">
                  <Image
                    src={image.main}
                    alt={image.alt}
                    fill
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="object-contain object-center p-3 sm:p-4"
                  />
                </div>
              ) : null}
              <div className="flex flex-1 flex-col justify-between p-5 sm:p-6 lg:p-7">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-800">
                      Terakreditasi KAN · LK-521-IDN
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-ink-900 sm:mt-4 sm:text-xl">
                    Kalibrasi {category.name}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-ink-600">
                    {category.exampleProducts.slice(0, 4).join(", ")}, dan
                    lainnya.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center text-sm font-medium text-brand-700 group-hover:text-brand-800 sm:mt-5">
                  Lihat detail layanan →
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-ink-100 bg-ink-50/60 p-5 sm:p-6">
        <p className="text-sm font-semibold text-ink-900">Kategori Lainnya</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {otherCategories.map((category) => (
            <Link
              key={category.slug}
              href={`/layanan/kalibrasi-${category.slug}`}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink-200 bg-white px-3 py-2 text-center text-sm leading-snug text-ink-700 hover:border-brand-300 hover:text-brand-800"
            >
              {category.name}
            </Link>
          ))}
        </div>
        <div className="mt-5 flex justify-center">
          <Link
            href="/layanan"
            className="inline-flex items-center justify-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Lihat Semua Kategori & Jenis Alat
          </Link>
        </div>
      </div>
    </section>
  );
}
