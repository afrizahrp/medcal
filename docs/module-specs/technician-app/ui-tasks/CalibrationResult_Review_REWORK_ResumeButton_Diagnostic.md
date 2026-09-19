# Diagnostic — Tech-PWA REWORK Resume Button Missing

**Date:** 2026-09-10  
**Mode:** AUDIT / DIAGNOSTIC ONLY — tidak ada perubahan kode  
**Gejala runtime:** Job REWORK / "Perbaikan", catatan keputusan terlihat, pengukuran terkunci, tombol **"Lanjutkan perbaikan"** tidak muncul  
**Implementasi UI:** [CalibrationResult_Review_REWORK_UI_Implementation-report.md](./CalibrationResult_Review_REWORK_UI_Implementation-report.md)

---

## 1. ROOT CAUSE

**CASE A (dengan keyakinan tinggi dari source + gejala runtime):**

```
job.status === "REWORK"          → TRUE  (bukti: badge "Perbaikan" + "Catatan keputusan")
calibrationJobResumeAfterRework  → FALSE (atau undefined → Boolean(...) = false)
→ canShowResumeAfterRework(...)  → false
→ showResume === false
→ ResumeAfterReworkAction tidak di-render
```

Jalur render UI **sudah benar dan lengkap**. Tidak ada bug StickyActionBar, tidak ada `else if` yang melewatkan Resume, tidak ada syarat tambahan di helper status (startedAt / attempt / QualityReview).

Tombol disembunyikan **dengan sengaja** oleh permission gate:

```104:107:apps/tech-pwa/src/app/jobs/[id]/page.tsx
  const showResume = canShowResumeAfterRework(
    job,
    Boolean(capabilities?.calibrationJobResumeAfterRework),
  );
```

Nilai runtime `capabilities.calibrationJobResumeAfterRework` **belum dibaca dari browser** di sesi audit ini. Bukti sekunder dari UI (status REWORK) membuat capability falsy sebagai satu-satunya penjelasan yang konsisten dengan source.

**Penyebab paling mungkin di bawah capability=false:**

Baris `RolePermission` `(TECHNICIAN, calibrationJob, resumeAfterRework)` **belum ada** di database runtime yang dipakai Tech-PWA (seed file + backfill script sudah ada di kode; DB existing perlu backfill / grant via Permission Management).

`/me` memakai `hasPermission()` yang **hanya** membaca cache dari tabel `RolePermission`, bukan dari seed file.

---

## 2. RENDER PATH

```
GET /calibration-jobs/:id
  → job.status
       │
GET /me → capabilities.calibrationJobResumeAfterRework
       │
useAuthz().capabilities
       │
page.tsx:
  showResume = canShowResumeAfterRework(
                 job,
                 Boolean(capabilities?.calibrationJobResumeAfterRework)
               )
       │
       ├─ false → ResumeAfterReworkAction TIDAK dirender
       │
       └─ true  → StickyActionBar children
                    → ResumeAfterReworkAction
                         → Button "Lanjutkan perbaikan"
                              → useResumeAfterRework → POST .../resume
```

Definisi komponen: `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` → `ResumeAfterReworkAction`  
Import + gate visibility: `apps/tech-pwa/src/app/jobs/[id]/page.tsx`  
Hook API: `apps/tech-pwa/src/app/jobs/[id]/use-job-query.ts` → `useResumeAfterRework`

`ResumeAfterReworkAction` **tidak** punya gate sendiri — hanya menerima `onResume` / `pending` / `error`. Visibility 100% di `page.tsx`.

---

## 3. ACTUAL CONDITIONS

Syarat **semua** harus true agar tombol muncul:

| # | Kondisi | Sumber |
|---|---|---|
| 1 | `jobQuery` sukses (bukan pending/error) | `page.tsx` early return |
| 2 | `job.status === "REWORK"` | `canResumeAfterRework(job)` |
| 3 | `Boolean(capabilities?.calibrationJobResumeAfterRework) === true` | `canShowResumeAfterRework` arg 2 |
| 4 | Footer `OR` truthy (termasuk `showResume`) | `footer={ showStart \|\| showResume \|\| … }` |

**Tidak** dicek untuk Resume:

- `startedAt` / `submittedAt`
- `currentAttempt`
- `latestQualityReview` / notes
- baris MeasurementResult
- `isJobDone`
- mutation pending (hanya disable button, bukan hide)
- feature flag lain
- CSS `hidden` / `display:none` pada StickyActionBar

Helper:

```42:53:apps/tech-pwa/src/lib/calibration/quality-review.ts
export function canResumeAfterRework(job: { status: CalibrationJobStatus }): boolean {
  return job.status === "REWORK";
}

export function canShowResumeAfterRework(
  job: { status: CalibrationJobStatus },
  hasResumeCapability: boolean,
): boolean {
  return hasResumeCapability && canResumeAfterRework(job);
}
```

Kondisi efektif di page:

```
capabilities?.calibrationJobResumeAfterRework  (truthy)
AND
job.status === "REWORK"
```

---

## 4. RUNTIME VALUES

| Nilai | Status audit | Bukti / cara verifikasi |
|---|---|---|
| `job.status` | **Diinfer `"REWORK"`** | Badge memakai `CALIBRATION_JOB_STATUS_LABELS[status]`; label `"Perbaikan"` hanya untuk `REWORK`. `"Catatan keputusan"` hanya jika `shouldShowRejectionFeedback` → `(REWORK \| IN_PROGRESS) && latest REJECTED`. Kombinasi badge Perbaikan + notes → **REWORK**. |
| `calibrationJobResumeAfterRework` | **Tidak diobservasi langsung** | Harus dicek di Network → `GET /me` → `capabilities.calibrationJobResumeAfterRework` |
| `canResumeAfterRework(job)` | Diinfer **true** | status REWORK |
| `canShowResumeAfterRework(...)` | Diinfer **false** | tombol tidak muncul |
| StickyActionBar | Bukan blocker | Hanya layout sticky; tidak filter children |

### Cara verifikasi `/me` (wajib sebelum fix)

1. Login sebagai teknisi yang melihat job REWORK.
2. DevTools → Network → request `.../me` (atau path session me yang dipakai AuthProvider).
3. Baca JSON:

```json
"capabilities": {
  "calibrationJobResumeAfterRework": <true|false>
}
```

4. Opsional DB:

```sql
SELECT * FROM "RolePermission"
WHERE role = 'TECHNICIAN'
  AND resource = 'calibrationJob'
  AND action = 'resumeAfterRework';
```

- 0 rows → capability false → CASE A confirmed.
- 1 row + `/me` masih false → cache / API process belum memuat grant (jarang; refresh periodik 60s di `main.ts`).

---

## 5. EXACT BLOCKER

**File:** `apps/tech-pwa/src/app/jobs/[id]/page.tsx`  
**Expression:** `Boolean(capabilities?.calibrationJobResumeAfterRework)` dievaluasi **false**

Akibat: `showResume === false` → cabang `{showResume ? <ResumeAfterReworkAction …/> : null}` merender `null`.

Bukan karena:

- [ ] job.status mapping salah (badge + notes membuktikan REWORK)
- [ ] `canResumeAfterRework` salah (hanya cek `REWORK`)
- [ ] StickyActionBar menyembunyikan action
- [ ] CSS/layout
- [ ] `else if` yang skip Resume (semua action pakai flag independen `? : null`)
- [ ] Hook Resume hilang (ada: `useResumeAfterRework`)

### Trace capability (backend → UI)

| Step | Ada di kode? | Catatan |
|---|---|---|
| Catalog `resumeAfterRework` | Ya | `packages/auth/src/access-control.ts` |
| Seed TECHNICIAN | Ya | `seed-role-permissions.ts` |
| Backfill script | Ya | `backfill-rework-resume-permissions.ts` + `pnpm ... backfill:rework-resume-permissions` |
| `/me` field | Ya | `me.controller.ts` → `calibrationJobResumeAfterRework: hasPermission(..., "resumeAfterRework")` |
| `MeCapabilities` type | Ya | `packages/auth/src/me-types.ts` |
| `useAuthz().capabilities` | Ya | pass-through dari `meQuery.data.capabilities` |
| Property yang dibaca UI | `capabilities?.calibrationJobResumeAfterRework` | nama exact |
| Grant di **DB runtime** teknisi | **Tidak diverifikasi** | kandidat root cause |

`hasPermission` = SUPERADMIN bypass **atau** `cache.get(role).has("calibrationJob:resumeAfterRework")`. Cache diisi dari DB saat boot (+ tiap 60s / setelah Permission Management write).

Teknisi bisa **Kirim** (`submitForReview` sudah lama di seed) tanpa otomatis punya `resumeAfterRework` (grant baru 2026-09-10). Gejala “Kirim OK, Resume hilang” cocok dengan DB yang belum di-backfill.

---

## 6. EXPECTED FIX LOCATION

**Bukan** perubahan UI / helper / StickyActionBar.

Lokasi perbaikan yang diharapkan (opsional, **jangan diimplementasi di task ini**):

1. **Data / ops (primary):** pastikan grant ada di DB runtime  
   - Jalankan `pnpm --filter @medcal/db run backfill:rework-resume-permissions` terhadap DB yang dipakai API, **atau**  
   - Portal Permission Management → role TECHNICIAN → centang `calibrationJob` / `resumeAfterRework` → save (itu juga `refreshRolePermissionCache`).
2. Setelah grant: hard-refresh Tech-PWA (atau tunggu refetch `/me`) agar `capabilities` baru.
3. Hanya jika `/me` sudah `true` tetapi tombol tetap hilang → baru investigasi ulang `page.tsx` (skenario ini **tidak** didukung bukti saat ini).

Tidak ada file komponen yang “rusak” yang harus diubah untuk gejala sekarang.

---

## 7. SCOPE IMPACT

Jika perbaikan = menambah grant `resumeAfterRework` (data), tanpa ubah kode UI:

| Area | Terpengaruh? |
|---|---|
| Happy path Kirim | **NO** |
| Happy path Setujui (Portal) | **NO** |
| Selesai | **NO** |
| Measurement locking / Option A | **NO** |
| QualityReview semantics | **NO** |
| Identity Correction | **NO** |
| StickyActionBar / layout | **NO** |

UI sudah menunggu capability; grant hanya membuka gate yang sudah di-wire.

---

## 8. RECOMMENDED MINIMAL FIX

**(Deskripsi saja — tidak diimplementasi.)**

1. Verifikasi `GET /me` → `capabilities.calibrationJobResumeAfterRework`.
2. Jika `false`: pastikan baris RolePermission TECHNICIAN + `resumeAfterRework` (backfill atau Permission Management).
3. Pastikan proses API memuat cache (restart API atau tunggu ≤60s / save Permission Management).
4. Reload Tech-PWA; pada job `REWORK`, pastikan **Lanjutkan perbaikan** muncul.
5. Jangan ubah copy, helper, atau Happy path.

---

## SUCCESS CRITERIA — checklist penyebab

| Kandidat | Bertanggung jawab? |
|---|---|
| [x] Permission/capability | **YA — primary** (`calibrationJobResumeAfterRework` falsy di UI) |
| [x] /me data | **YA — sumber nilai capability** (perlu konfirmasi Network) |
| [ ] useAuthz mapping | Tidak — pass-through; nama property cocok |
| [ ] job.status mapping | Tidak — REWORK dibuktikan badge + notes |
| [ ] canResumeAfterRework | Tidak — hanya `status === "REWORK"` |
| [ ] canShowResumeAfterRework | Benar secara desain; mengembalikan false karena capability |
| [ ] page.tsx render condition | Gate benar; bukan bug logic |
| [ ] job-detail-ui.tsx | Tidak — komponen presentasional |
| [ ] StickyActionBar | Tidak — tidak filter children |
| [ ] CSS/layout/visibility | Tidak |
| [x] Other | **RolePermission runtime / backfill belum diterapkan** pada DB yang dipakai — paling mungkin di balik capability=false |

---

## CATATAN AUDIT

- Tidak ada perubahan kode, seed, backend, endpoint Resume, atau copy.
- Root cause dari source + gejala: **permission gate**. Konfirmasi final = satu nilai boolean di response `/me`.
- Jika `/me` ternyata `true` pada teknisi yang sama, laporkan sebagai **CASE B** dan buka ulang investigasi (itu akan bertentangan dengan analisis source saat ini).
