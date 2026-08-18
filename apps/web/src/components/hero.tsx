import { HeroDesktop } from "@/components/hero-desktop";
import { HeroCompact } from "@/components/hero-compact";

const heroContent = {
  eyebrow: "Kalibrasi Alat Kesehatan",
  headline: "Layanan Terbaik Dimulai dari Alat yang Akurat",
  description:
    "Pastikan setiap pengukuran dapat diandalkan dengan layanan kalibrasi yang tertelusur dan terdokumentasi.",
  ctaLabel: "Konsultasikan Kebutuhan Anda",
  ctaHref: "/kontak",
} as const;

export type HeroContent = typeof heroContent;

export function Hero() {
  return (
    <>
      <HeroDesktop content={heroContent} />
      <HeroCompact content={heroContent} />
    </>
  );
}
