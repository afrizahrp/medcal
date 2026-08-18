import type { Metadata } from "next";
import { Breadcrumb } from "@/components/breadcrumb";
import { KontakForm } from "./kontak-form";

export const metadata: Metadata = {
  title: "Kontak",
  description:
    "Hubungi Presisi Kalibrasi Medika untuk konsultasi kebutuhan kalibrasi alat kesehatan dan laboratorium.",
  alternates: { canonical: "/kontak" },
  openGraph: { url: "/kontak" },
};

export default function KontakPage() {
  return (
    <div>
      <section className="border-b border-ink-100 bg-brand-50/40">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mt-6">
            <Breadcrumb
              items={[
                { label: "Beranda", href: "/" },
                { label: "Kontak", href: "/kontak" },
              ]}
            />
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              Konsultasi Kebutuhan Kalibrasi
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-600">
              Ceritakan alat, jadwal akreditasi, atau kebutuhan informasi biaya
              dan penawaran kalibrasi Anda — tim kami akan menghubungi untuk
              membantu proses yang jelas dan tepat waktu.
            </p>
          </div>
        </div>
      </section>
      <KontakForm />
    </div>
  );
}
