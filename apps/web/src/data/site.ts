import serviceCategoriesJson from "./service-categories.json";

// Fakta perusahaan — locked, lihat docs/claude/3 brand-content-brief.md §1
export const company = {
  legalName: "PT Presisi Kalibrasi Medika",
  brandName: "Presisi Kalibrasi Medika",
  address:
    "Gedung Graha Bumi Indah Lantai 3, Jl. Inspeksi Kalimalang Kavling Agraria Blok E No. 10, Duren Sawit, Jakarta Timur, DKI Jakarta",
  phoneDisplay: "62 813 1922 5637", //"62 857-7329-2530",
  phoneRaw: "6281319225637", //"6285773292530",
  whatsappNumber: "6281319225637", //"6285773292530",
  email: "info@kalibrasimedika.co.id",
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
    categorySlug: "blood-bank",
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

export type ServiceCategoryAccreditationStatus = "partial" | "none";

export type ServiceCategory = {
  slug: string;
  name: string;
  h1: string;
  intro: string;
  metaDescription: string;
  keywords: {
    primary: string;
    secondary: string[];
  };
  sections: {
    heading: string;
    badge?: string | null;
    scopeDetail?: string;
  }[];
  servedEquipment: string[];
  accreditation: {
    status: ServiceCategoryAccreditationStatus;
    scopeNote: string;
    equipmentInScope: string[];
  };
};

// Temporary content source before a physical categories table exists.
// Kategori & keyword mengikuti docs/claude/4 seo-prelaunch-checklist-dan-keyword-research.md Bagian 2 & 3.
export const serviceCategories = serviceCategoriesJson as ServiceCategory[];

export function getServiceCategory(slug: string) {
  return serviceCategories.find((c) => c.slug === slug);
}

export function getKanEquipmentForCategory(categorySlug: string) {
  return kanAccreditedProducts.filter(
    (product) => product.categorySlug === categorySlug,
  );
}

export function hasKanScopeForCategory(categorySlug: string) {
  return kanAccreditedProducts.some(
    (product) => product.categorySlug === categorySlug,
  );
}

export function isCategoryAccredited(category: ServiceCategory) {
  return hasKanScopeForCategory(category.slug);
}
