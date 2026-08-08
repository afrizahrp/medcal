// Fakta perusahaan — locked, lihat docs/claude/3 brand-content-brief.md §1
export const company = {
  legalName: "PT Presisi Kalibrasi Medika",
  brandName: "Presisi Kalibrasi Medika",
  address:
    "Gedung Graha Bumi Indah Lantai 3, Jl. Inspeksi Kalimalang Kavling Agraria Blok E No. 10, Duren Sawit, Jakarta Timur, DKI Jakarta",
  phoneDisplay: "0821-2378-2666",
  phoneRaw: "082123782666",
  whatsappNumber: "6282123782666",
  email: "presisikalibrasimedika@gmail.com",
  accreditation: {
    body: "KAN",
    number: "LK-521-IDN",
    validity: "17 Maret 2026 – 16 Maret 2031",
    standard: "SNI ISO/IEC 17025:2017",
  },
} as const;

export function waLink(message: string) {
  return `https://wa.me/${company.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export const primaryNav = [
  { label: "Beranda", href: "/" },
  { label: "Layanan Kalibrasi", href: "/layanan" },
  { label: "Sertifikasi & Legalitas", href: "/sertifikasi-legalitas" },
  { label: "Kontak", href: "/kontak" },
] as const;

// 3 produk dalam scope akreditasi KAN LK-521-IDN — locked, jangan diubah.
export const kanAccreditedProducts = [
  {
    name: "Blood Bank Refrigerator",
    scope: "Suhu 1–9°C",
    categorySlug: "cold-chain",
  },
  {
    name: "Sphygmomanometer",
    scope: "Tekanan 0–250 mmHg",
    categorySlug: "monitoring-pasien",
  },
  {
    name: "Bed Side Monitor",
    scope: "Heart rate / systole / diastole",
    categorySlug: "monitoring-pasien",
  },
] as const;

export type ServiceCategory = {
  slug: string;
  name: string;
  h1: string;
  intro: string;
  sections: { heading: string; note?: string }[];
  exampleProducts: string[];
  accredited: boolean;
  accreditedNote?: string;
};

// Kategori & keyword mengikuti docs/claude/4 seo-prelaunch-checklist-dan-keyword-research.md Bagian 2 & 3.
export const serviceCategories: ServiceCategory[] = [
  {
    slug: "monitoring-pasien",
    name: "Monitoring Pasien",
    h1: "Kalibrasi Alat Monitoring Pasien Tersertifikasi KAN",
    intro:
      "Alat monitoring pasien adalah lini pertama yang dicek auditor akreditasi karena berhubungan langsung dengan keselamatan pasien. Sphygmomanometer dan Bed Side Monitor kami kalibrasi dalam scope terakreditasi KAN (LK-521-IDN), sehingga sertifikatnya siap diperiksa auditor tanpa keraguan.",
    sections: [
      {
        heading: "Kalibrasi Sphygmomanometer & Bed Side Monitor",
        note: "Terakreditasi KAN — LK-521-IDN",
      },
      { heading: "Kalibrasi Patient Monitor, ECG & Alat Monitoring Lainnya" },
      { heading: "Proses & Standar Kalibrasi Monitoring Pasien" },
    ],
    exampleProducts: [
      "Patient Monitor",
      "ECG",
      "Sphygmomanometer",
      "Bed Side Monitor",
      "Ambulatory ECG",
      "Electrocardiograph",
      "Pulse Oxymeter",
      "Oxymeter Monitor",
      "Cardiac Output Unit",
    ],
    accredited: true,
    accreditedNote:
      "Sphygmomanometer & Bed Side Monitor masuk scope akreditasi KAN LK-521-IDN. Alat monitoring pasien lainnya dikalibrasi oleh laboratorium yang sama namun di luar scope akreditasi saat ini.",
  },
  {
    slug: "respirasi",
    name: "Respirasi & Life Support",
    h1: "Kalibrasi Alat Respirasi & Life Support Rumah Sakit",
    intro:
      "Ventilator dan alat bantu napas lain tidak boleh menganggur lama menunggu kalibrasi. Kami menjaga proses kalibrasi tetap jelas dan tepat waktu agar ruang ICU dan ruang operasi tidak kehilangan alat kritis lebih lama dari yang seharusnya.",
    sections: [
      { heading: "Kalibrasi Ventilator & Alat Bantu Napas" },
      { heading: "Kalibrasi Regulator & Flow Meter Oksigen" },
      { heading: "Kalibrasi Alat Suction & Resusitasi" },
    ],
    exampleProducts: [
      "Ventilator",
      "Nebulizer Compressor",
      "Oxygen Concentrator",
      "Oxygen-Air Proportioner",
      "Suction Pump",
      "Aspirator",
      "Resuscitator",
    ],
    accredited: false,
  },
  {
    slug: "neonatal-termal",
    name: "Neonatal & Termal",
    h1: "Kalibrasi Alat Neonatal & Termal (NICU)",
    intro:
      "Alat NICU bekerja pada rentang suhu yang sangat sensitif. Kalibrasi rutin memastikan inkubator dan alat termoterapi tetap berada dalam batas aman untuk bayi, sekaligus melengkapi dokumen yang diminta auditor akreditasi.",
    sections: [
      { heading: "Kalibrasi Inkubator Bayi & Infant Warmer" },
      { heading: "Kalibrasi Alat Termoterapi (Radiant Warmer, Hipo-Hipertermia)" },
      { heading: "Kalibrasi Timbangan Bayi" },
    ],
    exampleProducts: [
      "Baby Incubator",
      "Infant Warmer",
      "Radiant Warmer",
      "Timbangan Bayi",
      "Paraffin Bath",
      "Whirlpool Bath",
    ],
    accredited: false,
  },
  {
    slug: "infus-pompa-cairan",
    name: "Infus & Pompa Cairan",
    h1: "Kalibrasi Pompa Infus & Alat Cairan Medis",
    intro:
      "Akurasi laju infus dan syringe pump berdampak langsung pada dosis obat yang diterima pasien. Kami kalibrasi alat cairan medis dengan proses yang terdokumentasi rapi, siap dilampirkan saat audit.",
    sections: [
      { heading: "Kalibrasi Infuse Pump & Syringe Pump" },
      { heading: "Kalibrasi Blood/Solution Warmer & Breast Pump" },
    ],
    exampleProducts: [
      "Infuse Pump",
      "Syringe Pump",
      "Blood/Solution Warmer",
      "Breast Pump",
    ],
    accredited: false,
  },
  {
    slug: "cold-chain",
    name: "Cold Chain & Penyimpanan Suhu",
    h1: "Kalibrasi Cold Chain & Penyimpanan Suhu Medis",
    intro:
      "Blood Bank Refrigerator kami kalibrasi dalam scope terakreditasi KAN (LK-521-IDN) untuk rentang suhu 1–9°C. Untuk kulkas vaksin dan medical freezer lainnya, proses kalibrasi tetap mengikuti standar SNI ISO/IEC 17025:2017 yang sama.",
    sections: [
      {
        heading: "Kalibrasi Blood Bank Refrigerator",
        note: "Terakreditasi KAN — LK-521-IDN",
      },
      { heading: "Kalibrasi Kulkas Vaksin & Medical Freezer" },
      { heading: "Kalibrasi Cold Chain & Penyimpanan Obat" },
    ],
    exampleProducts: [
      "Blood Bank Refrigerator",
      "Kulkas Vaksin",
      "Medical Freezer",
      "Vaccine Refrigerator",
      "Oven",
    ],
    accredited: true,
    accreditedNote:
      "Blood Bank Refrigerator masuk scope akreditasi KAN LK-521-IDN. Alat cold chain lainnya dikalibrasi oleh laboratorium yang sama namun di luar scope akreditasi saat ini.",
  },
  {
    slug: "sterilisasi",
    name: "Sterilisasi",
    h1: "Kalibrasi Alat Sterilisasi (Autoclave & Sterilizer)",
    intro:
      "Kegagalan sterilisasi berisiko langsung ke keselamatan pasien dan menjadi salah satu titik cek auditor CSSD. Kalibrasi suhu dan tekanan autoclave kami lakukan dengan proses yang jelas dan terdokumentasi.",
    sections: [
      { heading: "Kalibrasi Autoclave CSSD" },
      { heading: "Kalibrasi Sterilizer Laboratorium & Klinik" },
    ],
    exampleProducts: ["Autoclave", "Sterilizer"],
    accredited: false,
  },
  {
    slug: "laboratorium",
    name: "Laboratorium & Diagnostik",
    h1: "Kalibrasi Alat Laboratorium & Diagnostik",
    intro:
      "Hasil diagnostik yang akurat berawal dari alat laboratorium yang terkalibrasi dengan benar. Kami membantu laboratorium klinik menjaga kepatuhan kalibrasi rutin tanpa mengganggu jadwal operasional.",
    sections: [
      { heading: "Kalibrasi Centrifuge & Mikroskop" },
      { heading: "Kalibrasi USG" },
    ],
    exampleProducts: ["Centrifuge", "Mikroskop", "USG"],
    accredited: false,
  },
  {
    slug: "fasilitas-umum",
    name: "Fasilitas Umum RS",
    h1: "Kalibrasi Alat Fasilitas Umum Rumah Sakit",
    intro:
      "Timbangan dan tempat tidur elektrik termasuk alat yang sering luput dari jadwal kalibrasi rutin, padahal tetap masuk cakupan audit akreditasi. Kami bantu lengkapi dokumen kalibrasinya.",
    sections: [
      { heading: "Kalibrasi Timbangan Dewasa" },
      { heading: "Kalibrasi Tempat Tidur Elektrik (Electric Bed)" },
    ],
    exampleProducts: ["Timbangan Dewasa", "Electric Bed"],
    accredited: false,
  },
];

export function getServiceCategory(slug: string) {
  return serviceCategories.find((c) => c.slug === slug);
}
