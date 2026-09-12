# Design Principles — medcal

Prinsip yang mengunci keputusan arsitektur dan produk. Bila conflict dengan “nice to have”, prinsip ini menang.

## 1. KISS sebelum scale

- Mulai modular monolith (`apps/api`), bukan microservices.
- Tanpa Redis/Bull/Kafka/K8s di Fase 0–1 kecuali ada bottleneck terukur.
- Jangan menambah kolom/tabel “untuk berjaga-jaga”.

## 2. Company-only, multi-tenant-ready

- Satu level organisasi: `companyId` di setiap tabel bisnis.
- Tidak ada `Branch` (lihat ADR-000).
- Public edge (`web-api`) mengunci `COMPANY_ID` dari env server — tidak dari client body.

## 3. Boundary yang jelas

| Layer | Boleh | Tidak boleh |
| ----- | ----- | ----------- |
| `apps/web` | UI publik, form | Business rules, DB langsung |
| `apps/web-api` | Validasi input, captcha, forward + `companyId` | Domain logic berat |
| `apps/api` | Satu-satunya business layer | Dipanggil anonim dari internet tanpa edge |
| Packages | Shared types, schema, auth helpers | App-specific UI flow |

## 4. Messaging ≠ pipeline

- `ContactMessage` / `GetMessageFrom` = kanal masuk (pola bi-erp).
- `Lead` = pipeline CBMS setelah intake.
- Refine field messaging boleh; jangan pecahkan core pola messaging.

## 5. Billing yang eksplisit

- Billable SoR = Certificate.
- Invoice M:N Certificate; revoke setelah invoiced → CreditNote, bukan auto-void.
- Certificate issued → `billingStatus=billable` otomatis; invoice tetap aksi eksplisit.

## 6. UI & stack pin

- Tailwind + shadcn; mobile-first.
- Next.js **16.2.12** + React **19** (ADR-001) — jangan naik major/canary tanpa ADR baru.
- Auth portal/PWA: Better Auth (bukan anonymous public web).

## 7. Dokumentasi hidup

- Keputusan mahal → ADR.
- Domain → `business-domain.md` + entity catalog + ERD.
- Perubahan skema → update ERD/prisma-notes sebelum migrate produksi.
