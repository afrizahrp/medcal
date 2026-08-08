const steps = [
  {
    step: "01",
    title: "Konsultasi Kebutuhan",
    body: "Sampaikan jenis alat dan jadwal akreditasi Anda — kami bantu petakan kebutuhan kalibrasi.",
  },
  {
    step: "02",
    title: "Penjadwalan Jelas",
    body: "Jadwal kalibrasi disepakati di depan agar operasional alat Anda tidak terganggu lama.",
  },
  {
    step: "03",
    title: "Kalibrasi di Lokasi",
    body: "Teknisi kami melakukan kalibrasi sesuai standar SNI ISO/IEC 17025:2017.",
  },
  {
    step: "04",
    title: "Sertifikat Terbit",
    body: "Sertifikat kalibrasi diterbitkan lengkap dan siap dilampirkan saat audit akreditasi.",
  },
];

export function ProcessSteps() {
  return (
    <section className="border-y border-ink-100 bg-brand-50/40">
      <div className="mx-auto max-w-8xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Proses Kalibrasi yang Jelas, Tanpa Ribet
          </h2>
        </div>

        <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li
              key={s.step}
              className="rounded-2xl border border-ink-100 bg-white p-5"
            >
              <span className="text-sm font-bold text-brand-600">
                {s.step}
              </span>
              <h3 className="mt-2 text-sm font-semibold text-ink-900">
                {s.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
