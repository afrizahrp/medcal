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
    "Jasa kalibrasi alat kesehatan dan laboratorium untuk rumah sakit serta laboratorium",
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
