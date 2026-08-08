import { company, kanAccreditedProducts } from "@/data/site";

export function AccreditationSection() {
  return (
    <section className="mx-auto max-w-8xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Akreditasi KAN & Standar SNI ISO/IEC 17025:2017
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ink-600">
            Presisi Kalibrasi Medika terakreditasi Komite Akreditasi Nasional
            (KAN) dengan nomor {company.accreditation.number}, berlaku{" "}
            {company.accreditation.validity}, mengikuti standar{" "}
            {company.accreditation.standard}. Seluruh legalitas usaha kami
            lengkap: Akta PT, NIB, NPWP, dan dokumen pendukung lainnya.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            Saat ini scope akreditasi KAN kami mencakup 3 jenis alat.
            Kalibrasi alat lain tetap dilakukan oleh laboratorium yang sama
            mengikuti standar SNI ISO/IEC 17025:2017, di luar scope
            akreditasi resmi.
          </p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-semibold text-ink-900">
            Alat dalam scope akreditasi KAN ({company.accreditation.number})
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {kanAccreditedProducts.map((p) => (
              <li
                key={p.name}
                className="flex items-start justify-between gap-3 border-b border-ink-100 pb-3 last:border-0 last:pb-0"
              >
                <span className="text-sm font-medium text-ink-800">
                  {p.name}
                </span>
                <span className="shrink-0 text-right text-xs text-ink-500">
                  {p.scope}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
