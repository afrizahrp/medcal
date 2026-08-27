READ-ONLY AUDIT — FINAL WORKORDER DOMAIN & IMPLEMENTATION READINESS

Lakukan READ-ONLY AUDIT terhadap domain WorkOrder berdasarkan kondisi repository saat ini.

JANGAN mengubah file apa pun.
JANGAN membuat migration.
JANGAN membuat atau mengubah code.
JANGAN melakukan implementasi WorkOrder.
JANGAN melakukan cleanup/refactor.
JANGAN memperbaiki issue yang ditemukan.

Tujuan audit ini hanya satu: menentukan apakah kita sudah memiliki baseline MVP WorkOrder yang cukup jelas untuk mulai implementasi, dan jika belum, apa saja keputusan domain yang masih harus dikunci.

Gunakan repository saat ini sebagai satu-satunya source of truth. Inspect schema Prisma, existing backend modules, shared schemas, permissions, seed, Portal UI patterns, migrations, tests, serta dokumentasi project yang relevan.

Audit hubungan lifecycle berikut secara utuh:

CalibrationRequest
↓
Quotation
↓
PurchaseOrder
↓
WorkOrder
↓
CalibrationJob

CalibrationRequest, Quotation, dan PurchaseOrder sudah memiliki keputusan/implementasi terbaru. Jangan kembali mendesain ketiga modul tersebut. Gunakan implementasi aktual mereka untuk menentukan contract WorkOrder.

Secara khusus, telusuri dan jelaskan:

- model `WorkOrder` yang saat ini ada di Prisma;
- seluruh field, enum, relation, FK, index, dan constraint yang terkait;
- hubungan WorkOrder dengan `PurchaseOrder`;
- hubungan WorkOrder dengan `Quotation`;
- hubungan WorkOrder dengan `CalibrationRequest`;
- hubungan WorkOrder dengan Customer;
- hubungan WorkOrder dengan Device/CalibrationRequestItem/QuotationItem/PurchaseOrderItem jika memang ada;
- apakah `WorkOrder.purchaseOrderId` sudah ada dan apa makna domain yang paling jelas berdasarkan schema/code;
- apakah ada field atau relation yang menunjukkan source document WorkOrder;
- apakah WorkOrder merupakan snapshot dari PO, reference/live relation, atau kombinasi keduanya;
- apakah data commercial seperti customer, qty, price, discount, tax, total, dan currency perlu berada di WorkOrder atau cukup direferensikan dari PO;
- apakah WorkOrder perlu menyimpan snapshot data tertentu dari PO;
- cardinality yang benar antara PurchaseOrder dan WorkOrder;
- apakah satu PO dapat menghasilkan satu WorkOrder atau beberapa WorkOrder;
- apakah satu WorkOrder dapat berasal dari lebih dari satu PO;
- apakah partial fulfillment memiliki implikasi terhadap cardinality;
- apakah satu WorkOrder mewakili seluruh PO atau sebagian item PO;
- bagaimana item WorkOrder seharusnya berhubungan dengan PurchaseOrderItem/QuotationItem/CalibrationRequestItem;
- apakah item selection/subset diperlukan pada MVP;
- apakah satu CalibrationRequest dapat menghasilkan lebih dari satu WorkOrder;
- bagaimana WorkOrder nantinya menjadi source/input untuk CalibrationJob;
- apakah satu WorkOrder dapat menghasilkan beberapa CalibrationJob;
- apakah satu CalibrationJob dapat berasal dari beberapa WorkOrder;
- apakah schema saat ini sudah mendukung hubungan tersebut atau masih ada gap.

Audit juga lifecycle/status WorkOrder berdasarkan enum dan pola yang benar-benar ada di repository.

Jangan mengarang status baru.

Tentukan apakah status yang ada sudah cukup untuk MVP dan bagaimana transition yang paling tepat berdasarkan existing conventions.

Secara khusus periksa apakah WorkOrder perlu:

- DRAFT
- APPROVED
- IN_PROGRESS
- COMPLETED
- CANCELLED

atau status lain yang memang sudah ada.

Jika status tersebut belum ada, JANGAN langsung menambahkannya. Tandai sebagai `UNRESOLVED` dan jelaskan evidence yang tersedia.

Tentukan juga trigger bisnis:

- kapan WorkOrder boleh dibuat;
- apakah hanya dari PurchaseOrder APPROVED;
- apakah `customerApprovedAt` atau approval Quotation masih relevan secara langsung;
- apakah PO APPROVED menjadi satu-satunya prerequisite;
- apakah WorkOrder dibuat manual oleh user atau otomatis;
- apakah PO approval harus otomatis membuat WorkOrder;
- apakah WorkOrder perlu dibuat sebelum CalibrationJob;
- apakah WorkOrder dapat dibuat tanpa PO.

Jangan mengubah keputusan yang sudah dikunci:

PurchaseOrder:

- source = APPROVED Quotation;
- PO = snapshot Quotation;
- workflow = DRAFT → APPROVED;
- DRAFT → CANCELLED;
- APPROVED → CANCELLED tidak boleh;
- setelah APPROVED seluruh field terkunci.

WorkOrder harus dibangun di atas kontrak tersebut, bukan mengubahnya.

Audit juga boundary antara WorkOrder dan CalibrationJob.

Kita sengaja belum mendesain `MeasurementEntry`.

JANGAN masuk ke desain MeasurementEntry, MeasurementResult, Certificate, Invoice, Payment, atau downstream detail lainnya kecuali diperlukan untuk menjelaskan boundary WorkOrder → CalibrationJob.

Jika menemukan requirement yang hanya relevan untuk downstream, cukup tandai sebagai OUT OF SCOPE.

Periksa juga pola backend yang sudah digunakan oleh:

- CalibrationRequest
- Quotation
- PurchaseOrder

Identifikasi pola yang seharusnya diikuti WorkOrder untuk:

- module
- controller
- service
- permissions
- CompanyRoleGuard
- Zod/shared schema
- document numbering
- transaction
- status transition
- error handling
- testing

Jangan implementasikan pola tersebut. Hanya audit dan rekomendasikan apakah pola tersebut memang applicable.

Periksa document numbering WorkOrder yang sudah ada di repository.

Jika prefix/document type sudah tersedia, laporkan.

Jika belum tersedia, tandai sebagai `UNRESOLVED`.

Jangan membuat konfigurasi baru.

Periksa permission catalog dan seed role permissions untuk WorkOrder.

Tentukan permission minimum yang diperlukan berdasarkan pola CalibrationRequest/Quotation/PurchaseOrder.

Jangan mengubah permission.

Periksa Portal navigation/menu yang berkaitan dengan WorkOrder.

Jika belum ada, cukup laporkan.

Jangan membuat UI.

Periksa migration history yang berkaitan dengan WorkOrder dan identifikasi apakah schema saat ini merupakan hasil perubahan historis yang masih menyisakan status/field legacy.

Jangan membersihkan legacy enum/field dalam audit ini.

Yang paling penting: jangan menyimpulkan requirement hanya karena sebuah field sudah ada di schema.

Untuk setiap keputusan domain, bedakan dengan jelas:

- `LOCKED / EVIDENCED` — didukung kuat oleh schema/code/current contract;
- `RECOMMENDED` — inferensi desain yang masuk akal untuk MVP;
- `UNRESOLVED` — repository belum memberikan jawaban yang cukup.

Jangan mengubah `UNRESOLVED` menjadi keputusan hanya untuk membuat audit terlihat lengkap.

Pada akhir audit, berikan satu kesimpulan yang sangat konkret:

Apakah WorkOrder sudah siap diimplementasikan?

Gunakan salah satu:

```text
READY FOR IMPLEMENTATION
```
