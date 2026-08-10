import type { Metadata } from "next";
import { TrustBadges } from "@/components/trust-badges";
import { ServiceCategoryCard } from "@/components/service-category-card";
import { SectionCta } from "@/components/section-cta";
import { Breadcrumb } from "@/components/breadcrumb";
import { serviceCategories } from "@/data/site";

export const metadata: Metadata = {
  title: "Layanan Kalibrasi Alat Kesehatan & Laboratorium",
  description:
    "8 kategori layanan kalibrasi alat kesehatan & laboratorium — terakreditasi KAN (LK-521-IDN) untuk item dalam scope, mengikuti standar SNI ISO/IEC 17025:2017.",
  alternates: { canonical: "/layanan" },
};

export default function LayananPage() {
  return (
    <div>
      <section className="border-b border-ink-100 bg-brand-50/40">
        <div className="mx-auto max-w-8xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mt-6 text-center">
            <div className="flex justify-center">
              <Breadcrumb
                items={[
                  { label: "Beranda", href: "/" },
                  { label: "Layanan" },
                ]}
              />
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              Layanan Kalibrasi Alat Kesehatan & Laboratorium
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-ink-600">
              8 kategori kalibrasi untuk kebutuhan rumah sakit dan laboratorium
              tipe C/D — proses jelas, sertifikat siap untuk audit akreditasi.
            </p>
            <div className="mt-6 flex justify-center">
              <TrustBadges />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-8xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {serviceCategories.map((category) => (
            <ServiceCategoryCard key={category.slug} category={category} />
          ))}
        </div>
      </section>

      <SectionCta
        variant="banner"
       />
    </div>
  );
}
