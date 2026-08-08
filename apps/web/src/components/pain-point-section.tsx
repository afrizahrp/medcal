import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionCta } from "@/components/section-cta";

const items = [
  {
    question:
      "Apakah sertifikat kalibrasi sesuai dengan ruang lingkup akreditasi?",
    answer:
      "Kalibrasi perlu dilakukan sesuai ruang lingkup akreditasi yang tersedia. Jenis alat, parameter, dan metode yang dapat dilayani perlu disesuaikan dengan scope akreditasi yang berlaku",
  },
  {
    question: "Bagaimana memastikan dokumentasi kalibrasi mudah ditelusuri?",
    answer:
      "Hasil kalibrasi dilengkapi dokumentasi yang jelas dan rapi, sehingga informasi terkait alat dan hasil pengukurannya lebih mudah ditelusuri untuk memenuhi kebutuhan audit akreditasi kapan saja",
  },
  {
    question: "Berapa lama proses kalibrasi sampai sertifikat diterbitkan?",
    answer:
      "Waktu penyelesaian bergantung pada jenis alat, jumlah alat, parameter yang dikalibrasi, serta kebutuhan proses kalibrasi. Jadwal dapat dikonfirmasi saat pengajuan",
  },
  {
    question: "Apa yang perlu disiapkan sebelum mengajukan kalibrasi?",
    answer:
      "Siapkan informasi alat seperti nama alat, merek, tipe/model, nomor seri, serta kebutuhan kalibrasi. Tim kami dapat membantu memastikan kebutuhan tersebut sesuai dengan layanan dan ruang lingkup yang tersedia",
  },
];

export function PainPointSection() {
  return (
    <section className="mx-auto max-w-8xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 sm:text-sm">
            Sebelum Memilih Layanan Kalibrasi
          </p>
          <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Apa yang Perlu Anda Pastikan?
          </h2>
          <p className="mt-3 text-pretty text-base leading-relaxed text-ink-600 sm:text-lg">
            Mulai dari ruang lingkup akreditasi hingga dokumentasi hasil
            kalibrasi, berikut beberapa hal yang penting untuk diketahui
          </p>
        </div>

        <Accordion className="mt-8">
          {items.map((item, index) => {
            return (
              <AccordionItem key={item.question} value={`faq-${index + 1}`}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>
                  <p>{item.answer}</p>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        <SectionCta
          title="Masih ada yang ingin Anda pastikan?"
          description="Jangan ragu menghubungi kami untuk mendiskusikan kebutuhan kalibrasi dan menemukan layanan yang tepat untuk Anda"
        />
      </div>
    </section>
  );
}
