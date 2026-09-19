# CLAUDE.md / AGENTS.md — medcal monorepo

Instruksi standing untuk AI coding assistant (Claude Code, Cursor, atau
lainnya) yang bekerja di repo ini. Baca file ini dulu sebelum membuat
atau mengubah kode maupun konten.

## Apa proyek ini

Website B2B + platform kalibrasi alat kesehatan untuk **PT Presisi
Kalibrasi Medika**. Nama monorepo "medcal" adalah **codename internal
teknis** — jangan pernah tampil di UI/konten publik. Brand publik yang
benar: **Presisi Kalibrasi Medika**.

Urutan build: Website + Lead Gen (fase sekarang) → Customer Portal →
Calibration Workflow → Dashboard → Mini ERP → Document Vault.

## Dokumen sumber kebenaran (baca sesuai kebutuhan task)

| File | Kapan dibaca |
|---|---|
| `brand-content-brief.md` | Setiap kali mengerjakan copy/konten publik (homepage, halaman produk, meta tags) |
| `000-project-bootstrap.md` | Setiap kali menyentuh schema/domain model (companyId, Lead, Invoice, dll) |
| `business-domain.md` | Memahami 18 domain bisnis & cross-domain rules |
| `entity-catalog.md` | Referensi entity, relasi, enum sebelum bikin Prisma schema/API |
| `docs/ERD/` | Diagram relasi sebelum ubah struktur data |
| `seo-prelaunch-checklist-dan-keyword-research.md` | Struktur URL, keyword, H1/H2/H3 per kategori produk |

**Jangan generate konten atau schema dari asumsi/template generik kalau
salah satu dokumen di atas relevan dengan task yang sedang dikerjakan.**

## Prioritas #1: Mobile-First UI/UX

**Ini prioritas tertinggi, di atas semua aturan lain di bawah.** Setiap
komponen/halaman baru harus didesain & ditest untuk mobile dulu, baru
di-enhance ke tablet/desktop — bukan sebaliknya. Sebelum submit/selesai
task UI apapun, cek:
- Tampilan di viewport kecil (~375px) dulu, bukan cuma desktop
- Tabel/data lebar → card/stack di mobile, jangan scroll horizontal
- Touch target (button, link) cukup besar untuk jempol
- Core Web Vitals wajar di kondisi koneksi lambat (3G/4G throttled)
- Badge trust (KAN/ISO) tetap terbaca jelas di layar kecil

Kalau sebuah desain/komponen terlihat bagus di desktop tapi berantakan
atau susah dipakai di mobile, itu **gagal**, terlepas seberapa bagus
versi desktopnya.

## Aturan arsitektur yang tidak boleh dilanggar

1. `apps/web-api` (Express) **tidak boleh** punya business logic atau
   persist data sendiri — hanya captcha/rate-limit/forward ke `apps/api` (Nest).
2. companyId dikunci lewat **env var server-side** per deployment
   website, **tidak pernah** dari payload client/form.
3. **Tidak ada** `branchId`/`Branch` di skema manapun — sudah dihapus
   total dari domain model (ADR-000 #1). Jangan tambahkan lagi.
4. Lead intake pakai entity `ContactMessage` + enum `GetMessageFrom`
   (pola bi-erp) — jangan bikin entity `LeadSubmission`/`LeadSource` baru.
5. Katalog 47 produk = **static JSON** (`products.json`), bukan
   database/admin CMS, untuk MVP. Jangan bikin CRUD admin panel kecuali
   diminta eksplisit.
6. Billing: `Certificate.billingStatus` adalah satu-satunya source of
   truth billable. `WorkOrder` tidak billable independen. Invoice ↔
   Certificate = many-to-many.
7. Tidak ada Redis/BullMQ/Kafka/microservices/Kubernetes kecuali ada
   ADR baru yang membuka itu secara eksplisit.

## Aturan konten (khusus copy/marketing)

1. **Pain point inti**: purchasing takut sertifikat kalibrasi ditolak
   saat audit akreditasi RS. Semua copy diuji terhadap ini.
2. **Klaim akreditasi KAN hanya untuk 3 produk** dalam scope
   LK-521-IDN: Blood Bank Refrigerator, Sphygmomanometer, Bed Side
   Monitor. Produk lain pakai frasa umum soal status lab, bukan klaim
   produk itu terakreditasi.
3. Jangan overclaim usia perusahaan (~2 tahun) atau jumlah produk
   (47) sebagai differentiator utama — differentiator utama adalah
   **kepastian sertifikat lolos audit**, bukan skala.
4. Homepage wajib menampilkan badge KAN + ISO 17025 di atas fold (15
   detik pertama), bukan disembunyikan di halaman lain.
5. Struktur halaman produk: Description → Benefit → Ruang Lingkup &
   Parameter → Proses → CTA (lihat `brand-content-brief.md` §8).

## Aturan SEO (mencegah kesalahan yang pernah terjadi di project sebelumnya)

1. URL structure **dikunci sebelum** konten ditulis:
   `/layanan/kalibrasi-[kategori]/[produk]`. Jangan ubah slug setelah
   halaman live tanpa 301 redirect.
2. Keyword per halaman dikunci di depan (lihat file SEO checklist).
   Perubahan setelah live = **penambahan**, bukan mengganti topik utama
   halaman yang sudah ter-index.
3. Sitemap harus **dinamis** (generate dari route), submit ke GSC sejak
   staging pertama kali live — jangan ditunda.
4. Setiap halaman produk minimal 300-500 kata konten unik — jangan
   template kosong yang cuma ganti nama alat (risiko thin/duplicate
   content).

## Stack

Next.js (apps/web), Express (apps/web-api), NestJS modular monolith
(apps/api), Prisma + PostgreSQL, Tailwind + shadcn/ui saja, TanStack
Query, Zustand, Better Auth, Turborepo + pnpm, mobile-first, Docker
Compose di Hostinger KVM4.

## Kalau ragu

Kalau sebuah keputusan tidak tercakup di dokumen manapun di atas,
**tanyakan ke user dulu**, jangan berasumsi — terutama untuk hal yang
menyentuh schema database, klaim akreditasi/legalitas, atau struktur
URL/keyword yang sudah dikunci.
