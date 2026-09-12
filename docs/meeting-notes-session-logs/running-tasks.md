Jalankan task di file ini. Stage 1 saja dulu — propose desainnya, jangan tulis kode. Stop dan tunggu approval saya sebelum lanjut Stage 2. Pastikan mobile-first diterapkan ketat di setiap keputusan
Read j:\medcal\docs\claude\plans\technician-app\ui-tasks\Implement_TechPWA_Foundation_JobList_Detail_Staged.md
Globpattern: "apps/tech-pwa/**/\*.{ts,tsx,json,js,mjs}"
Found 43 files
Read j:\medcal\apps\tech-pwa\src\app\layout.tsx
Read j:\medcal\apps\tech-pwa\src\app\page.tsx
Read j:\medcal\apps\tech-pwa\tailwind.config.js
Read j:\medcal\apps\tech-pwa\package.json
Read j:\medcal\apps\tech-pwa\src\app\providers.tsx
Read j:\medcal\docs\claude\plans\technician-app\investigation-tech-pwa-design.md
Globpattern: "**/investigation-tech-pwa-design*.md"
Found 1 file
Globpattern: "apps/tech-pwa/**/{manifest,globals}\*"
Found 2 files
Globpattern: "**/short-logo*"
Found 3 files
Globpattern: "apps/tech-pwa/public/**"
Found 2 files
Read j:\medcal\apps\tech-pwa\public\manifest.webmanifest
Read j:\medcal\apps\tech-pwa\src\app\globals.css
Read j:\medcal\docs\claude\plans\technician-app\pre-implementation-audit\investigation-tech-pwa-design-report.md
Read j:\medcal\apps\tech-pwa\src\app\firebase-messaging-sw.js\route.ts
Globpattern: "apps/portal/src/app/management/calibration-jobs/**/*.{ts,tsx}"
Found 9 files
Bash
IN
file apps/tech-pwa/public/short-logo.png && ls -la apps/tech-pwa/public/short-logo.png

OUT
apps/tech-pwa/public/short-logo.png: PNG image data, 239 x 300, 8-bit/color RGBA, non-interlaced
-rw-r--r-- 1 Afriz 197609 41302 Aug 24 09:24 apps/tech-pwa/public/short-logo.png
Read j:\medcal\apps\portal\src\app\management\calibration-jobs\calibration-job-utils.ts
Read j:\medcal\apps\portal\src\app\management\calibration-jobs\use-calibration-jobs-query.ts
Bash
IN
cd j:/medcal && git show 6e3e5c0 --stat | head -40

OUT
commit 6e3e5c0d6cbc7ba9e13450d8a6f5a5e015ac58db
Author: afrizahrp <afriza.hrp@gmail.com>
Date: Fri Sep 4 16:19:34 2026 +0700

    feat(api): technician-scoped assignedToMe filter on GET /calibration-jobs

    Adds assignedToMe query param — when true, scopes the job list to jobs on
    WorkOrders the requesting user is assigned to, resolved from @UserId() and
    never a client-supplied id. Pure addition: omitting it preserves current
    behavior. Reuses calibrationJob:read; no schema or RBAC change.

    Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

.../calibration-jobs.controller.ts | 3 +-
.../calibration-jobs.service.test.ts | 111 +++++++++++++++++++--
.../calibration-jobs/calibration-jobs.service.ts | 4 +
packages/shared/src/schemas/index.ts | 10 ++
4 files changed, 118 insertions(+), 10 deletions(-)
Grep "assignedToMe"
42 lines of output
Bash
IN
cd j:/medcal && sed -n '120,210p' apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts

OUT
}
}

export interface CalibrationJobListResult {
data: CalibrationJobDetail[];
page: number;
pageSize: number;
total: number;
totalPages: number;
}

const DEFAULT_PAGE_SIZE = 20;

export interface IdentityCorrectionSubmitResult {
job: CalibrationJobDetail;
correction: IdentityCorrectionDetail;
/**

- True when the (new) device's deviceTypeId was checked against the job's
- resolved DeviceType. False only when the job's DeviceType could not be
- resolved — the correction still records the device, just unvalidated.
  */
  deviceTypeValidated: boolean;
  }

@Injectable()
export class CalibrationJobsService {
private readonly devices = new DevicesService();

/** Portal management list. Company-scoped; filters mirror the WorkOrder list. */
async findAll(
companyId: string,
query: CalibrationJobListQuery,
userId: string,
): Promise<CalibrationJobListResult> {
const page = query.page ?? 1;
const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.CalibrationJobWhereInput = {
      companyId,
      ...(query.workOrderId ? { workOrderId: query.workOrderId } : {}),
      ...(query.akdAklApprovalStatus ? { akdAklApprovalStatus: query.akdAklApprovalStatus } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedToMe
        ? { workOrder: { assignments: { some: { technicianUserId: userId } } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { customerDeclaredDeviceName: { contains: query.search, mode: "insensitive" } },
              { technicianObservedSerial: { contains: query.search, mode: "insensitive" } },
              { workOrder: { number: { contains: query.search, mode: "insensitive" } } },
              { device: { serialNumber: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      CALIBRATION_JOB_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.calibrationJob.count({ where }),
      prisma.calibrationJob.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: calibrationJobInclude,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };

}

async findOne(companyId: string, id: string): Promise<CalibrationJobDetail> {
const job = await prisma.calibrationJob.findFirst({
where: { id, companyId },
include: calibrationJobInclude,
});
if (!job) {
throw new NotFoundException({
message: "Calibration job not found",
code: "CALIBRATION_JOB_NOT_FOUND",
});
}
return job;
}
Grep "CalibrationJobListResponse|CalibrationJobRow|badge|Badge" (in apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx)
21 lines of output
Read j:\medcal\apps\portal\src\app\management\calibration-jobs\calibration-jobs-ui.tsx (lines 45-234)
Bash
IN
cd j:/medcal && sed -n '78,100p' packages/auth/src/me-types.ts && echo "---useAuthz---" && grep -n "useAuthz\|capabilities\|useMe\b" packages/auth/src/client.ts

OUT
purchaseOrderApprove: boolean;
workOrderRead: boolean;
workOrderCreate: boolean;
workOrderUpdate: boolean;
workOrderCancel: boolean;
workOrderAssign: boolean;
calibrationJobRead: boolean;
calibrationJobEscalateIdentity: boolean;
calibrationJobApproveIdentity: boolean;
/**

- @deprecated The match-only assign-device action is removed; this flag now
- always resolves false. Kept so the Portal build compiles until its UI is
- migrated to the Identity Correction workflow. Use
- calibrationJobSubmitIdentityCorrection instead.
  _/
  calibrationJobAssignDevice: boolean;
  calibrationJobSubmitIdentityCorrection: boolean;
  calibrationJobDecideIdentityCorrection: boolean;
  taxManage: boolean;
  priceListItemRead: boolean;
  priceListItemCreate: boolean;
  priceListItemUpdate: boolean;
  priceListItemDelete: boolean;
  ---useAuthz---
  11: useAuthz,
  12: useMe,
  Bash
  IN
  cd j:/medcal && grep -rn "useAuthz\|capabilities" packages/auth/src/_.tsx packages/auth/src/*.ts | grep -i "capab\|export function useAuthz" | head; echo ---; grep -n "capabilities" apps/portal/src/app/management/calibration-jobs/\[id\]/page.tsx | head

OUT
packages/auth/src/auth-provider.test.tsx:26: capabilities: {
packages/auth/src/auth-provider.test.tsx:97: capabilities: {
packages/auth/src/auth-provider.tsx:29: capabilities: MeCapabilities | null;
packages/auth/src/auth-provider.tsx:122: const capabilities: MeCapabilities | null =
packages/auth/src/auth-provider.tsx:123: hasSession && meQuery.data ? meQuery.data.capabilities : null;
packages/auth/src/auth-provider.tsx:126: if (!user || !membership || !capabilities) return null;
packages/auth/src/auth-provider.tsx:127: return { user, membership, capabilities };
packages/auth/src/auth-provider.tsx:128: }, [user, membership, capabilities]);
packages/auth/src/auth-provider.tsx:138: capabilities,
packages/auth/src/auth-provider.tsx:143: [bootstrapStatus, user, membership, capabilities, me, isAuthenticated, isAuthLoading],
---

70: const { capabilities } = useAuthz();
223: canEscalateIdentity(job) && Boolean(capabilities?.calibrationJobEscalateIdentity);
224: const showDecide = canDecideIdentity(job) && Boolean(capabilities?.calibrationJobApproveIdentity);
227: Boolean(capabilities?.calibrationJobSubmitIdentityCorrection);
228: const canDecideCorrection = Boolean(capabilities?.calibrationJobDecideIdentityCorrection);
Read j:\medcal\apps\tech-pwa\next.config.js
Read j:\medcal\apps\tech-pwa\src\app\sign-in\page.tsx
Saya sudah menyelidiki apps/tech-pwa (F6 shell: Next 16.2.12 / React 19, App Router, Tailwind kosong, React Query + @medcal/auth sudah terpasang, satu SW FCM yang hanya diregistrasi saat push di-enable, manifest.webmanifest dengan "icons": []), Portal sebagai referensi pola (badge, formatCalibrationJobApiError, isIdentityGateLocked/canEscalateIdentity), endpoint GET /calibration-jobs?assignedToMe=true (live, envelope {data,page,pageSize,total,totalPages}), dan aset apps/tech-pwa/public/short-logo.png (239×300, portrait, RGBA — tidak langsung pakai sebagai ikon persegi).

Berikut proposal Stage 1 lengkap. Belum ada kode yang ditulis.

STAGE 1 — PROPOSAL DESAIN
Prinsip mobile-first (diterapkan di setiap keputusan di bawah)
Setiap komponen ditulis dengan utility tanpa prefix = mobile (360–430px). sm:/md: hanya untuk melebarkan (cap lebar kolom, tambah padding) — tidak pernah untuk membalik default. Kolom tunggal di semua layar. Tap target ≥ 44×44px. Tidak ada interaksi berbasis hover. env(safe-area-inset-*) di header & footer sticky. Input font-size: 16px (cegah auto-zoom iOS).

PART A — Foundation
A1. viewport export (layout.tsx:12-16)
Ganti persis menjadi:

export const viewport: Viewport = {
width: "device-width",
initialScale: 1,
maximumScale: 5, // pinch-zoom diizinkan (aksesibilitas) — userScalable TIDAK di-false-kan
viewportFit: "cover", // safe-area / notch untuk display: standalone di iOS
themeColor: "#0f766e",
};
A2. Perbaikan manifest + ikon
Aset sumber: apps/tech-pwa/public/short-logo.png ada, tapi 239×300 (portrait) — tidak cocok langsung untuk ikon persegi/maskable. Rencana: generate ikon persegi dengan mem-composite logo di atas kanvas persegi ber-padding.

Cara generate (Stage 2): tambah sharp sebagai devDependency + script sekali-jalan apps/tech-pwa/scripts/generate-icons.mjs, output di-commit ke public/icons/. Script di-commit supaya reproducible saat logo final datang. (Alternatif bila tak ingin nambah dep: generate ad-hoc di scratchpad, commit PNG-nya saja tanpa script — saya rekomendasikan tetap pakai script.)

Output yang di-commit:

public/icons/icon-192.png, icon-512.png — purpose: "any", background putih, logo ~70% tinggi, center
public/icons/icon-192-maskable.png, icon-512-maskable.png — purpose: "maskable", logo ~50% (safe-zone 20%), background solid (putih atau teal #0f766e — final ditentukan di Stage 2 setelah cek warna logo; pilih yang kontras)
public/icons/apple-touch-icon.png — 180×180, background putih (iOS tidak menghormati transparansi)
manifest.webmanifest baru:

{
"name": "medcal Tech",
"short_name": "medcal",
"start_url": "/",
"scope": "/",
"display": "standalone",
"orientation": "portrait",
"background_color": "#f1f5f9",
"theme_color": "#0f766e",
"icons": [
{ "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
{ "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
{ "src": "/icons/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
{ "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
}
layout.tsx metadata: tambah icons: { apple: "/icons/apple-touch-icon.png" }, hapus komentar TODO.

A3. Service worker app-shell minimal (decision 4d)
Konteks penting: hanya boleh ada satu SW per scope. SW FCM sekarang diregistrasi di scope / — jadi tidak bisa menambah SW kedua di /.

Rekomendasi — Opsi A (dipilih): perluas route dinamis firebase-messaging-sw.js yang sudah ada (route.ts) supaya satu SW menangani FCM + app-shell:

install: precache /offline.html + /icons/icon-192.png + /short-logo.png (URL stabil, bukan chunk ber-hash) lalu skipWaiting()
activate: clients.claim() + bersihkan cache versi lama
fetch: hanya untuk request.mode === "navigate" → network-first, catch → caches.match("/offline.html"). Tidak ada caching data/RSC/JS aplikasi → nol risiko menyajikan bundel usang.
onBackgroundMessage FCM tetap seperti sekarang.
public/offline.html — file statis mandiri, CSS inline (dijamin render tanpa jaringan): logo, judul "Anda sedang offline", teks "Sambungkan kembali ke internet untuk memuat job Anda.", tombol "Coba lagi" (location.reload()). Mobile-first: single column, max-width: 24rem, center, tap target 44px.

Registrasi: komponen client <SwRegister/> di-mount di providers.tsx — registrasi SW selalu saat app start (navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" })). Alur usePushNotifications().enable() di messaging.ts disederhanakan: SW sudah teregistrasi, enable() tinggal minta permission + getToken. (Perubahan ini murni di dalam apps/tech-pwa.)

Alasan tidak pakai next-pwa/Workbox: next-pwa belum stabil untuk Next 16 App Router; kebutuhan di sini (app "terbuka" offline + pesan ramah) terpenuhi dengan ~40 baris handler tanpa dependency dan tanpa risiko cache-staleness.

Opsi B (tidak dipilih): public/sw.js terpisah di /, pindahkan SW FCM ke scope bersarang. Lebih banyak file & juggling scope tanpa manfaat tambahan.

A4. Token Tailwind (tailwind.config.js)

theme: {
extend: {
colors: {
brand: { // skala teal Tailwind; 700 = #0f766e (theme color eksisting)
50:"#f0fdfa",100:"#ccfbf1",200:"#99f6e4",300:"#5eead4",400:"#2dd4bf",
500:"#14b8a6",600:"#0d9488",700:"#0f766e",800:"#115e59",900:"#134e4a",
},
},
spacing: {
"safe-t": "env(safe-area-inset-top)",
"safe-b": "env(safe-area-inset-bottom)",
},
},
}
min-h-11 / min-w-11 (2.75rem = 44px) sudah ada di core Tailwind 3.4 — cukup dijadikan konvensi wajib untuk semua elemen interaktif, tak perlu ditambah.
globals.css @layer base (menggantikan file 3-baris sekarang):

@layer base {
input, select, textarea { font-size: 16px; } /* cegah zoom-on-focus iOS */
html { -webkit-tap-highlight-color: transparent; }
:root { color-scheme: light; }
}
App di-scope light only (aplikasi lapangan, siang hari) — tidak ada blok dark. Dinyatakan eksplisit.
A5. Navigation shell + struktur components/
Pola: pure push-stack (decision 6). Header sticky ramping, tanpa bottom tab bar.

AppHeader — sticky top-0 z-20 flex min-h-11 items-center gap-1 border-b border-slate-200 bg-white px-2 pt-safe-t:

Kiri: tombol back 44×44 (chevron) → router.back(), disembunyikan di root /jobs
Tengah: judul layar (truncate text-base font-semibold)
Kanan: satu slot aksi opsional (mis. tombol refresh di list) 44×44
Struktur folder primitif:

src/components/
layout/
app-header.tsx header sticky (back / judul / slot kanan)
screen.tsx scaffold: <AppHeader/> + <main class="min-h-[100dvh] ..."> + footer sticky opsional
sticky-action-bar.tsx footer sticky, pb-safe-b, tombol primary full-width min-h-12
sw-register.tsx registrasi service worker (client)
ui/
button.tsx varian primary/secondary/ghost, min-h-11, state :active + :focus-visible (tanpa hover-only)
badge.tsx rebuild lokal (lihat B2)
spinner.tsx
state-views.tsx <LoadingState/> <ErrorState onRetry/> <EmptyState/>
section.tsx kartu section read-only (judul + isi) untuk job detail
feedback/
error-banner.tsx banner error inline untuk kegagalan mutation
Auth gate: app/jobs/layout.tsx memanggil useRequireSession() (pola dari page.tsx) → semua route di bawah /jobs mewarisi state loading/pending/forbidden. app/page.tsx diubah jadi redirect("/jobs").

PART B — Job List (/jobs)
B1. Query hook — src/app/jobs/use-jobs-query.ts

useQuery({
queryKey: ["jobs", "assigned"],
queryFn: () => apiFetch<TechJobListResponse>(
"/calibration-jobs?assignedToMe=true&pageSize=100&sortBy=createdAt&sortDir=desc"),
refetchOnWindowFocus: true, // override global — refresh saat kembali ke installed app
})
apiFetch dari @medcal/shared (base URL + credentials:"include" sudah ditangani, sama seperti Portal). Tipe TechJobListResponse / TechCalibrationJob dibangun lokal di src/lib/calibration/types.ts (trimmed, bukan impor dari Portal).

Pagination: tidak ada UI paging di v1. Jumlah job yang di-assign ke seorang teknisi kecil (beberapa unit per WO, beberapa WO aktif). Minta pageSize=100. Bila total > data.length, tampilkan catatan footer non-blok: "Menampilkan 100 dari N job — hubungi koordinator." Envelope API tetap dihormati, tapi teknisi men-scroll 100 kartu sudah kasus ekstrem. Revisit bila angka riil melampaui itu.

B2. Isi job card
Seluruh kartu = <Link href={/jobs/${id}}>, block active:bg-slate-50, tinggi ~96px (≥44):

Baris 1: Unit {unitOrdinal} dari {unitTotal} (text-xs text-slate-500) + workOrder.number (text-sm font-medium)
Baris 2: nama alat dinyatakan — helper lokal declaredDeviceName() (customerDeclaredDeviceName ?? calibrationRequestItem.customerDeviceName ?? "—"), text-base font-semibold truncate
Baris 3: JobStatusBadge + AkdAklStatusBadge (wrap, gap-2)
Chevron-kanan dekoratif
Badge (rebuild lokal di components/ui/badge.tsx) — <span> biasa, meniru peta warna Portal (calibration-jobs-ui.tsx:132-145), label Indonesia:

Job status: PENDING slate-500 · IN_PROGRESS amber-500 · SUBMITTED blue-600 · REWORK orange-500 · ACCEPTED_BY_QA emerald-600
AKD/AKL: NOT_REQUIRED slate-400 · PENDING_REVIEW amber-500 · APPROVED emerald-600 · REJECTED red-600
base: rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white
B3. State (wajib — decision 4b)
Loading: skeleton list — 4 placeholder kartu animate-pulse (bukan spinner telanjang)
Error: <ErrorState> — ikon, "Gagal memuat daftar job", pesan dari formatApiError lokal, tombol full-width "Coba lagi" → refetch()
Empty: <EmptyState> — "Belum ada job yang ditugaskan ke Anda." + sub "Job baru akan muncul setelah koordinator menugaskan Anda."
B4. Refresh
Tombol refresh manual di slot kanan header (44×44, ikon panah-melingkar, berputar saat isFetching). Bukan pull-to-refresh: implementasi PTR tanpa library rumit (touch handler, rubber-band, bentrok overscroll iOS Safari) dan decision 4 melarang dependency baru. Tombol lebih discoverable dan mudah dites. Dilengkapi refetchOnWindowFocus: true (B1) untuk refresh otomatis saat app di-foreground-kan.

PART C — Job Detail (/jobs/[id])
Data: useJobQuery(id) → GET /calibration-jobs/:id; useCorrectionsQuery(id) → GET /calibration-jobs/:id/identity-corrections. Keduanya punya state loading/error/retry eksplisit (skeleton section + <ErrorState>).

C1. Section read-only (kolom tunggal, tumpuk <Section>)
Header block — workOrder.number, "Unit X dari N", JobStatusBadge
Identitas dinyatakan (pelanggan) — nama alat dinyatakan, AKD/AKL dinyatakan (declaredAkdAkl())
Observasi teknisi — technicianObservedSerial (atau "—"), technicianObservedAkdAkl (atau "—")
Alat terpasang saat ini — bila device: device.code + device.serialNumber; bila null: "Alat belum diidentifikasi" (copy final diselaraskan dengan Portal di Stage 2)
Status persetujuan AKD/AKL — AkdAklStatusBadge + akdAklApprovedBy?.name + akdAklDecisionNote + tanggal, ditampilkan hanya saat APPROVED/REJECTED
Koreksi identitas (BA) — daftar dari useCorrectionsQuery: tiap baris = nomor BA + IdentityCorrectionStatusBadge + tanggal, tappable. Kosong → "Belum ada koreksi identitas."
Inline expand vs sub-route → rekomendasi: sub-route /jobs/[id]/corrections/[correctionId]. Alasan: di layar 360px kolom tunggal, accordion dengan baris old→new + 2 thumbnail tanda tangan + catatan keputusan membuat halaman sangat panjang dan mencampur level baca; layar ter-push menjaga satu-layar-satu-fokus dan konsisten dengan model push-stack. Layar correction detail read-only ini masuk scope task ini (scope lock hanya mengecualikan wizard submit).

Correction detail screen (/jobs/[id]/corrections/[correctionId]) — read-only: alasan, baris perubahan old→new (helper summarizeCorrectionChanges di-rebuild lokal), status tiap tanda tangan + nama penandatangan + thumbnail gambar (fetch blob GET /files/:id dengan credentials:"include", pola SignatureImage Portal, di-rebuild lokal), keputusan + catatan bila sudah diputuskan. State loading/error/retry.

C2. Action bar (<StickyActionBar>, pb-safe-b)
"Eskalasi AKD/AKL" — tampil bila capabilities?.calibrationJobEscalateIdentity dan canEscalateIdentity(job) (rebuild lokal di lib/calibration/identity-gate.ts: tidak locked oleh status SUBMITTED/ACCEPTED_BY_QA, dan akdAklApprovalStatus ∈ {NOT_REQUIRED, REJECTED}). Tap → /jobs/[id]/escalate. Bila punya capability tapi gate tertutup (PENDING_REVIEW/APPROVED): tombol disabled + helper "Eskalasi sedang ditinjau / sudah disetujui."
"Ajukan Koreksi Identitas" — rekomendasi: tetap dirender, disabled, dengan penjelasan. Menghilangkannya membuat layar tampak lengkap padahal aksi utama hilang, dan teknisi/penguji tak tahu fitur ini akan datang. Visibilitas di-gate pada capabilities?.calibrationJobSubmitIdentityCorrection (yang tanpa grant tak lihat tombol mati). State disabled: opacity-60, tanpa onClick. Copy helper di bawah tombol:
"Segera hadir. Untuk sementara, ajukan koreksi identitas melalui koordinator / Portal."

PART D — Escalate (/jobs/[id]/escalate)
<Screen> judul "Eskalasi AKD/AKL", back chevron. Form tunggal, bukan wizard.

Baris info: "Menandai identitas alat untuk ditinjau manajer teknis."
Field 1 — technicianObservedAkdAkl: text input, opsional, label "AKD/AKL hasil observasi (opsional)", maxLength 120, helper "Nomor izin edar yang Anda baca dari label alat.", text-base min-h-11
Field 2 — reason: textarea, opsional, label "Alasan (opsional)", maxLength 2000, ~4 baris
Footer sticky: tombol full-width "Kirim eskalasi" (min-h-12); saat pending → disabled + "Mengirim…"
Mutation (useEscalateIdentity() lokal) → POST /calibration-jobs/:id/escalate-identity, body { technicianObservedAkdAkl?, reason? } (string kosong → undefined).

Sukses: invalidate ["jobs"], ["job", id], ["job", id, "corrections"] → router.back() (detail refetch, muncul PENDING_REVIEW)
Error: <ErrorBanner> inline di atas form; pesan via formatApiError lokal. State form dipertahankan (decision 4a) — tombol submit yang sama berfungsi sebagai "coba lagi", state tidak di-clear
Guard: bila !capabilities?.calibrationJobEscalateIdentity atau gate tertutup → tampilkan "Aksi tidak tersedia" + tombol kembali, form tidak dirender
PART E — Shared concerns
E1. Pemetaan pesan error — src/lib/api-errors.ts
formatApiError(err, fallback) meniru formatCalibrationJobApiError (calibration-job-utils.ts:146), pakai ApiError dari @medcal/shared. Hanya kode yang terjangkau dari alur read + escalate:

Kode Pesan (ID)
CALIBRATION_JOB_NOT_FOUND "Calibration job tidak ditemukan."
CALIBRATION_JOB_IDENTITY_GATE_LOCKED "Job sudah melewati tahap verifikasi identitas — aksi ini tidak lagi tersedia."
CALIBRATION_JOB_DEVICE_TYPE_UNRESOLVED "Jenis alat untuk job ini belum dapat ditentukan."
INVALID_CALIBRATION_JOB_IDENTITY_ESCALATION "Data eskalasi identitas tidak valid."
INVALID_AKD_AKL_TRANSITION "Perubahan status persetujuan AKD/AKL tidak diizinkan."
(bukan ApiError / offline) "Anda sedang offline atau koneksi bermasalah. Coba lagi."
Helper isOffline() (typeof navigator !== "undefined" && !navigator.onLine) untuk memilih copy offline. Dikecualikan (task berikutnya): semua IDENTITY_CORRECTION__, FILE__, DEVICE_*.

E2. Layout file/folder apps/tech-pwa/

public/
offline.html (baru — statis, CSS inline)
icons/ icon-192.png icon-512.png icon-192-maskable.png icon-512-maskable.png apple-touch-icon.png (baru)
manifest.webmanifest (edit — icons[], scope, orientation)
scripts/
generate-icons.mjs (baru — sharp, sekali jalan)
src/
app/
layout.tsx (edit — viewport, metadata.icons)
globals.css (edit — @layer base)
page.tsx (edit — redirect "/" → "/jobs")
providers.tsx (edit — mount <SwRegister/>)
jobs/
layout.tsx (baru — useRequireSession gate)
page.tsx (baru — job list)
use-jobs-query.ts (baru)
jobs-ui.tsx (baru — JobCard + state list)
[id]/
page.tsx (baru — job detail)
use-job-query.ts (baru — job + corrections + escalate mutation)
job-detail-ui.tsx (baru — Section, baris, daftar koreksi)
escalate/page.tsx (baru — form escalate)
corrections/[correctionId]/page.tsx (baru — correction detail read-only)
components/
layout/ app-header.tsx screen.tsx sticky-action-bar.tsx sw-register.tsx
ui/ button.tsx badge.tsx spinner.tsx state-views.tsx section.tsx
feedback/ error-banner.tsx
lib/
api-errors.ts (baru)
calibration/
types.ts (baru — TechCalibrationJob dll, rebuild lokal)
job-display.ts (baru — declaredDeviceName, declaredAkdAkl, label ID)
identity-gate.ts (baru — isIdentityGateLocked, canEscalateIdentity)
tailwind.config.js (edit — brand scale, safe-area spacing)
src/lib/fcm/messaging.ts (edit — registrasi SW pindah ke selalu-on)
src/app/firebase-messaging-sw.js/route.ts (edit — tambah install + fetch handler app-shell)
Tidak ada komponen upload/tanda tangan dibangun di task ini (task berikutnya). Bila nanti dibangun: pakai <input type="file" accept="image/*" capture="environment"> + kompresi canvas, konsisten dengan decision 3.

Verifikasi mobile-first yang direncanakan (Stage 2)
Screenshot DevTools device-mode di 360px + 430px untuk tiap layar: (a) tak ada scroll horizontal di 360px, (b) tap target ≥44px diverifikasi via overlay/measure, (c) simulasi offline → offline.html muncul, (d) apps/tech-pwa typecheck, (e) git status daftar file berubah. Tidak menyentuh apps/portal / file API mana pun.

Semua Part A–E di atas adalah proposal — belum ada kode. Mohon review dan konfirmasi eksplisit, khususnya:

Service worker Opsi A (merge app-shell ke SW FCM yang ada + registrasi selalu-on) vs Opsi B (SW terpisah)
sharp sebagai devDependency untuk generate ikon (vs generate ad-hoc tanpa dep)
Tombol "Ajukan Koreksi Identitas" dirender-disabled dengan penjelasan (vs dihilangkan sampai task berikutnya)
Tanpa UI pagination di job list (pageSize=100)
Correction detail sebagai sub-route (vs inline expand)
Tombol refresh manual (vs pull-to-refresh)
Setujui untuk lanjut ke Stage 2 (implementasi), atau beri koreksi dulu.

j:\medcal\docs\claude\plans\technician-app\ui-tasks\Implement_TechPWA_Foundation_JobList_Detail_Staged.md
Approved untuk Stage 2 — setuju dengan keenam poin (SW Opsi A, sharp sebagai devDependency, tombol koreksi identitas disabled dengan penjelasan, tanpa UI pagination, correction detail sebagai sub-route, tombol refresh manual). Lanjut implementasi sesuai proposal lengkap Part A-E.
Bash
IN
cd j:/medcal && grep -n "export function apiFetch\|export class ApiError\|class ApiError\|ApiError extends" packages/shared/src/_.ts packages/shared/src/\**/_.ts 2>/dev/null; echo ---; grep -rn "apiFetch\|ApiError" packages/shared/src/index.ts

OUT
packages/shared/src/http/api-fetch.ts:9:export class ApiError extends AppError {
---

Grep "useRequireSession" (in packages/auth/src, glob: _.tsx)
78 lines of output
Read j:\medcal\packages\shared\src\http\api-fetch.ts
Bash
IN
cd j:/medcal && grep -n "apiFetch\|ApiError\|AuthBootstrapStatus\|type Me\b\|interface Me\b" packages/shared/src/index.ts packages/auth/src/_.ts | head -40; echo "---me type---"; sed -n '1,40p' packages/auth/src/me-types.ts

OUT
packages/auth/src/client.ts:28: AuthBootstrapStatus,
packages/auth/src/me-query.ts:1:import { apiFetch } from "@medcal/shared";
packages/auth/src/me-query.ts:13: return apiFetch<Me>("/me");
packages/auth/src/me-types.ts:114:export type Me = {
packages/auth/src/me-types.ts:120:export type AuthBootstrapStatus = "loading" | "ready" | "forbidden" | "pending";
---me type---
import type { MembershipRole } from "@medcal/shared";

/** Minimal capability signal from GET /me — not a general permission API. */
export type MeCapabilities = {
leadRead: boolean;
chatRead: boolean;
emailRead: boolean;
emailSend: boolean;
emailDelete: boolean;
emailManage: boolean;
customerRead: boolean;
customerCreate: boolean;
customerUpdate: boolean;
uomRead: boolean;
uomCreate: boolean;
uomUpdate: boolean;
deviceCategoryRead: boolean;
deviceCategoryCreate: boolean;
deviceCategoryUpdate: boolean;
deviceCategoryDelete: boolean;
deviceTypeRead: boolean;
deviceTypeCreate: boolean;
deviceTypeUpdate: boolean;
deviceTypeDelete: boolean;
deviceTypeAliasRead: boolean;
deviceTypeAliasCreate: boolean;
deviceTypeAliasUpdate: boolean;
deviceTypeAliasDelete: boolean;
deviceModelRead: boolean;
deviceModelCreate: boolean;
deviceModelUpdate: boolean;
deviceModelDelete: boolean;
deviceCapabilityRead: boolean;
deviceCapabilityCreate: boolean;
deviceCapabilityUpdate: boolean;
deviceCapabilityDelete: boolean;
deviceCapabilityItemRead: boolean;
deviceCapabilityItemCreate: boolean;
deviceCapabilityItemUpdate: boolean;
deviceCapabilityItemDelete: boolean;
Read j:\medcal\packages\auth\src\me-types.ts (lines 101-125)
Bash
IN
cd j:/medcal && grep -n "useAuthz\|useAuth\b\|export function" packages/auth/src/auth-provider.tsx | head -40

OUT
73:export function AuthProvider({ children, onNeedsSignIn }: AuthProviderProps) {
158:export function useAuth() {
164:export function useAuthz() {
170:export function useMe() {
179:export function useRequireSession(): { me: Me | null; status: AuthBootstrapStatus } {
Read j:\medcal\apps\tech-pwa\src\lib\fcm\messaging.ts
Read j:\medcal\apps\portal\src\app\management\calibration-jobs\use-identity-corrections-query.ts
Read j:\medcal\apps\portal\src\app\management\calibration-jobs\signature-image.tsx
Read j:\medcal\apps\tech-pwa\tsconfig.json
Read j:\medcal\apps\tech-pwa\src\components\sign-out-button.tsx
Now implementing. Starting with foundation.

Write j:\medcal\apps\tech-pwa\tailwind.config.js
31 lines
/** @type {import('tailwindcss').Config} _/
module.exports = {
content: ["./src/\**/_.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
theme: {
extend: {
colors: {
// Teal scale around the existing #0f766e theme color (700). Mobile-first
// brand palette — no Portal token sharing (Portal's tokens are shell-oriented).
brand: {
50: "#f0fdfa",
100: "#ccfbf1",
200: "#99f6e4",
300: "#5eead4",
400: "#2dd4bf",
500: "#14b8a6",
600: "#0d9488",
700: "#0f766e",
800: "#115e59",
900: "#134e4a",
},
},
spacing: {
// Notch / home-indicator insets for sticky header & footer.
"safe-t": "env(safe-area-inset-top)",
"safe-b": "env(safe-area-inset-bottom)",
},
},
},
plugins: [],
};
Write j:\medcal\apps\tech-pwa\src\app\globals.css
21 lines
@tailwind base;
@tailwind components;
@tailwind utilities;
