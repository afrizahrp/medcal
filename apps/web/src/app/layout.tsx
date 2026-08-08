import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { WhatsAppFab } from "@/components/whatsapp-fab";
import { siteUrl } from "@/data/seo";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Presisi Kalibrasi Medika — Kalibrasi Alat Kesehatan",
    template: "%s — Presisi Kalibrasi Medika",
  },
  description:
    "Jasa kalibrasi alat kesehatan & laboratorium untuk rumah sakit dan laboratorium tipe C/D. Terakreditasi KAN (LK-521-IDN) & SNI ISO/IEC 17025:2017.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="flex min-h-screen flex-col bg-white text-ink-900 antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <WhatsAppFab />
      </body>
    </html>
  );
}
