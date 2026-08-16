import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { WhatsAppFab } from "@/components/whatsapp-fab";
import { WebChatBubble } from "@/components/web-chat-bubble";
import { JsonLd } from "@/components/json-ld";
import { siteUrl } from "@/data/seo";
import { professionalServiceJsonLd } from "@/data/structured-data";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Presisi Kalibrasi Medika — Kalibrasi Alat Kesehatan",
    template: "%s — Presisi Kalibrasi Medika",
  },
  description:
    "Jasa kalibrasi alat kesehatan dan laboratorium untuk rumah sakit serta laboratorium",
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "Presisi Kalibrasi Medika",
    images: ["/images/og/pkm-og-default.webp"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/images/og/pkm-og-default.webp"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="flex min-h-screen flex-col bg-white text-ink-900 antialiased">
        <JsonLd data={professionalServiceJsonLd()} />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        {/* <WhatsAppFab /> */}
        <WebChatBubble />
      </body>
    </html>
  );
}
