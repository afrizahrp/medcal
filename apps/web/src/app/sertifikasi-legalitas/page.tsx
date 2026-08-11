import type { Metadata } from "next";
import { company, kanAccreditedProducts } from "@/data/site";
import { SectionCta } from "@/components/section-cta";
import { Breadcrumb } from "@/components/breadcrumb";

export const metadata: Metadata = {
  title: "Sertifikasi & Legalitas",
  description:
    "Akreditasi KAN LK-521-IDN dengan scope 3 jenis alat, standar SNI ISO/IEC 17025:2017, serta dokumen legalitas PT Presisi Kalibrasi Medika.",
  alternates: { canonical: "/sertifikasi-legalitas" },
  openGraph: { url: "/sertifikasi-legalitas" },
};

const legalDocs = [
  "Akta Pendirian PT",
  "Nomor Induk Berusaha (NIB)",
  "NPWP",
  "SKB",
  "SUKET",
  "Surat Keterangan Non-PKP",
];

export default function SertifikasiLegalitasPage() {
  return (
    <div>
      <section className="border-b border-ink-100 bg-brand-50/40">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mt-6">
            <Breadcrumb
              items={[
                { label: "Beranda", href: "/" },
                { label: "Sertifikasi & Legalitas" },
              ]}
            />
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              Sertifikasi & Legalitas
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-600">
              PT Presisi Kalibrasi Medika memiliki dokumen legalitas usaha serta
              akreditasi KAN untuk ruang lingkup kalibrasi tertentu.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">
            Akreditasi KAN
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink-500">Nomor Akreditasi</dt>
              <dd className="text-sm font-medium text-ink-900">
                {company.accreditation.number}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-500">Masa Berlaku</dt>
              <dd className="text-sm font-medium text-ink-900">
                {company.accreditation.validity}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-ink-500">Standar</dt>
              <dd className="text-sm font-medium text-ink-900">
                {company.accreditation.standard}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-sm leading-relaxed text-ink-500">
            Scope akreditasi KAN kami saat ini mencakup 3 jenis alat.
            Kalibrasi alat lain di luar scope tetap dilakukan oleh
            laboratorium yang sama mengikuti standar{" "}
            {company.accreditation.standard}.
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            {kanAccreditedProducts.map((p) => (
              <li
                key={p.name}
                className="flex items-center justify-between rounded-xl bg-brand-50/60 px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-ink-800">{p.name}</span>
                <span className="text-ink-500">{p.scope}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">
            Legalitas Usaha
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {legalDocs.map((doc) => (
              <li
                key={doc}
                className="flex items-center gap-2 text-sm text-ink-700"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                  ✓
                </span>
                {doc}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SectionCta
        variant="banner"
        />
    </div>
  );
}
