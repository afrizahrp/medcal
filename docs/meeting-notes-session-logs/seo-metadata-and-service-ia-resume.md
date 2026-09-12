# Resume Update — Service IA & SEO Metadata

Tanggal: 11 Agustus 2026  
Scope: `apps/web` (tanpa OG/Twitter/JSON-LD)

---

## 1. Informasi arsitektur layanan (bukan katalog produk)

### Rename data/model
| Sebelum | Sesudah | Lokasi |
|---|---|---|
| `exampleProducts` | `servedEquipment` | `service-categories.json`, `site.ts`, page/card/featured |
| `productsInScope` | `equipmentInScope` | `service-categories.json`, `site.ts` |

### UI halaman kategori
- Heading list tetap: **Peralatan dalam Layanan Ini**
- Chip peralatan tetap ringan (bukan product card)
- Callout akreditasi berulang di bawah section **dihapus dari UI** (data JSON `accreditation` tetap utuh)
- Wording non-KAN (scopeDetail):  
  *"Dikalibrasi sesuai metode yang berlaku berdasarkan Kemenkes RI dan SNI ISO/IEC 17025:2017."*

Hirarki konseptual yang dijaga:

```
Layanan → Service landing page → servedEquipment
```

Bukan:

```
Kategori → Product category → Products
```

---

## 2. Meta description per kategori layanan

### Perubahan
- Field baru: `metaDescription` di `service-categories.json`
- Type: `ServiceCategory.metaDescription: string` di `site.ts`
- `generateMetadata()` memakai `category.metaDescription` (bukan `intro`)
- `intro` / H1 / keywords **tidak** diubah untuk keperluan ini
- **Tidak** menambah `<meta name="keywords">`

### Nilai `metaDescription`

| Slug | metaDescription |
|---|---|
| monitoring-pasien | Jasa kalibrasi alat monitoring pasien untuk rumah sakit. Sphygmomanometer dan Bed Side Monitor dalam scope akreditasi KAN LK-521-IDN. |
| respirasi | Jasa kalibrasi alat respirasi dan life support rumah sakit, termasuk ventilator, flow meter oksigen, dan suction pump, sesuai SNI ISO/IEC 17025:2017. |
| neonatal-termal | Jasa kalibrasi alat neonatal dan termal ruang NICU, termasuk inkubator bayi, radiant warmer, dan timbangan bayi medis. |
| infus-pompa-cairan | Jasa kalibrasi pompa infus dan alat cairan medis, termasuk infuse pump, syringe pump, dan blood/solution warmer. |
| blood-bank | Jasa kalibrasi blood bank dan penyimpanan suhu medis. Blood Bank Refrigerator dalam scope akreditasi KAN LK-521-IDN (1°C–9°C). |
| sterilisasi | Jasa kalibrasi autoclave dan sterilizer medis untuk unit CSSD rumah sakit dan laboratorium klinik. |
| laboratorium | Jasa kalibrasi alat laboratorium klinik dan diagnostik, termasuk centrifuge, mikroskop, dan USG. |
| fasilitas-umum | Jasa kalibrasi alat penunjang dan fasilitas rumah sakit, termasuk timbangan dewasa medis dan tempat tidur elektrik. |

### Title kategori (tidak diubah)
- Sumber: `category.h1`
- Template root: `%s — Presisi Kalibrasi Medika`
- Contoh: `Jasa Kalibrasi Alat Monitoring Pasien Rumah Sakit — Presisi Kalibrasi Medika`

---

## 3. Hierarki metadata global (audit + perbaikan)

### Masalah yang ditemukan
1. Root description mengklaim KAN secara blanket → risiko terkesan semua layanan/alat dalam scope.
2. Homepage title + template root → brand dobel di tab.
3. `/kontak` (`"use client"`) tidak punya metadata page → inherit root sepenuhnya, tanpa canonical.

### Perbaikan yang diterapkan

**Root (`layout.tsx`)**
- `metadataBase`: dari `siteUrl` (`https://kalibrasimedika.co.id`)
- Template title: tetap `%s — Presisi Kalibrasi Medika`
- Description default: netral, tanpa klaim KAN menyeluruh  
  → *Jasa kalibrasi alat kesehatan dan laboratorium untuk rumah sakit serta laboratorium tipe C/D.*

**Homepage (`page.tsx`)**
- Title: `absolute` (hindari suffix brand dobel)
- Description: KAN **dengan kualifikasi** *untuk item dalam ruang lingkup*

**Kontak**
- Split: `page.tsx` (server + metadata) + `kontak-form.tsx` (client)
- Title: `Kontak` → efektif `Kontak — Presisi Kalibrasi Medika`
- Description: fokus konsultasi, tanpa klaim scope KAN
- Canonical: `/kontak`

**Tidak diubah dalam batch ini**
- `robots.ts`, `sitemap.ts`
- Open Graph / Twitter / JSON-LD
- Visible copy halaman (selain metadata)

---

## 4. Refinement kartu index `/layanan`

Audit IA `/layanan` menyimpulkan metadata hub sudah OK; yang diperbaiki hanya framing kartu.

### Tidak diubah
- Title, meta description, canonical `/layanan`
- Route / URL kartu (`/layanan/kalibrasi-{slug}`)
- Struktur data kategori, TrustBadges, sitemap, robots, OG/Twitter/JSON-LD

### Perubahan UI (`service-category-card.tsx`)

| Aspek | Sebelum | Sesudah |
|---|---|---|
| Teaser peralatan | `Sphygmomanometer, Bed Side Monitor, …, dan lainnya.` | `Peralatan yang dilayani: Sphygmomanometer, Bed Side Monitor, …, dan lainnya.` |
| Badge partial KAN | `KAN` | `Scope KAN` |

- Tetap: `servedEquipment.slice(0, 3)`
- Badge hanya jika `accreditation.status !== "none"` (`isCategoryAccredited`)
- Framed sebagai **Service → Equipment Served**, bukan Category → Products

### Hasil yang diharapkan
- 8 kartu tetap render
- Kategori `status: "none"` tanpa badge
- Kategori partial (monitoring-pasien, blood-bank) menampilkan **Scope KAN**

---

## 5. Pemisahan tanggung jawab metadata (target)

| Layer | Isi |
|---|---|
| Global | `metadataBase`, title template/default, description jasa umum |
| Homepage | Brand + value prop; KAN berkualifikasi |
| Service index (`/layanan`) | Positioning 8 layanan + KAN “untuk item dalam scope” (metadata dibiarkan) |
| Service category | `h1` + `metaDescription` spesifik |
| Sertifikasi & legalitas | Detail KAN LK-521-IDN, SNI 17025, legalitas |
| Kontak | Kontak/konsultasi + canonical |

Sumber kebenaran scope KAN tetap:
- `accreditation.status`
- `equipmentInScope`
- `kanAccreditedProducts` di `site.ts` (3 item)

---

## 6. File utama yang tersentuh

- `apps/web/src/data/service-categories.json`
- `apps/web/src/data/site.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/kontak/page.tsx`
- `apps/web/src/app/kontak/kontak-form.tsx` (baru)
- `apps/web/src/app/layanan/[kategori]/page.tsx`
- `apps/web/src/components/service-category-card.tsx`
- `apps/web/src/components/featured-categories-section.tsx`

---

## 7. Belum dikerjakan (backlog SEO)

- Open Graph (`og:title`, `og:description`, `og:image`)
- Twitter/X card metadata
- JSON-LD / structured data
- Review metadata `/sertifikasi-legalitas` bila perlu selaras penuh dengan hierarki di atas
- Opsional: H2 pada outline `/layanan` (H1 → H3 saat ini)
