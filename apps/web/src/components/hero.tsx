import { HeroDesktop } from "@/components/hero-desktop";
import { HeroCompact } from "@/components/hero-compact";

const heroContent = {
  eyebrow: "Laboratorium Kalibrasi Alat Kesehatan",
  headline: "Kalibrasi Alat Kesehatan dengan Dokumentasi Siap Audit",
  description: (
    <>
      Kalibrasi tertelusur dan terdokumentasi sesuai SNI ISO/IEC 17025:2017.
      <br className="hidden lg:block" />
      Tiga jenis alat tercakup dalam akreditasi KAN LK-521-IDN.
    </>
  ),
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
