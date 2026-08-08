import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getServiceCategory, serviceCategories, waLink } from "@/data/site";
import { categoryImages } from "@/data/category-images";
import { BackButton } from "@/components/back-button";

function resolveSlug(kategoriParam: string) {
  return kategoriParam.startsWith("kalibrasi-")
    ? kategoriParam.slice("kalibrasi-".length)
    : kategoriParam;
}

export function generateStaticParams() {
  return serviceCategories.map((c) => ({ kategori: `kalibrasi-${c.slug}` }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kategori: string }>;
}): Promise<Metadata> {
  const { kategori } = await params;
  const category = getServiceCategory(resolveSlug(kategori));
  if (!category) return {};

  return {
    title: category.h1,
    description: category.intro,
    alternates: { canonical: `/layanan/kalibrasi-${category.slug}` },
  };
}

export default async function ServiceCategoryPage({
  params,
}: {
  params: Promise<{ kategori: string }>;
}) {
  const { kategori } = await params;
  const category = getServiceCategory(resolveSlug(kategori));
  if (!category) notFound();

  const image = categoryImages[category.slug];

  return (
    <div>
      <section className="border-b border-ink-100 bg-brand-50/40">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <BackButton fallbackHref="/layanan" label="Kembali" />

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px] lg:items-start">
            <div>
              <nav className="text-sm text-ink-500" aria-label="Breadcrumb">
                <Link href="/layanan" className="hover:text-brand-700">
                  Layanan
                </Link>{" "}
                / <span className="text-ink-700">{category.name}</span>
              </nav>

              <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                {category.h1}
              </h1>

              {category.accredited ? (
                <span className="mt-4 inline-flex items-center rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                  Sebagian item terakreditasi KAN
                </span>
              ) : null}

              <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-600 sm:text-lg">
                {category.intro}
              </p>
            </div>

            {image ? (
              <div className="mx-auto w-56 sm:w-64 lg:mx-0 lg:w-full">
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-ink-100 bg-white">
                  <Image
                    src={image.full}
                    alt={image.alt}
                    fill
                    sizes="(min-width: 1024px) 280px, 256px"
                    className="object-contain p-4 sm:p-5"
                    priority
                  />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  Ilustrasi alat kalibrasi yang digunakan dalam proses —
                  bukan alat yang dikalibrasi.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6">
          {category.sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-lg font-semibold text-ink-900 sm:text-xl">
                {s.heading}
              </h2>
              {s.note ? (
                <p className="mt-1.5 text-base leading-relaxed text-brand-700">
                  {s.note}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        {category.accredited && category.accreditedNote ? (
          <div className="mt-8 rounded-2xl border border-brand-200 bg-brand-50/60 p-5">
            <p className="text-base leading-relaxed text-ink-700">
              {category.accreditedNote}
            </p>
          </div>
        ) : null}

        <div className="mt-10">
          <h2 className="text-lg font-semibold text-ink-900 sm:text-xl">
            Alat yang Kami Layani
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {category.exampleProducts.map((product) => (
              <li
                key={product}
                className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm text-ink-700"
              >
                {product}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-ink-900 sm:text-lg">
              Butuh jadwal kalibrasi {category.name.toLowerCase()}?
            </p>
            <p className="mt-1 text-base leading-relaxed text-ink-600">
              Konsultasikan kebutuhan Anda, kami bantu prosesnya.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/kontak"
              className="inline-flex items-center justify-center rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Konsultasi Kebutuhan Kalibrasi
            </Link>
            <a
              href={waLink(
                `Halo, saya ingin konsultasi kalibrasi ${category.name.toLowerCase()}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-ink-200 px-5 py-3 text-sm font-semibold text-ink-700 hover:border-brand-300"
            >
              Chat WhatsApp
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
