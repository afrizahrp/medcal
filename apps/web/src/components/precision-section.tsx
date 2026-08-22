import { LazyVideo } from "@/components/lazy-video";

export function PrecisionSection() {
  return (
    <section className="border-y border-ink-100 bg-white">
      <div className="mx-auto max-w-8xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <div className="order-2 lg:order-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 sm:text-sm">
              Metodologi Kalibrasi
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
              Presisi di Setiap Pengukuran
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-600 sm:text-lg">
              Setiap alat dikalibrasi oleh teknisi berpengalaman menggunakan instrumen dan probe
              kalibrasi yang terjaga ketertelusurannya, mengikuti prosedur baku sesuai SNI ISO/IEC
              17025:2017
            </p>
          </div>

          <div className="order-1 lg:order-2">
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-ink-100 bg-brand-50/40 shadow-sm">
              <LazyVideo
                src="/single-technician.webm"
                className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
