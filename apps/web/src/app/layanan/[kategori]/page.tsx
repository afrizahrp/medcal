import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceCategory, serviceCategories, getKanEquipmentForCategory } from "@/data/site";
import { categoryImages } from "@/data/category-images";
import { Breadcrumb } from "@/components/breadcrumb";
import { SectionCta } from "@/components/section-cta";
import { JsonLd } from "@/components/json-ld";
import { serviceJsonLd } from "@/data/structured-data";

function resolveSlug(kategoriParam: string) {
  return kategoriParam.startsWith("kalibrasi-")
    ? kategoriParam.slice("kalibrasi-".length)
    : kategoriParam;
}

export function generateStaticParams() {
  return serviceCategories.map((c) => ({ kategori: `kalibrasi-${c.slug}` }));
}

function tokenizeEquipment(equipment: string[]) {
  return new Set(
    equipment
      .flatMap((entry) =>
        entry
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .split(/\s+/),
      )
      .filter((token) => token.length >= 4),
  );
}

function getRelatedCategories(currentSlug: string) {
  const current = getServiceCategory(currentSlug);
  if (!current) return [];

  const currentTokens = tokenizeEquipment(current.servedEquipment);
  const scored = serviceCategories
    .filter((candidate) => candidate.slug !== currentSlug)
    .map((candidate) => {
      const candidateTokens = tokenizeEquipment(candidate.servedEquipment);
      let overlap = 0;
      for (const token of candidateTokens) {
        if (currentTokens.has(token)) overlap += 1;
      }
      return { candidate, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap);

  const withOverlap = scored.filter((item) => item.overlap > 0).slice(0, 3);
  if (withOverlap.length === 3) {
    return withOverlap.map((item) => item.candidate);
  }

  const fallback = scored
    .filter(
      (item) => !withOverlap.some((picked) => picked.candidate.slug === item.candidate.slug),
    )
    .slice(0, 3 - withOverlap.length);

  return [...withOverlap, ...fallback].map((item) => item.candidate);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kategori: string }>;
}): Promise<Metadata> {
  const { kategori } = await params;
  const category = getServiceCategory(resolveSlug(kategori));
  if (!category) return {};

  const path = `/layanan/kalibrasi-${category.slug}`;

  return {
    title: category.h1,
    description: category.metaDescription,
    alternates: { canonical: path },
    openGraph: { url: path },
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
  const path = `/layanan/kalibrasi-${category.slug}`;
  const relatedCategories = getRelatedCategories(category.slug);
  const kanEquipment = getKanEquipmentForCategory(category.slug);
  const kanScopeBadgeLabel =
    kanEquipment.length > 0
      ? `${kanEquipment.map((item) => item.name).join(" & ")} dalam Scope KAN`
      : null;

  return (
    <div>
      <JsonLd
        data={serviceJsonLd({
          name: category.h1,
          description: category.intro,
          path,
        })}
      />
      <section className="border-b border-ink-100 bg-brand-50/40">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px] lg:items-start">
            <div>
              <Breadcrumb
                items={[
                  { label: "Beranda", href: "/" },
                  { label: "Layanan", href: "/layanan" },
                  { label: category.name, href: path },
                ]}
              />

              <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                {category.h1}
              </h1>

              {kanScopeBadgeLabel ? (
                <span className="mt-4 inline-flex items-center rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                  {kanScopeBadgeLabel}
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
                <p className="mt-2 text-xs leading-relaxed text-ink-500">
                  Ilustrasi alat yang digunakan dalam proses kalibrasi, bukan alat yang dikalibrasi.
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
              {s.badge ? (
                <p className="mt-1.5 text-base font-medium leading-relaxed text-brand-700">
                  {s.badge}
                </p>
              ) : null}
              {s.scopeDetail ? (
                <p className="mt-1 text-base leading-relaxed text-ink-600">
                  {s.scopeDetail}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-semibold text-ink-900 sm:text-xl">
            Peralatan dalam Layanan Ini
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {category.servedEquipment.map((equipment) => (
              <li
                key={equipment}
                className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm text-ink-700"
              >
                {equipment}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-semibold text-ink-900 sm:text-xl">
            Layanan Terkait
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {relatedCategories.map((relatedCategory) => (
              <Link
                key={relatedCategory.slug}
                href={`/layanan/kalibrasi-${relatedCategory.slug}`}
                className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm text-ink-700 hover:border-brand-300 hover:text-brand-800"
              >
                Kalibrasi {relatedCategory.name}
              </Link>
            ))}
          </div>
        </div>

        <SectionCta
          title={`Butuh jadwal kalibrasi alat ${category.name.toLowerCase()}?`}
          ctaLabel={`Konsultasikan Jadwal Kalibrasi`}
          description="Konsultasikan kebutuhan kalibrasi alat Anda dan kami bantu menentukan jadwal yang sesuai."
        />
      </section>
    </div>
  );
}
