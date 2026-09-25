# Audit — Existing File Upload Flow untuk Certificate Document

**Status:** AUDIT ONLY. Tidak ada source code, schema, migration, atau data yang diubah.
`git status` dikonfirmasi bersih dari perubahan baru sebelum dan sesudah audit ini (hanya
perubahan Phase 1–3 sebelumnya yang tetap ada).

**Perubahan konteks bisnis dari audit sebelumnya (Phase 3A):** Phase 3A mengasumsikan Medcal
menerbitkan certificate secara internal (issuance engine). Task ini mengoreksi asumsi
tersebut — **certificate dibuat di luar Medcal**; `Certificate.number` adalah **input manual**
dari dokumen fisik; fungsi Medcal hanyalah **menyimpan dan menampilkan foto/scan** certificate
yang di-upload staff. Ini adalah masalah *file attachment*, bukan *document issuance*.

## Ringkasan temuan utama

Medcal sudah punya infrastruktur generic file-upload yang lengkap, teruji, dan langsung
dapat dipakai (`FilesModule`), **dan** sudah punya pola implementasi yang secara konsep
hampir identik dengan kebutuhan ini: `EquipmentCalibrationRecord`'s "upload sertifikat PDF"
flow. Lebih jauh, tiga potongan infrastruktur untuk fitur Certificate **sudah disediakan
tapi belum dipakai sama sekali**:

- `FileOwnerType.CERTIFICATE` — nilai enum sudah ada di schema, nol consumer.
- `certificate: ["read", "create", "update", "issue"]` — permission resource sudah ada di
  RBAC catalog (`packages/auth/src/access-control.ts:188`), **nol grant** ke role manapun
  (bandingkan dengan `equipmentCalibrationRecord` yang punya grant nyata).
- `DocumentType.CERTIFICATE` — sudah ada di `DocumentNumberService`'s type table (untuk
  *sequential number allocation*) — **tapi sesuai keputusan bisnis di task ini, TIDAK
  boleh dipakai** untuk `Certificate.number`, karena nomor tersebut manual, bukan hasil
  alokasi sistem. Dicatat di sini murni sebagai gap-check, bukan rekomendasi pemakaian.

Tidak ada gap arsitektural yang menghalangi implementasi. Verdict di §11.

---

## 1. Existing File Upload Architecture

Generic, reusable, sudah lengkap — `apps/api/src/modules/files/`:

- **`files.controller.ts`** — `@Controller("files")`, `@UseGuards(CompanyRoleGuard)`.
  - `POST /files` (multipart, field `file` + `ownerType` + `ownerId`) — upload.
  - `GET /files/:id` — download, mengembalikan `StreamableFile`.
  - `DELETE /files/:id` — hapus.
  - Tidak ada `@RequirePermission` statis di controller — otorisasi dinamis per `ownerType`
    lewat mekanisme di bawah, bukan grant `file:*` yang terpisah.
- **`files.service.ts`** — `upload()`/`getForDownload()`/`delete()`/`verifyIntegrity()`.
  Alur `upload()`: resolve `FileOwnerPolicy` dari registry → `validateUpload()` (MIME +
  extension + ukuran + content-sniff) → `policy.resolveOwner()` (record pemilik ada?
  terkunci?) → cek permission (`hasPermission(role, policy.permissionResource, writeAction)`)
  → tulis file sementara → commit ke storage (key final) → insert `FileObject` row. Ada
  kompensasi: jika insert DB gagal setelah file tertulis, file dihapus lagi; jika file
  gagal ditulis, tidak ada row yang dibuat. Checksum SHA-256 dihitung otomatis.
- **`owner-policy.ts`** — `FileOwnerPolicyRegistry`, pola *plugin*: setiap modul bisnis yang
  ingin attach file mendaftarkan **satu** `FileOwnerPolicy` untuk `FileOwnerType`-nya sendiri
  lewat constructor modulnya (lihat `equipment-calibration-records.module.ts:35` dan
  `calibration-jobs.module.ts:40` sebagai dua contoh nyata yang sudah jalan). Registry
  dimulai KOSONG di `files.module.ts` — modul konsumen yang mengisi.
- **`file-validation.ts`** — validasi generik: ukuran, extension, declared MIME, plus
  *content-sniffing* byte-level (saat ini hanya ada sniffer untuk `application/pdf`, cek
  magic bytes `%PDF-`). Kalau kebijakan Certificate mengizinkan image (jpg/png), belum ada
  sniffer untuk itu — bukan blocker, tinggal ditambah saat implementasi kalau memang
  dibutuhkan.
- **UI reusable end-to-end** — `apps/portal/src/app/management/equipment-units/
  use-equipment-calibration-records-query.ts`'s `useUploadCalibrationCertificate()`: raw
  `fetch` (bukan `apiFetch`, karena body `multipart/form-data`) ke
  `${NEXT_PUBLIC_API_URL}/files` dengan `FormData` berisi `ownerType`, `ownerId`, `file`,
  `credentials: "include"`. Download lewat `apiFetchBlob("/files/:id")`. Ini pola siap
  pakai, tinggal ganti `ownerType`/`ownerId`.

## 2. `FILES_ROOT` Storage Flow

- **`files.module.ts`**: `resolveFilesRoot()` — *fail-closed*, API tidak akan start kalau
  `FILES_ROOT` tidak diset. Di-resolve jadi absolute path, dipakai untuk instansiasi
  `LocalDiskDriver` (satu-satunya `StorageDriver` implementation saat ini, lewat
  `STORAGE_DRIVER` injection token — sudah didesain agar bisa diganti driver lain, mis.
  S3/MinIO, tanpa mengubah `FilesService`).
- **`storage/local-disk.driver.ts`** + **`storage/storage-key.ts`**: file disimpan dengan
  storage key terstruktur — `buildStorageKey({ companyId, ownerType, ownerId, fileId,
  extension })` — jadi path fisik di disk sudah ter-partisi per company/ownerType/owner,
  tidak flat.
- Pola tulis: temp file → `storage.put(key, tempPath)` (commit, gagal kalau key final sudah
  ada — `StorageKeyConflictError`) → baru insert row `FileObject`. Urutan ini memastikan
  tidak pernah ada row DB yang menunjuk ke file yang tidak ada.

## 3. File/Document Data Model

**`model FileObject`** (`packages/db/prisma/schema.prisma:3176`) — model generic, sudah
lengkap untuk kebutuhan ini:

```prisma
model FileObject {
  id               String        @id @default(cuid())
  companyId        String
  customerId       String?       // <- sudah ada, nullable, langsung ke Customer
  ownerType        FileOwnerType
  ownerId          String
  storageKey       String
  mimeType         String?
  sizeBytes        Int?
  originalName     String?
  checksum         String?
  uploadedByUserId String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  // relations: company, customer, uploadedByUser, jobEvidences, signatures,
  // certificatePdfs Certificate[] @relation("CertificatePdf"), measurementAttachments
}
```

**`enum FileOwnerType`** (`schema.prisma:365`) sudah berisi `CERTIFICATE` sebagai salah satu
nilai (baris 366), di antara `JOB_EVIDENCE`, `SIGNATURE`, `EQUIPMENT_CALIBRATION`, dll —
**dicadangkan sejak schema ini pertama dibuat, belum pernah dipakai kode apapun** (dikonfirmasi
lewat grep: nol occurrence dari string `"CERTIFICATE"` sebagai `ownerType` di `apps/api/src`).

**Kesimpulan §3:** ya, ada model file generic yang sudah bisa menyimpan image/PDF apapun
(tergantung `FileTypePolicy` yang didaftarkan per owner type); ya, sudah ada pola attachment
yang reusable (`FileOwnerPolicy` registry); ya, `FileObject` bahkan sudah punya field
`customerId` langsung — cocok kalau Certificate photo/scan ingin discoverable/filterable
per Customer tanpa join ke `Certificate` dulu (opsional, tidak wajib dipakai).

## 4. Existing Upload Flow yang Paling Relevan

**`EquipmentCalibrationRecord`'s "upload sertifikat PDF" flow** adalah kandidat terdekat,
dan sangat dekat secara struktur — tapi ini domain bisnis yang **berbeda** (traceability
peralatan referensi milik Medcal sendiri, bukan certificate pelanggan):

- Backend: `equipmentCalibrationFileOwnerPolicy` (`equipment-calibration-file-owner-policy.ts`)
  — `ownerType: "EQUIPMENT_CALIBRATION"`, `permissionResource: "equipmentCalibrationRecord"`,
  `fileTypePolicy: { mimeTypes: ["application/pdf"], extensions: [".pdf"], maxBytes: 10MB }`,
  `resolveOwner()` query `EquipmentCalibrationRecord` by id+companyId, `locked` saat
  `status === "CONFIRMED"` (evidence jadi immutable setelah confirm).
- Frontend: `EvidenceSection` component (`equipment-calibration-records-panel.tsx:243-329`)
  — file picker (`<input type="file" accept="application/pdf">`), list dokumen ter-attach
  dengan tombol download/hapus, disabled kalau record sudah `CONFIRMED`. `certificateNumber`
  di form ini juga **manual text input** (`<Input value={value.certificateNumber} ... />`) —
  pola input-manual-nomor-sertifikat yang sama persis dengan kebutuhan bisnis Certificate.

**Apakah bisa di-reuse langsung, atau hanya referensi pola?** **Hanya referensi pola** —
tidak bisa dipakai langsung karena `ownerType: "EQUIPMENT_CALIBRATION"` terikat ke domain
peralatan referensi Medcal sendiri (`resolveOwner()`-nya query `EquipmentCalibrationRecord`,
bukan `Certificate`). Certificate perlu `FileOwnerPolicy` sendiri dengan `ownerType:
"CERTIFICATE"` dan `resolveOwner()` yang query `Certificate`. Tapi **seluruh mekanisme di
sekitarnya** — `FilesController`/`FilesService`/`file-validation.ts`/`storage`/UI upload
component/download pattern — 100% reusable tanpa perubahan.

## 5. `Certificate` Model vs Kebutuhan Bisnis

**Field yang sudah tersedia** (`schema.prisma:2969-3012`, dikonfirmasi ulang di audit ini):

| Field | Relevansi terhadap kebutuhan baru |
|---|---|
| `number` | Field yang tepat untuk input manual nomor fisik. Sudah `String` biasa, tidak ada mekanisme alokasi terpasang di modelnya sendiri — aman untuk dipakai sebagai input manual apa adanya. |
| `customerId` → `customer Customer` | Relasi langsung dan otoritatif ke Customer (dikonfirmasi di Phase 3A juga) — dipakai nanti untuk otorisasi Customer Portal. |
| `deviceId` → `device Device`, `calibrationJobId` (unique) → `calibrationJob CalibrationJob` | Sudah ada, relevan untuk metadata tampilan (alat mana, job kalibrasi mana), tidak wajib diisi kalau flow baru tidak selalu berasal dari CalibrationJob (lihat catatan di §7 — kalau certificate dari luar tidak selalu terhubung ke CalibrationJob Medcal, field ini kemungkinan perlu jadi nullable/optional secara *penggunaan*, meskipun schema saat ini men-declare `calibrationJobId` sebagai *non-nullable-looking* `String @unique` — **cek ulang skema exact nullability sebelum implementasi**, karena ini bukan scope audit ini untuk memastikan). |
| `status: CertificateStatus` (`DRAFT/ISSUED/REVOKED/SUPERSEDED`) | Bisa dipetakan ulang ke makna baru: mis. `DRAFT` = record dibuat tapi file belum di-upload, `ISSUED` = file sudah ter-attach dan certificate "aktif". Pemetaan pasti adalah keputusan implementasi, bukan sesuatu yang sudah ditentukan kode. |
| `pdfFileObjectId` + `pdfFile FileObject? @relation("CertificatePdf")` | **Field yang menunjuk ke file certificate — sudah ada, siap pakai.** Ini jawaban langsung untuk "field mana yang diperlukan untuk menunjuk ke file certificate": sudah ada, bukan gap. |
| `issuedAt`, `validUntil` | Relevan untuk metadata tampilan (kapan berlaku), tidak perlu diubah. |

**Field yang TIDAK relevan / di luar scope kebutuhan baru** (tidak perlu disentuh, tidak
perlu dijelaskan lebih jauh sesuai batasan task): `qualityReviewId`, `billingStatus`,
`supersedesCertificateId`, `revokeReason` — semuanya sudah ada di schema, tidak butuh
perubahan untuk mendukung flow upload-manual ini, dan lifecycle penerbitan/supersession
secara eksplisit di luar scope task ini.

**Gap nyata (bukan implementasi, hanya penjelasan):**

1. **Satu file per Certificate, bukan banyak.** `pdfFileObjectId` adalah relasi tunggal
   (`String?`, bukan array) — berbeda dari `EquipmentCalibrationRecord.documents` yang bisa
   banyak file. Kalau kebutuhan bisnis adalah "satu scan/foto gabungan per certificate",
   field ini cukup. Kalau butuh banyak foto (mis. halaman depan+belakang terpisah, atau
   beberapa foto sudut berbeda), field tunggal ini **tidak cukup** — ini satu-satunya gap
   struktural nyata yang ditemukan, dan keputusannya (single file vs multi-file) adalah
   keputusan bisnis, bukan sesuatu yang bisa disimpulkan dari kode yang ada.
2. **Belum ada `FileOwnerPolicy` untuk `CERTIFICATE`.** Enum value ada, tapi belum ada
   `certificateFileOwnerPolicy` yang mendaftar ke `FileOwnerPolicyRegistry` — ini pekerjaan
   implementasi berikutnya, bukan gap arsitektur (polanya sudah terbukti dan tinggal diikuti).
3. **Belum ada grant RBAC untuk resource `certificate`.** Resource dan actions sudah
   terdefinisi di catalog (`certificate: ["read", "create", "update", "issue"]`), tapi nol
   baris grant di `seed-role-permissions.ts` — tanpa grant, `hasPermission()` akan selalu
   `false` untuk role manapun sampai grant ditambahkan.
4. **Belum ada `CertificatesModule`/`Service`/`Controller`** untuk membuat row `Certificate`
   itu sendiri (input nomor manual + metadata) — ini prasyarat sebelum upload file bisa
   terjadi, karena `resolveOwner()` policy butuh `Certificate` row yang sudah ada untuk
   divalidasi keberadaannya.

## 6. Reusable Components/Services

**Langsung reusable, tanpa perubahan:**
- `FilesModule`/`FilesController`/`FilesService` (seluruh generic file layer)
- `FileOwnerPolicyRegistry` (pola registrasi plugin)
- `file-validation.ts` (validasi generik — sniffer PDF sudah ada; sniffer image kalau
  dibutuhkan tinggal ditambah, pola sudah jelas)
- `LocalDiskDriver`/`storage-key.ts` (penyimpanan fisik)
- Pola UI upload (`useUploadCalibrationCertificate`-equivalent: `FormData` + raw `fetch` ke
  `/files`) dan download (`apiFetchBlob`)
- `CompanyRoleGuard` (otorisasi sesi+membership, tidak perlu guard baru)
- Permission resource `certificate` (catalog sudah ada, tinggal ditambah grant)
- `FileOwnerType.CERTIFICATE` (enum value sudah ada, tinggal dipakai)
- `Certificate.pdfFileObjectId`/`pdfFile` relation (sudah ada, tinggal diisi)

**Hanya jadi referensi pola (tidak reusable langsung):** `equipmentCalibrationFileOwnerPolicy`
dan `EvidenceSection`/`use-equipment-calibration-records-query.ts` — domain berbeda, tapi
struktur kodenya adalah template yang sangat dekat untuk ditiru.

## 7. Gap yang Benar-Benar Diperlukan

Ringkas, hanya yang nyata (bukan spekulatif):

1. `certificateFileOwnerPolicy` baru (`ownerType: "CERTIFICATE"`, `resolveOwner()` query
   `Certificate` by id+companyId, `fileTypePolicy` sesuai kebutuhan format file — PDF dan/atau
   image tergantung keputusan bisnis).
2. Modul baru (`CertificatesModule` minimal) yang mendaftarkan policy tsb ke
   `FileOwnerPolicyRegistry`, plus endpoint minimal untuk membuat `Certificate` row
   (input manual `number` + relasi Customer/Device/CalibrationJob sesuai kebutuhan) —
   *tanpa* mekanisme alokasi nomor otomatis (`DocumentNumberService` **tidak** dipakai untuk
   `Certificate.number`, sesuai keputusan bisnis).
3. Grant RBAC untuk resource `certificate` di `seed-role-permissions.ts` (role mana yang
   boleh `create`/`update`/`read` — keputusan bisnis, bukan sesuatu yang bisa disimpulkan
   dari audit ini).
4. Keputusan single-file vs multi-file per Certificate (§5, gap #1) — kalau butuh
   multi-file, field `pdfFileObjectId` tunggal perlu diganti pola (mis. balik ke pola
   `FileObject[]` polymorphic seperti `EquipmentCalibrationRecord.documents`, yang berarti
   perubahan skema — **bukan keputusan yang audit ini buat**, hanya diidentifikasi sebagai
   pertanyaan terbuka).
5. UI staff di `apps/portal` untuk input nomor manual + upload foto/scan (analog
   `EvidenceSection`, domain baru).

**Bukan gap** (sengaja tidak disentuh, sesuai batasan task): certificate issuance engine,
`supersedesCertificateId`/lifecycle supersession, QR generation, Customer Portal
verification endpoint, numbering/allocation mechanism.

## 8. Recommended Integration Point

Titik integrasi paling natural, mengikuti arsitektur yang sudah ada seketat mungkin:

```text
Staff (apps/portal, UI baru — analog EquipmentCalibrationRecordsPanel)
  → input Certificate.number (manual, string biasa, tanpa alokasi) + metadata minimal
      (Customer/Device/CalibrationJob terkait, jika ada)
  → POST ke endpoint Certificate baru (modul baru, minimal) → Certificate row dibuat,
      status awal (mis. DRAFT sampai file ter-attach — keputusan implementasi)
  → staff upload foto/scan lewat komponen upload (pola EvidenceSection, reuse penuh)
      → FormData { ownerType: "CERTIFICATE", ownerId: <certificateId>, file }
      → POST /files (FilesController, TIDAK BERUBAH)
      → FilesService.upload() → certificateFileOwnerPolicy.resolveOwner() (BARU, kecil)
      → FileObject row dibuat, storageKey di FILES_ROOT
  → Certificate.pdfFileObjectId di-set ke FileObject.id yang baru (langkah kecil tambahan
      di CertificatesService — generic FilesService sendiri tidak tahu soal field ini,
      persis seperti pola EquipmentCalibrationRecord yang list file lewat query terpisah)
  → tampilan staff: preview/download lewat GET /files/:id (TIDAK BERUBAH)
```

Titik integrasi barunya sekecil mungkin: **satu `FileOwnerPolicy` baru + satu modul
Certificate minimal**. Seluruh mesin upload/storage/download/validasi/otorisasi file-nya
sendiri dipakai apa adanya, nol perubahan.

## 9. Files/Functions yang Kemungkinan Akan Disentuh pada Implementation Berikutnya

Daftar ini untuk perencanaan implementasi berikutnya — **tidak dikerjakan di audit ini**:

- **Baru:** `apps/api/src/modules/certificates/{certificates.module.ts,certificates.controller.ts,certificates.service.ts}` (atau nama serupa), `apps/api/src/modules/certificates/certificate-file-owner-policy.ts`.
- **Diubah, kecil:** `packages/auth/src/access-control.ts` (grant tidak perlu diubah di sini — grant ada di seed), `packages/db/prisma/seed-role-permissions.ts` (tambah baris grant `certificate`), file-validation's `CONTENT_SNIFFERS` di `apps/api/src/modules/files/file-validation.ts` (kalau image perlu di-sniff juga).
- **Baru, UI:** komponen upload+form di `apps/portal/src/app/management/...` (nama/lokasi tepatnya keputusan implementasi), plus query hook analog `use-equipment-calibration-records-query.ts`.
- **Tidak berubah sama sekali:** `files.controller.ts`, `files.service.ts`, `file-validation.ts` (struktur inti), `owner-policy.ts`, `storage/*`, `Certificate`/`FileObject` schema (kecuali kalau keputusan multi-file di §7 gap #4 memerlukan perubahan skema — di luar scope audit ini untuk memutuskan).

## 10. Scope Boundary — Apa yang TIDAK Perlu Dikerjakan

Sesuai instruksi task, dan dikonfirmasi oleh audit ini bahwa memang tidak relevan untuk
kebutuhan "staff upload foto/scan certificate":

- Certificate issuance engine / mesin penerbitan otomatis.
- `supersedesCertificateId` dan lifecycle supersession/reissuance.
- QR code generation.
- `verificationToken` generation (relevan untuk fase Customer Portal berikutnya, bukan fase
  upload ini).
- Endpoint verifikasi publik / Customer Portal certificate page.
- `DocumentNumberService`/`DocumentType.CERTIFICATE` — infrastruktur ini ADA tapi secara
  eksplisit TIDAK dipakai untuk `Certificate.number` sesuai keputusan bisnis.
- Perubahan Docker/Nginx/DNS/infrastructure apapun.
- Perubahan Prisma schema/migration (kecuali kalau keputusan multi-file nanti benar-benar
  membutuhkannya — itu keputusan implementasi berikutnya, bukan hasil audit ini).

## 11. Verdict

**READY FOR IMPLEMENTATION**

Tidak ada blocker arsitektural. Semua infrastruktur inti (generic file upload/storage/
download/validasi/otorisasi, `FileOwnerType.CERTIFICATE`, permission resource `certificate`,
`Certificate.pdfFileObjectId`/`pdfFile` relation, `Certificate.customerId` langsung ke
Customer) sudah ada dan terbukti bekerja lewat pola `EquipmentCalibrationRecord` yang nyaris
identik secara struktur. Pekerjaan berikutnya murni "isi slot yang sudah disediakan" — satu
`FileOwnerPolicy` baru, satu modul Certificate minimal, satu baris grant RBAC — bukan
membangun mekanisme baru dari nol.

Satu keputusan bisnis yang perlu diselesaikan **sebelum** (bukan menghalangi) implementasi
dimulai: single-file vs multi-file per Certificate (§5 gap #1, §7 gap #4) — karena ini
menentukan apakah `Certificate.pdfFileObjectId` yang sudah ada cukup dipakai apa adanya,
atau perlu pola berbeda. Ini bukan blocker teknis, hanya keputusan yang sebaiknya eksplisit
sebelum menulis kode `CertificatesModule`-nya.
