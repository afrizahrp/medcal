import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { PainPointSection } from "@/components/pain-point-section";
import { FeaturedCategoriesSection } from "@/components/featured-categories-section";
import { ProcessSteps } from "@/components/process-steps";
import { PrecisionSection } from "@/components/precision-section";
import { AccreditationSection } from "@/components/accreditation-section";
import { SectionCta } from "@/components/section-cta";
import { JsonLd } from "@/components/json-ld";
import { websiteJsonLd } from "@/data/structured-data";

export const metadata: Metadata = {
  title: {
    absolute: "Jasa Kalibrasi Alat Kesehatan — Presisi Kalibrasi Medika",
  },
  description:
    "Jasa kalibrasi alat kesehatan & laboratorium untuk rumah sakit dan klinik. Terakreditasi KAN (LK-521-IDN) untuk item dalam scope, sesuai SNI ISO/IEC 17025:2017.",
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default function HomePage() {
  return (
    <>
      <link
        rel="preload"
        as="video"
        href="/technician-team.webm"
        type="video/webm"
        fetchPriority="high"
      />
      <JsonLd data={websiteJsonLd()} />
      <Hero />
      <PainPointSection />
      <FeaturedCategoriesSection />
      <ProcessSteps />
      <PrecisionSection />
      <AccreditationSection />
      <SectionCta variant="banner" />
    </>
  );
}
