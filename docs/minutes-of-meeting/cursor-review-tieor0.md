Verdict: 4 dari 5 item Tier 0 memang independen dari pekerjaan MeasurementResult / Stage B. Ada 2 kejutan: (#3) dokumen komersial hari ini cenderung menampilkan nama master, bukan alias; (#5) bukan polish label — butuh RBAC + alur create/update Device untuk teknisi.

Mode Ask aktif: laporan lengkap di bawah. File docs/claude/plans/Calibration-management/audit-tier0-mom-20260914.md belum ditulis. Switch ke Agent mode jika ingin file itu dibuat.

Audit: Tier 0 Items (MoM 2026-09-14)
Summary
Asumsi “independen & low-risk” sebagian besar benar untuk #2, #3, #4, #7 (tanpa sentuh schema MeasurementResult / CalibrationTestPoint / DeviceCalibrationParameter). #5 bukan trivial: Device.brand / model / serialNumber hanya bisa diisi ADMIN lewat master Device; teknisi hanya bisa link device yang sudah ada via Identity Correction. Mode pajak Include/Exclude sudah ada (Tax.isExclude); yang kurang hanya sembunyikan baris tax amount saat Include.

Item-by-Item Audit
[MoM #2] Tax amount visibility on quotation
Hari ini

Toggle Include/Exclude hidup di master Tax: Tax.isExclude (false = Include, true = Exclude) — UI Tax + seed T1/T2.
Perhitungan sudah benar di quotations.service.ts (computeHeaderTotals) dan previewTotals di Portal.
QuotationTotals selalu menampilkan baris Tax bila ada taxCode/taxAmount (Portal + PDF quotation).
Quotation tidak menyimpan snapshot isExclude (hanya taxCode, taxRate, taxAmount).
Gap

Bukan “toggle belum ada” — display-only: saat Include, sembunyikan baris tax amount; total tetap (sudah inclusive).
Detail quotation tersimpan perlu sumber isExclude (join Tax by taxCode, atau snapshot ke dokumen).
Rencana

Aspek Usulan
File
quotations-ui.tsx (QuotationTotals), form quotation, quotation-pdf.ts; opsional PO jika ingin konsisten
Tipe
UI (+ API enrich) — schema opsional jika snapshot
Ukuran
Small
Risiko
Tanpa snapshot, ubah master Tax bisa mengubah tampilan dokumen lama; Putuskan: join vs snapshot
[MoM #3] Device name on Quotation / PO / WorkOrder
Hari ini

Alias customer = CalibrationRequestItem.customerDeviceName.
Master = DeviceType.name.
Quotation default description = deviceType.name (master), bukan alias.
customerDeviceName tidak masuk select/DTO quotation item.
PO/WO UI: description + deviceType.name; PDF WOL pakai deviceType.name.
Gap / kejutan

MoM bilang “sekarang alias saja” — di kode justru master yang dominan; alias sering tidak tampil di dokumen komersial.
Perlu konfirmasi produk: primary = alias atau master? (MoM: alias di atas, master di bawah.)
Rencana

Aspek Usulan
File
Query/DTO quotation–PO–WO + UI item rows + PDF (quotation-pdf, purchase-order-pdf, work-order-pdf-*)
Tipe
UI + API (tanpa schema)
Ukuran
Small–medium
Risiko
Duplikat jika description = master dan master ditampilkan lagi; fallback jika alias null
[MoM #4] AKD/AKL — hide & non-mandatory
Hari ini

Schema: akdAkl String?, akdAklDeclaration default NOT_PROVIDED — sudah nullable.
Zod: opsional; validasi hanya jika CUSTOMER_PROVIDED tanpa nomor.
Portal: field masih tampil (new/edit/detail/import).
Tech-pwa: tampil di detail + escalate + identity correction — bukan form wajib isi di happy path.
Out of scope: stickiness eskalasi AKD/AKL — jangan diubah.
Gap

Sembunyikan input deklarasi di Portal (dan noise validasi); backend column tetap.
Jangan matikan alur escalate / gate / identity correction.
Rencana

Aspek Usulan
File
calibration-requests/new, [id]/edit, detail, copy import; biarkan escalate/IC
Tipe
UI-only (schema tetap)
Ukuran
Small
Risiko
Data lama CUSTOMER_PROVIDED tetap ada; eskalasi harus tetap jalan
[MoM #5] Siapa boleh input brand / model / serial (ON_SITE / IN_LAB)
Hari ini

Field fisik: Device.brand, Device.model, Device.serialNumber.
RBAC seed: hanya ADMIN → device:create/update/delete/read.
TECHNICIAN: tidak punya permission device:*.
Binding identitas: Identity Correction (link device existing + technicianObservedSerial); assign-device sudah 410.
Tidak ada alur “buat Device baru di lapangan” untuk teknisi.
Gap

Role Brand/model/serial Device
ADMIN
Bisa (master Devices)
TECHNICIAN
Blocked create/update; hanya pilih kandidat + observed serial
Rencana

Aspek Usulan
File
seed-role-permissions / access-control; API devices atau endpoint job-scoped create; UI Portal job + tech-pwa
Tipe
UI + API + RBAC (schema Device sudah ada)
Ukuran
Medium — item paling berat di batch
Risiko
Jangan grant device:delete ke teknisi; batasi create ke customer job; overlap soft dengan identity gate (bukan MeasurementResult)
Status Tier 0: independen dari MeasurementResult, tapi bukan polish rendah-risiko seperti item lain — pertimbangkan park atau spike terpisah.

[MoM #7] Label "Device ID" → "Serial No"
Hari ini

Field free-text: CalibrationRequestItem.deviceId (bukan FK).
Tidak ada kolom serial_no di requisition; Device.serialNumber terpisah.
Label "Device ID": Portal requisition new/edit, import, template Excel, prefix PDF Quotation/PO.
Lookup/wajib identity job memakai CalibrationJob.deviceId (FK Device) + technicianObservedSerial — konsep berbeda.
Tidak ada logika yang menjadikan Device.serialNumber sebagai mandatory key requisition.
Gap

Relabel UI → "Serial No", tetap tulis ke deviceId.
Jangan samakan dengan pesan identityIncomplete ("Device ID") tanpa keputusan produk (itu FK job).
Rencana

Aspek Usulan
File
Form/import/template Portal; PDF label; hati-hati copy job identity
Tipe
UI-only
Ukuran
Trivial–small
Risiko
Bingungkan dua makna deviceId; tech-pwa hampir tidak pakai label "Device ID" di requisition
Independence Check (Step 1)
Item Independen dari MeasurementResult / Stage B?
#2 Tax
Ya — Tax / Quotation saja
#3 Nama device
Ya — DTO/UI/PDF dokumen komersial
#4 AKD/AKL hide
Ya — form requisition; jangan sentuh gate/stickiness
#5 Brand/model/serial
Ya vs MeasurementResult, tapi medium (RBAC + create Device)
#7 Label Serial No
Ya — label; jangan campur dengan FK CalibrationJob.deviceId
Tidak ada item yang wajib mengubah migration/MeasurementResult/CalibrationTestPoint/DeviceCalibrationParameter atau measurement-entry tech-pwa.

Recommended Execution Order
#7 — label swap (paling aman)
#2 — hide tax line Include (+ putuskan join vs snapshot isExclude)
#4 — hide AKD/AKL di form Portal (jangan sentuh eskalasi)
#3 — dual name setelah klarifikasi primary alias vs master
#5 — terakhir / terpisah: RBAC + UX create Device untuk teknisi
Batch “safe polish” yang disarankan: #7 + #2 + #4 (+ #3 setelah klarifikasi).
#5 jangan digabung tanpa approval desain permission.

Action plan (siap eksekusi setelah approval)
Batch A (aman)

Relabel "Device ID" → "Serial No" di Portal requisition/import/template/PDF (tetap deviceId).
Sembunyikan baris Tax di QuotationTotals + PDF saat Include; tentukan sumber isExclude.
Sembunyikan field AKD/AKL di form Portal; biarkan schema + escalate/IC.
Batch B (setelah klarifikasi) 4. Dual display alias + master di Quotation/PO/WO (API include customerDeviceName).

Batch C (terpisah) 5. Desain grant device:create/update (terbatas) + UI create/edit Device dari job untuk ADMIN + TECHNICIAN.

Konfirmasi: tidak ada perubahan code/schema di workspace — audit & planning saja. Untuk menulis laporan ke path yang diminta prompt, switch ke Agent mode.
