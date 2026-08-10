const steps = [
  {
    step: "01",
    title: "Ajukan Kebutuhan",
    body: "Sampaikan jenis alat dan kebutuhan kalibrasi Anda melalui layanan kami",
  },
  {
    step: "02",
    title: "Jadwal Disepakati",
    body: "Kami mengonfirmasi kebutuhan dan menjadwalkan kalibrasi sesuai kebutuhan operasional Anda",
  },
  {
    step: "03",
    title: "Kalibrasi Dilakukan",
    body: "Pantau proses kalibrasi hingga pekerjaan selesai sesuai standar yang berlaku",
  },
  {
    step: "04",
    title: "Sertifikat Tersedia",
    body: "Akses sertifikat kalibrasi setelah proses selesai dan dokumen diterbitkan",
  },
] as const;

export function ProcessSteps() {
  return (
    <section className="border-y border-ink-100 bg-brand-50/40">
      <div className="mx-auto max-w-8xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Proses Kalibrasi Yang Sederhana dan Jelas
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ink-600 sm:text-lg">
            Ajukan kebutuhan kalibrasi, pantau prosesnya, dan akses sertifikat
            Anda melalui satu layanan yang terintegrasi.
          </p>
        </div>

        <ol className="mx-auto mt-10 max-w-3xl lg:mt-14 lg:grid lg:max-w-5xl lg:grid-cols-4">
          {steps.map((s, index) => {
            const isFirst = index === 0;
            const isLast = index === steps.length - 1;

            return (
              <li
                key={s.step}
                className="grid grid-cols-[2.25rem_1rem_minmax(0,1fr)] gap-x-3 lg:flex lg:flex-col lg:items-center lg:px-3 lg:text-center"
              >
                {/* Mobile: step number beside the dot */}
                <span className="pt-0.5 text-sm font-bold tabular-nums text-brand-700 lg:hidden">
                  <span className="sr-only">Langkah </span>
                  {s.step}
                </span>

                {/* Timeline rail */}
                <div className="relative flex justify-center self-stretch lg:w-full lg:items-center">
                  <span
                    aria-hidden
                    className={`absolute left-0 right-1/2 top-5 hidden h-px -translate-y-1/2 bg-brand-200 lg:block ${
                      isFirst ? "invisible" : ""
                    }`}
                  />
                  <span
                    aria-hidden
                    className={`absolute left-1/2 right-0 top-5 hidden h-px -translate-y-1/2 bg-brand-200 lg:block ${
                      isLast ? "invisible" : ""
                    }`}
                  />

                  {/* Mobile dot */}
                  <span
                    aria-hidden
                    className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600 lg:hidden"
                  />

                  {/* Desktop number marker */}
                  <span className="relative z-10 hidden h-10 w-10 items-center justify-center rounded-full border-2 border-brand-600 bg-white text-sm font-bold tabular-nums text-brand-700 lg:flex">
                    <span className="sr-only">Langkah </span>
                    {s.step}
                  </span>

                  {/* Mobile vertical connector */}
                  {!isLast ? (
                    <span
                      aria-hidden
                      className="absolute bottom-0 left-1/2 top-4 w-px -translate-x-1/2 bg-brand-200 lg:hidden"
                    />
                  ) : null}
                </div>

                <div
                  className={`min-w-0 lg:pt-5 ${
                    isLast ? "pb-0" : "pb-8 lg:pb-0"
                  }`}
                >
                  <h3 className="text-base font-semibold leading-snug text-ink-900 sm:text-lg">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-ink-600 lg:mt-1.5">
                    {s.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
