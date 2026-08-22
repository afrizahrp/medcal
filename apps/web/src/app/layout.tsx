import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { WebChatBubbleLazy } from "@/components/web-chat-bubble-lazy";
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
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
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
        <WebChatBubbleLazy />
      </body>
    </html>
  );
}
