const points = [
  {
    title: "Vendor lambat merespons",
    body: "Jadwal akreditasi mepet, tapi vendor kalibrasi sulit dihubungi saat dibutuhkan.",
  },
  {
    title: "Alat menganggur menunggu sertifikat",
    body: "Operasional tertahan karena proses kalibrasi tidak jelas kapan selesainya.",
  },
  {
    title: "Dokumen tidak sesuai format auditor",
    body: "Sertifikat yang tidak lengkap berisiko ditolak saat pemeriksaan akreditasi.",
  },
];

export function PainPointSection() {
  return (
    <section className="mx-auto max-w-8xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          Ketakutan terbesar tim purchasing: sertifikat ditolak saat audit
        </h2>
        <p className="mt-3 text-base leading-relaxed text-ink-600">
          Ini bukan soal harga atau kelengkapan alat — ini soal risiko
          operasional dan kepatuhan rumah sakit yang harus dihindari sejak
          awal.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {points.map((point) => (
          <div
            key={point.title}
            className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-ink-900">
              {point.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              {point.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
