import type { Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "medcal Portal",
  description: "Customer & admin portal",
};

/**
 * Required for mobile-first CSS (Tailwind `lg:`) to see the device width.
 * Without `width=device-width`, DevTools device mode keeps a ~980–1024px
 * layout viewport, so `min-width: 1024px` still matches and the UI stays desktop.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen min-w-0 max-w-full bg-white text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
