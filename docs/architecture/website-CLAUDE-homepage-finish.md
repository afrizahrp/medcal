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

## Current Build Session: Homepage + Katalog Frontend

These instructions apply to the current implementation phase and take precedence over broad project scope when deciding what to work on now.

### 1. Scope: FINISH the frontend, do not expand the project

The current job is **ONLY**:
- `apps/web`
- Homepage
- Frontend structure/navigation for the product catalog

Treat this task as a **finisher task**: inspect the existing implementation, understand what is already there, then make the homepage and catalog frontend production-ready within the stated constraints.

Do **NOT** in this session:
- modify `apps/api`
- modify `apps/web-api`
- modify `packages/db` or Prisma/database schema
- create backend modules, database migrations, billing logic, CRM logic, or new domain entities
- introduce global state management unless it is demonstrably required by the current frontend task
- build Customer Portal, Calibration Workflow, Dashboard, Mini ERP, or Document Vault
- invent missing business/domain rules

If a backend/API change appears necessary, stop and report the dependency rather than expanding scope automatically.

### 2. Source-document location

Project documentation referenced by this file is located under:
`D:\medcal\docs`

Before making content or architecture decisions, inspect the relevant documents that actually exist there. Do not replace missing source material with assumptions.

For this homepage task, `brand-content-brief.md` is mandatory. Other domain/ERD documents are relevant only if the implementation genuinely touches those areas.

### 3. Content safety / anti-hallucination rules

The **47-product catalog is NOT the main homepage content**. Do not fill the homepage with generic product claims merely because 47 products exist.

The 47 products may be framed as a credibility/supporting signal only when the wording cannot reasonably imply:
- all 47 products are KAN-accredited,
- all 47 products have the same accreditation scope,
- the company has more accreditation coverage than actually documented,
- technical specifications that have not been supplied by authoritative project material.

The folder/material known as **"BROSUR BIPMED V6" must NOT be used as a source of truth**. It belongs to a different core business and is not relevant source material for Presisi Kalibrasi Medika.

Never invent medical-device specifications, calibration ranges, standards, uncertainty values, accreditation scope, legal claims, customer numbers, years of experience, testimonials, logos, certifications, or performance claims.

For the 3 products within KAN scope (Blood Bank Refrigerator, Sphygmomanometer, Bed Side Monitor), treat the documented accreditation facts and numerical values as **locked source data**. Do not alter, broaden, round, reinterpret, or fabricate them. If a required value is not available in the authoritative source, leave it unresolved and report it rather than guessing.

### 4. Homepage messaging

Use the locked positioning and homepage messaging in `brand-content-brief.md` as the starting point. Do not invent a new business positioning during implementation.

The homepage should communicate the core outcome quickly:
- calibration for healthcare/laboratory equipment
- confidence around accreditation/audit acceptance
- timely and clear process
- reduced administrative hassle

The KAN + ISO 17025 trust signals must remain visible above the fold as specified in the brief.

Do not visually or verbally imply blanket KAN accreditation for the entire catalog.

### 5. CTA behavior

Follow the existing business CTA pattern demonstrated by `https://bipmed.co.id` as a behavioral reference: consultation/contact should have a proper contact/lead form, with WhatsApp available as a secondary direct-contact path.

For this project, the primary CTA is conceptually **"Konsultasi Kebutuhan Kalibrasi"**. A secondary WhatsApp CTA may be provided using the business contact already documented in `brand-content-brief.md`.

Do not invent additional phone numbers, contact identities, or CTA destinations.

### 6. Visual direction

The existing teal/navy direction came from the current scaffold/implementation and is **not a final locked brand-token system**.

For this implementation, keep the general direction if it works, but prioritize a **soft, calm, comfortable visual experience** that allows users to stay on the site for a long time. Avoid overly saturated colors, aggressive gradients, excessive contrast, or visually noisy effects.

Use `https://bipmed.co.id` only as a general UX/visual reference for comfort and familiarity. Do not copy its content, branding, business claims, or design wholesale.

Do not spend the session trying to establish a perfect design system. Make sensible, consistent choices that can be refined later.

### 7. Performance / animation

Homepage performance matters, especially Lighthouse/Core Web Vitals.

- Prefer CSS transitions and lightweight native techniques.
- Avoid Framer Motion by default.
- Use Framer Motion only if an interaction genuinely cannot be achieved appropriately without it, and then use it minimally.
- Do not add animation merely because it looks impressive.
- Avoid unnecessary client components, JavaScript, large dependencies, and layout shifts.
- Preserve mobile-first performance under throttled 3G/4G conditions.

### 8. Stack is already decided

Current frontend stack:
- Next.js 16
- Tailwind CSS
- shadcn/ui

Inspect the actual installed versions and existing project structure under `D:\medcal\apps` before introducing anything new.

Do not replace the stack or add competing UI/component systems just to implement the homepage.

Global state management is **not required at this stage** unless inspection proves a concrete need. Prefer local/component state and existing project patterns.

### 9. Agent behavior: finish, don't overreach

Act as the **finisher**, not as a business strategist inventing requirements.

You have authority to decide implementation details such as:
- component boundaries
- responsive layout
- spacing and typography
- CSS implementation
- semantic HTML
- accessibility details
- lightweight interaction patterns
- image/layout optimization
- refactoring needed to make the homepage coherent

You do NOT have authority to invent or change:
- business positioning
- accreditation claims
- legal facts
- product specifications
- locked URL/SEO decisions
- domain/database architecture
- business workflows

When a decision is low-risk and purely implementation-level, make the decision and continue.
When a decision could materially change business meaning, legal/accreditation claims, architecture, or scope, stop and ask rather than guessing.

### 10. Definition of done for this session

Do not stop at "the page renders". Finish the homepage to a sensible first production-quality pass:
- coherent visual hierarchy
- clear above-the-fold message
- trust signals visible and accurate
- mobile-first at ~375px
- responsive tablet/desktop behavior
- accessible interactive elements and touch targets
- sensible loading/performance behavior
- no obvious console/build/type errors introduced
- existing project conventions respected
- no unrelated files or subsystems modified

This is a **first solid implementation pass**, not a request to achieve perfect branding or final pixel-level polish. Optimize for forward progress and a reviewable working homepage.
