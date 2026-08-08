import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { PainPointSection } from "@/components/pain-point-section";
import { FeaturedCategoriesSection } from "@/components/featured-categories-section";
import { ProcessSteps } from "@/components/process-steps";
import { AccreditationSection } from "@/components/accreditation-section";
import { CtaSection } from "@/components/cta-section";

export const metadata: Metadata = {
  title: "Presisi Kalibrasi Medika — Kalibrasi Alat Kesehatan Terakreditasi KAN",
  description:
    "Kalibrasi alat kesehatan yang sertifikatnya pasti lolos audit akreditasi. Terakreditasi KAN (LK-521-IDN) & SNI ISO/IEC 17025:2017, tepat waktu, tanpa ribet.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <PainPointSection />
      <FeaturedCategoriesSection />
      <ProcessSteps />
      <AccreditationSection />
      <CtaSection />
    </>
  );
}
