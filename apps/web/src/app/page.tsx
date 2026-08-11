import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { PainPointSection } from "@/components/pain-point-section";
import { FeaturedCategoriesSection } from "@/components/featured-categories-section";
import { ProcessSteps } from "@/components/process-steps";
import { AccreditationSection } from "@/components/accreditation-section";
import { SectionCta } from "@/components/section-cta";

export const metadata: Metadata = {
  title: {
    absolute:
      "Presisi Kalibrasi Medika — Kalibrasi Alat Kesehatan Terakreditasi KAN",
  },
  description:
    "Jasa kalibrasi alat kesehatan dan laboratorium. Terakreditasi KAN (LK-521-IDN) untuk item dalam ruang lingkup, mengikuti SNI ISO/IEC 17025:2017.",
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <PainPointSection />
      <FeaturedCategoriesSection />
      <ProcessSteps />
      <AccreditationSection />
      <SectionCta
        variant="banner"
      />
    </>
  );
}
