# 12. Dynamic Device Addition Assessment

## 12.1 Skenario Hipotetis

Bayangkan MedCal menambahkan **DeviceType baru** (mis. "Defibrillator") yang belum ada di katalog. Langkah apa yang dibutuhkan agar LK-nya bisa di-generate secara dinamis TANPA menulis kode PDF baru khusus device ini?

## 12.2 Langkah yang SUDAH Bisa Dilakukan Murni via Data (Tanpa Kode Baru)

Berdasarkan arsitektur yang dikonfirmasi di [01](01-device-capabilities-architecture.md):

1. **Buat `DeviceType` baru** — via API/UI `management/device-types` (modul CRUD sudah ada, sudah generik).
2. **Buat `DeviceCalibrationParameter` baru** untuk setiap parameter kinerja spesifik device ini, dikaitkan ke `DeviceCapabilityItem` yang SUDAH ADA jika parameternya generik (mis. semua device otomatis dapat opsi mengaitkan ke `ENVIRONMENTAL_CONDITIONS`/`ELECTRICAL_SAFETY` yang sudah global) — via modul `device-calibration-parameters` (CRUD sudah ada, sudah generik, auto-membuat `DeviceTypeCapabilityOrder` saat parameter baru dibuat — dikonfirmasi di kode: `device-calibration-parameters.service.ts:326-341`).
3. **Buat `DeviceCapability`/`DeviceCapabilityItem` baru** HANYA jika device punya kategori pengukuran yang benar-benar baru (mis. defibrillator punya "Energy Delivery Accuracy" yang belum ada capability-nya) — via modul `device-capabilities` (CRUD sudah ada, sudah generik).
4. **Buat `DevicePhysicalCheckItem` baru** untuk checklist fisik device ini — via seed/CRUD (modul ada, tapi **tidak ditemukan endpoint CRUD REST publik** untuk `DevicePhysicalCheckItem` dalam eksplorasi ini — hanya seed script `seed-physical-check-items.ts`; PERLU VERIFIKASI lanjutan apakah ada endpoint portal untuk physical check items, karena tidak ditemukan dalam file list yang diperiksa).
5. **Buat `DeviceTypeEquipmentRequirement` baru** untuk alat referensi yang wajib — via modul `device-type-equipment-requirements` (seed ada, endpoint CRUD portal tidak diverifikasi eksplisit dalam audit ini).
6. **Runtime otomatis bekerja** — begitu parameter/item di atas ada, `listMeasurementParameters`, physical check flow di tech-pwa, dan job-reference-equipment SEMUA sudah generik dan akan otomatis menampilkan/menerima data untuk device baru ini TANPA perubahan kode, karena semuanya di-resolve via `deviceTypeId` secara dinamis.

## 12.3 Langkah yang MASIH Membutuhkan Kode Baru (Bukan Murni Data)

| Kebutuhan | Kenapa butuh kode |
|---|---|
| **Generator PDF LK itu sendiri** | **Belum ada sama sekali** — tidak ditemukan generator PDF untuk lembar kerja pengukuran LK di `apps/api/src/modules/calibration-jobs/*` manapun. Yang ada hanya PDF F.MU.08 Kontrol Alat (`kontrol-alat-pdf.ts`) dan BA Koreksi Identitas (`identity-correction-pdf.ts`) — keduanya dokumen BERBEDA dari LK pengukuran. Membangun generator LK baru (meski generik lintas-device) tetap butuh kode BARU — hanya saja TIDAK PERLU kode per-device jika didesain generik dari awal (lihat [15-recommended-architecture.md](15-recommended-architecture.md)). |
| Metadata konfigurasi alat (Tipe bagian diaplikasikan, Kelas Proteksi, Hubungan Utama) | Field ini tidak punya rumah — device baru pun akan mengalami gap yang sama seperti BSM/Baby Incubator (lihat [09](09-environmental-electrical-safety-mapping.md) §9.2) kecuali skema ditambah kolom baru. |
| Formula skor Telaah Teknis (10/40/50) | Business rule belum ada sama sekali untuk device APAPUN — device baru akan mewarisi gap yang sama (lihat [10](10-technical-review-mapping.md)). |
| Field `Resolusi`, dan disambiguasi 3-sub-reading Tegangan | Sama — gap generik lintas-device, bukan spesifik-device. |

## 12.4 Kesimpulan

**Assessment: SEBAGIAN BESAR skalabel tanpa kode baru** untuk domain yang SUDAH dimodelkan generik (parameter kalibrasi, physical inspection, equipment reference) — device baru murni butuh entri data katalog baru, bukan kode. NAMUN generator LK PDF itu sendiri belum ada dalam bentuk apapun (generik maupun per-device) — ini bukan gap "per-device", melainkan gap "belum ada fitur ini sama sekali". Begitu generator generik dibangun SEKALI, penambahan device baru seharusnya TIDAK memerlukan sentuhan kode pada generator tersebut — asalkan gap-gap di §12.3 (metadata konfigurasi, skor telaah teknis) sudah diselesaikan sebagai business rule lintas-device, bukan per-device.
