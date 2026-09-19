/**
 * Seeds DevicePhysicalCheckItem (251 rows) from PhysicalInspection_Master_Seed.md
 * plus PATIENT_MONITOR checklist copied from BED_SIDE_MONITOR (business lock).
 * Master configuration only — does NOT create PhysicalCheckResult or touch
 * DeviceCalibrationParameter / MeasurementResult / DeviceType.
 *
 * DeviceType is resolved by stable `code` (never hardcoded cuid). Missing
 * DeviceType fails loud — this seed does not create DeviceType rows.
 *
 * Idempotent: upsert on @@unique([deviceTypeId, code]).
 *
 * Run manually: pnpm --filter @medcal/db run seed:physical-check-items
 * Dry-run (no DB mutation): pnpm --filter @medcal/db run seed:physical-check-items -- --dry-run
 *
 * Source: docs/module-specs/technician-app/ui-tasks/PhysicalInspection_Master_Seed.md
 */
import { prisma } from "../src/index";

interface PhysicalCheckItemSeedRow {
  deviceTypeCode: string;
  code: string;
  name: string;
  inspectionLimit: string;
  sortOrder: number;
}

/** Approved dataset — 251 rows / 45 DeviceTypes. Do not normalize LK wording. */
export const PHYSICAL_CHECK_ITEMS: PhysicalCheckItemSeedRow[] = [
  {
    deviceTypeCode: "AUDIOMETER",
    code: "AUDIOMETER_PHYSICAL_001",
    name: "Badan dan permukaan alat",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "AUDIOMETER",
    code: "AUDIOMETER_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakan tusuk kontak untuk memastikan keamanannya. Goyang-goyangkan tusuk kintak untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "AUDIOMETER",
    code: "AUDIOMETER_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "AUDIOMETER",
    code: "AUDIOMETER_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "AUDIOMETER",
    code: "AUDIOMETER_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi seluruhnya, yakinkan bahwa bagian tampilan digital berfungsi.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "AUDIOMETER",
    code: "AUDIOMETER_PHYSICAL_006",
    name: "Earphone",
    inspectionLimit: "Pastikan type earphone sesuai dengan penggunaan audiometer dan kabel terhubung baik",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "AUTOCLAVE",
    code: "AUTOCLAVE_PHYSICAL_001",
    name: "Badan dan permukaan alat",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "AUTOCLAVE",
    code: "AUTOCLAVE_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakan tusuk kontak untuk memastikan keamanannya. Goyang-goyangkan tusuk kintak untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "AUTOCLAVE",
    code: "AUTOCLAVE_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "AUTOCLAVE",
    code: "AUTOCLAVE_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "AUTOCLAVE",
    code: "AUTOCLAVE_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi seluruhnya, yakinkan bahwa bagian tampilan digital berfungsi.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    code: "BABY_INCUBATOR_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    code: "BABY_INCUBATOR_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    code: "BABY_INCUBATOR_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    code: "BABY_INCUBATOR_PHYSICAL_004",
    name: "Tombol, Saklar dan kontrol",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    code: "BABY_INCUBATOR_PHYSICAL_005",
    name: "Sensor suhu kulit",
    inspectionLimit: "pastikan semua sensor dalam kondisi bersih dan tidak retak / rapuh, dan tidak dibolehkan menukar probe pada alat lain dengan merk yang berbeda.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    code: "BABY_INCUBATOR_PHYSICAL_006",
    name: "Saringan udara",
    inspectionLimit: "pastikan saringan udara dalam keadaan bersih dan tidak tersumbat agar aliran udara dapat masuk/melewati filter dengan leluasa.",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    code: "BABY_INCUBATOR_PHYSICAL_007",
    name: "Tampilan dan indicator",
    inspectionLimit: "selama pengecekan fungsi pastikan lampu indicator dan tampilan layar berfungsi seluruhnya, yakinkan bahwa bagian tampilan digital berfungsi.",
    sortOrder: 70,
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    code: "BABY_INCUBATOR_PHYSICAL_008",
    name: "Batas cairan",
    inspectionLimit: "periksa bak cairan pada wadah air dan pastikan terisi sesuai batas.",
    sortOrder: 80,
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    code: "BABY_INCUBATOR_PHYSICAL_009",
    name: "Matras",
    inspectionLimit: "pastikan dalam kondisi, jika tersedia pengaturan posisi kemiringan, patikan untuk dapat digerakan dan aman bila posisi terkunci.",
    sortOrder: 90,
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    code: "BED_SIDE_MONITOR_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    code: "BED_SIDE_MONITOR_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    code: "BED_SIDE_MONITOR_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    code: "BED_SIDE_MONITOR_PHYSICAL_004",
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    code: "BED_SIDE_MONITOR_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "BIO_SAFETY_CABINET",
    code: "BIO_SAFETY_CABINET_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "BIO_SAFETY_CABINET",
    code: "BIO_SAFETY_CABINET_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "BIO_SAFETY_CABINET",
    code: "BIO_SAFETY_CABINET_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "BIO_SAFETY_CABINET",
    code: "BIO_SAFETY_CABINET_PHYSICAL_004",
    name: "Sekering Pengaman",
    inspectionLimit: "Periksa sekering yang terdapat pada bagian luar rangkaian, apakah nilai tahanan dan tipenya sesuai dengan spesifikasi yang tertulis pada alat. Sekering pengaman harus berfungsi dengan baik.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "BIO_SAFETY_CABINET",
    code: "BIO_SAFETY_CABINET_PHYSICAL_005",
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "BIO_SAFETY_CABINET",
    code: "BIO_SAFETY_CABINET_PHYSICAL_006",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "BLANKET_WARMER",
    code: "BLANKET_WARMER_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "BLANKET_WARMER",
    code: "BLANKET_WARMER_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "BLANKET_WARMER",
    code: "BLANKET_WARMER_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "BLANKET_WARMER",
    code: "BLANKET_WARMER_PHYSICAL_004",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "BLANKET_WARMER",
    code: "BLANKET_WARMER_PHYSICAL_005",
    name: "Kompresor / pompa",
    inspectionLimit: "pastikan berfungsi baik. Periksa tekanancyang dihasilkan secara berkala",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "BLANKET_WARMER",
    code: "BLANKET_WARMER_PHYSICAL_006",
    name: "Selang – selang",
    inspectionLimit: "Periksa selang-selang sumber air, dan udara tekan. Pastikan tidak ada kebocoran",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    code: "BLOOD_BANK_REFRIGERATORS_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    code: "BLOOD_BANK_REFRIGERATORS_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    code: "BLOOD_BANK_REFRIGERATORS_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    code: "BLOOD_BANK_REFRIGERATORS_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    code: "BLOOD_BANK_REFRIGERATORS_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    code: "BLOOD_PRESSURE_MONITOR_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    code: "BLOOD_PRESSURE_MONITOR_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    code: "BLOOD_PRESSURE_MONITOR_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    code: "BLOOD_PRESSURE_MONITOR_PHYSICAL_004",
    name: "Tombol, saklar dan control",
    inspectionLimit: "Periksa semua tombol/saklar dan control, pastikan berfungsi baik",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    code: "BLOOD_PRESSURE_MONITOR_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan lampu indicator dan tampilan layer berfungsi baik",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "CENTRIFUGE",
    code: "CENTRIFUGE_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "CENTRIFUGE",
    code: "CENTRIFUGE_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "CENTRIFUGE",
    code: "CENTRIFUGE_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "CENTRIFUGE",
    code: "CENTRIFUGE_PHYSICAL_004",
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "CENTRIFUGE",
    code: "CENTRIFUGE_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "CENTRIFUGE_REFRIGERATOR",
    code: "CENTRIFUGE_REFRIGERATOR_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "CENTRIFUGE_REFRIGERATOR",
    code: "CENTRIFUGE_REFRIGERATOR_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "CENTRIFUGE_REFRIGERATOR",
    code: "CENTRIFUGE_REFRIGERATOR_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "CENTRIFUGE_REFRIGERATOR",
    code: "CENTRIFUGE_REFRIGERATOR_PHYSICAL_004",
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "CENTRIFUGE_REFRIGERATOR",
    code: "CENTRIFUGE_REFRIGERATOR_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "COLD_CHAIN",
    code: "COLD_CHAIN_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "COLD_CHAIN",
    code: "COLD_CHAIN_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "COLD_CHAIN",
    code: "COLD_CHAIN_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "COLD_CHAIN",
    code: "COLD_CHAIN_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "COLD_CHAIN",
    code: "COLD_CHAIN_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "CPAP",
    code: "CPAP_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "CPAP",
    code: "CPAP_PHYSICAL_002",
    name: "Kotak Kontak Alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-power). Gerak -gerakan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada bauta tau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "CPAP",
    code: "CPAP_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "CPAP",
    code: "CPAP_PHYSICAL_004",
    name: "Tombol, saklar dan control",
    inspectionLimit: "Periksa semua fungsi tombol/saklar atau kontrol, pastikan befungsi dengan baik",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "CPAP",
    code: "CPAP_PHYSICAL_005",
    name: "Tampilan dan indicator",
    inspectionLimit: "Selama pengecekan fungsi, pastikan indicator dan tampilan layer berfungsi baik.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "CPAP",
    code: "CPAP_PHYSICAL_006",
    name: "Selang dan konektor",
    inspectionLimit: "pastikan sambungan sudah terpasang dan sesuai dengan spesifikasi CPAP",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "DENTAL_UNIT",
    code: "DENTAL_UNIT_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "DENTAL_UNIT",
    code: "DENTAL_UNIT_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "DENTAL_UNIT",
    code: "DENTAL_UNIT_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "DENTAL_UNIT",
    code: "DENTAL_UNIT_PHYSICAL_004",
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "DENTAL_UNIT",
    code: "DENTAL_UNIT_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "DENTAL_UNIT",
    code: "DENTAL_UNIT_PHYSICAL_006",
    name: "Kompresor",
    inspectionLimit: "Periksa tekanan yang dihasilkan secara berkala",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "DENTAL_UNIT",
    code: "DENTAL_UNIT_PHYSICAL_007",
    name: "Selang-selang",
    inspectionLimit: "Pastikan selang-selang sumber air, dan udara. Pastikan tidak ada kebocoran",
    sortOrder: 70,
  },
  {
    deviceTypeCode: "DENTAL_XRAY",
    code: "DENTAL_XRAY_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "DENTAL_XRAY",
    code: "DENTAL_XRAY_PHYSICAL_002",
    name: "Mekanisme pergerakan",
    inspectionLimit: "Pastikan sistem pergerakan beroperasi dengan lancar, tidak menarik kesatu sisi atau sisi yang lain dan tidak membuat suara yang aneh saat digerakan. Pastikan pengendali Gerakan maju dan mundur berfungsi.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "DENTAL_XRAY",
    code: "DENTAL_XRAY_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "DENTAL_XRAY",
    code: "DENTAL_XRAY_PHYSICAL_004",
    name: "Tombol, Saklar dan kontrol",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "DENTAL_XRAY",
    code: "DENTAL_XRAY_PHYSICAL_005",
    name: "Tampilan dan indicator",
    inspectionLimit: "selama pengecekan fungsi pastikan lampu indicator dan tampilan layar berfungsi seluruhnya, yakinkan bahwa bagian tampilan digital berfungsi.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    code: "ELECTROCARDIOGRAPHS_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    code: "ELECTROCARDIOGRAPHS_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    code: "ELECTROCARDIOGRAPHS_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    code: "ELECTROCARDIOGRAPHS_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    code: "ELECTROCARDIOGRAPHS_PHYSICAL_005",
    name: "Baterai/Charger",
    inspectionLimit: "Periksa kondisi fisik dan konektor baterai apakah siap untuk dipergunakan. Periksa apakah alarm baterai menunjukkan baterai lemah. Jika demikian recharge baterai.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    code: "ELECTROCARDIOGRAPHS_PHYSICAL_006",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    code: "ELECTROCARDIOGRAPHS_PHYSICAL_007",
    name: "Periksa kondisi charger",
    inspectionLimit: "apakah masih baik dan dapat bekerja dengan baik, lalu charge baterai. Untuk beberapa jenis baterai mempunyai batas waktu (periode) penggunaan dan pengisian ulang, hal ini perlu diperhatikan untuk menjaga ketahanan baterai tersebut. Jika ada rekomendasi dari pabrikan, pastikan hal tersebut dilakukan sesuai dengan rekomendasi tersebut.",
    sortOrder: 70,
  },
  {
    deviceTypeCode: "ELECTRO_ACCUPUNTURE",
    code: "ELECTRO_ACCUPUNTURE_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "ELECTRO_ACCUPUNTURE",
    code: "ELECTRO_ACCUPUNTURE_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "ELECTRO_ACCUPUNTURE",
    code: "ELECTRO_ACCUPUNTURE_PHYSICAL_003",
    name: "Kabel catu utama (line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "ELECTRO_ACCUPUNTURE",
    code: "ELECTRO_ACCUPUNTURE_PHYSICAL_004",
    name: "Pengaman",
    inspectionLimit: "Periksa aplikasi, keamanan dan system saat terdapat peringatan terjadinya error pada aplikasi",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "ELECTRO_ACCUPUNTURE",
    code: "ELECTRO_ACCUPUNTURE_PHYSICAL_005",
    name: "Control panel",
    inspectionLimit: "Periksa control panel pada setiap panel potensiometer agar alat dapat bekerja dengan baik saat digunakan",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "EXAMINATION_LAMP",
    code: "EXAMINATION_LAMP_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "EXAMINATION_LAMP",
    code: "EXAMINATION_LAMP_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "EXAMINATION_LAMP",
    code: "EXAMINATION_LAMP_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "EXAMINATION_LAMP",
    code: "EXAMINATION_LAMP_PHYSICAL_004",
    name: "Tombol, Saklar dan control",
    inspectionLimit: "Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "EXAMINATION_LAMP",
    code: "EXAMINATION_LAMP_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "EXAMINATION_LAMP",
    code: "EXAMINATION_LAMP_PHYSICAL_006",
    name: "System pengunci dan penyeimbang",
    inspectionLimit: "Lakukan pemeriksaan system pengunci dan penyeimbang lampu.",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "FETAL_DOPPLER",
    code: "FETAL_DOPPLER_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "FETAL_DOPPLER",
    code: "FETAL_DOPPLER_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "FETAL_DOPPLER",
    code: "FETAL_DOPPLER_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "FETAL_DOPPLER",
    code: "FETAL_DOPPLER_PHYSICAL_004",
    name: "Kabel tranduser",
    inspectionLimit: "periksa kabel dan fungsi masing-masing. Kemudian periksa dengan hati-hati apakah terdapat sobekan atau terkelupas pada lapisan isolasinya, hal ini untuk menghindari adanya gangguan tegangan",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "FETAL_DOPPLER",
    code: "FETAL_DOPPLER_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan lampu indicator dan tampilan layer berfungsi baik",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "FETAL_DOPPLER",
    code: "FETAL_DOPPLER_PHYSICAL_006",
    name: "Tombol, saklar dan control",
    inspectionLimit: "Periksa semua tombol/saklar dan control, pastikan berfungsi baik",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "FLOW_METER",
    code: "FLOW_METER_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "FLOW_METER",
    code: "FLOW_METER_PHYSICAL_002",
    name: "Katup dan control",
    inspectionLimit: "Sebelum mempergunakan/ mengubah ubah tombol control, periksa posisinya, jika terlihat tidak berada pada poisisnya (periksa dengan menggunakan mode pemeriksaan standra). Bandingkan dengan posisi control. Ingat pengaturan tersebut dan kembalikan pada pengaturan awal jika sudah selesai pekerjaan.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "FLOW_METER",
    code: "FLOW_METER_PHYSICAL_003",
    name: "Tampilan dan indicator",
    inspectionLimit: "Selama pengecekan fungsi, pastikan indicator dan tampilan layer berfungsi baik",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "HEAD_LAMP_MEDIK",
    code: "HEAD_LAMP_MEDIK_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "HEAD_LAMP_MEDIK",
    code: "HEAD_LAMP_MEDIK_PHYSICAL_002",
    name: "Tombol, Saklar dan control",
    inspectionLimit: "Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "HEAD_LAMP_MEDIK",
    code: "HEAD_LAMP_MEDIK_PHYSICAL_003",
    name: "Charging socket",
    inspectionLimit: "pastikan system pengisian ulang battery berfungsi",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "HEAD_LAMP_MEDIK",
    code: "HEAD_LAMP_MEDIK_PHYSICAL_004",
    name: "Battery box",
    inspectionLimit: "periksa kondisi battery, pastikan tidak ada tanda – tanda bocor yang bersumber dari battery",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "HEAD_LAMP_MEDIK",
    code: "HEAD_LAMP_MEDIK_PHYSICAL_005",
    name: "Lampu",
    inspectionLimit: "periksa kondisi lampu",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    code: "HUMIDIFIER_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    code: "HUMIDIFIER_PHYSICAL_002",
    name: "Roda dan pengunci",
    inspectionLimit: "Jika unit bergerak dengan roda, periksa kondisinya. Pastikan dapat bergerak dan berputar, periksa rem dan pengunci roda, pastikan berfungsi dengan baik.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    code: "HUMIDIFIER_PHYSICAL_003",
    name: "Tusuk kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    code: "HUMIDIFIER_PHYSICAL_004",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    code: "HUMIDIFIER_PHYSICAL_005",
    name: "Tombol, Saklar dan control",
    inspectionLimit: "Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    code: "INFANT_WARMER_PHYSICAL_001",
    name: "Badan dan permukaan alat",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    code: "INFANT_WARMER_PHYSICAL_002",
    name: "Roda dan pengunci",
    inspectionLimit: "Jika unit bergerak dengan roda, periksa kondisinya. Pastikan dapa bergerak dan berputar, periksa rem dan kunci roda, pastikan berfungsi dengan baik.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    code: "INFANT_WARMER_PHYSICAL_003",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakan tusuk kontak untuk memastikan keamanannya. Goyang-goyangkan tusuk kintak untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    code: "INFANT_WARMER_PHYSICAL_004",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    code: "INFANT_WARMER_PHYSICAL_005",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "INFUSION_PUMP",
    code: "INFUSION_PUMP_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "INFUSION_PUMP",
    code: "INFUSION_PUMP_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "INFUSION_PUMP",
    code: "INFUSION_PUMP_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "INFUSION_PUMP",
    code: "INFUSION_PUMP_PHYSICAL_004",
    name: "Tombol, saklar dan control",
    inspectionLimit: "Periksa seluruhnya pastikan berfungsi baik",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "INFUSION_PUMP",
    code: "INFUSION_PUMP_PHYSICAL_005",
    name: "Tampilan dan indicator",
    inspectionLimit: "Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi baik",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "INFUSION_PUMP",
    code: "INFUSION_PUMP_PHYSICAL_006",
    name: "System pengunci pergerakan",
    inspectionLimit: "Lakukan pemeriksaan system pengunci pergerakan 374653683000 Tidak",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "INFUSION_PUMP",
    code: "INFUSION_PUMP_PHYSICAL_007",
    name: "Alarm dan system interlock.",
    inspectionLimit: "Periksa alarm dan system interlock pastikan berfungsi dengan baik.",
    sortOrder: 70,
  },
  {
    deviceTypeCode: "INFUSION_PUMP",
    code: "INFUSION_PUMP_PHYSICAL_008",
    name: "Motor/pompa penghisap",
    inspectionLimit: "Periksa kondisi fisik motor dan pastikan berfungsi baik/normal.",
    sortOrder: 80,
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    code: "KULKAS_VAKSIN_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    code: "KULKAS_VAKSIN_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    code: "KULKAS_VAKSIN_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    code: "KULKAS_VAKSIN_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    code: "KULKAS_VAKSIN_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "LAMINAR_AIR_FLOW",
    code: "LAMINAR_AIR_FLOW_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "LAMINAR_AIR_FLOW",
    code: "LAMINAR_AIR_FLOW_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "LAMINAR_AIR_FLOW",
    code: "LAMINAR_AIR_FLOW_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "LAMINAR_AIR_FLOW",
    code: "LAMINAR_AIR_FLOW_PHYSICAL_004",
    name: "Sekering Pengaman",
    inspectionLimit: "Periksa sekering yang terdapat pada bagian luar rangkaian, apakah nilai tahanan dan tipenya sesuai dengan spesifikasi yang tertulis pada alat. Sekering pengaman harus berfungsi dengan baik.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "LAMINAR_AIR_FLOW",
    code: "LAMINAR_AIR_FLOW_PHYSICAL_005",
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "LAMINAR_AIR_FLOW",
    code: "LAMINAR_AIR_FLOW_PHYSICAL_006",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "LAMPU_OPERASI",
    code: "LAMPU_OPERASI_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "LAMPU_OPERASI",
    code: "LAMPU_OPERASI_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "LAMPU_OPERASI",
    code: "LAMPU_OPERASI_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "LAMPU_OPERASI",
    code: "LAMPU_OPERASI_PHYSICAL_004",
    name: "Tombol, Saklar dan control",
    inspectionLimit: "Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "LAMPU_OPERASI",
    code: "LAMPU_OPERASI_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "LAMPU_OPERASI",
    code: "LAMPU_OPERASI_PHYSICAL_006",
    name: "System pengunci dan penyeimbang",
    inspectionLimit: "Lakukan pemeriksaan system pengunci dan penyeimbang lampu.",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "LARYNGOSKOP",
    code: "LARYNGOSKOP_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "LARYNGOSKOP",
    code: "LARYNGOSKOP_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "LARYNGOSKOP",
    code: "LARYNGOSKOP_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "LARYNGOSKOP",
    code: "LARYNGOSKOP_PHYSICAL_004",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    code: "MEDICAL_FREEZER_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    code: "MEDICAL_FREEZER_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    code: "MEDICAL_FREEZER_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    code: "MEDICAL_FREEZER_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    code: "MEDICAL_FREEZER_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    code: "MEDICAL_REFRIGERATOR_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    code: "MEDICAL_REFRIGERATOR_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    code: "MEDICAL_REFRIGERATOR_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    code: "MEDICAL_REFRIGERATOR_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    code: "MEDICAL_REFRIGERATOR_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "MIKROSKOP_LABORATORIUM",
    code: "MIKROSKOP_LABORATORIUM_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "MIKROSKOP_LABORATORIUM",
    code: "MIKROSKOP_LABORATORIUM_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "MIKROSKOP_LABORATORIUM",
    code: "MIKROSKOP_LABORATORIUM_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "MIKROSKOP_LABORATORIUM",
    code: "MIKROSKOP_LABORATORIUM_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "MIKROSKOP_LABORATORIUM",
    code: "MIKROSKOP_LABORATORIUM_PHYSICAL_005",
    name: "Lensa okuler",
    inspectionLimit: "Cek lensa okuler terpasang dengan baik, pastikan penguncinya bersih.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "MIKROSKOP_LABORATORIUM",
    code: "MIKROSKOP_LABORATORIUM_PHYSICAL_006",
    name: "Lensa Objective",
    inspectionLimit: "Cek kebersihan lensa, pastikan lensa bersih. Putar pemilihan lensa objective baik.",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    code: "NEBULIZER_COMPRESSOR_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    code: "NEBULIZER_COMPRESSOR_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    code: "NEBULIZER_COMPRESSOR_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    code: "NEBULIZER_COMPRESSOR_PHYSICAL_004",
    name: "Tombol, Saklar dan control",
    inspectionLimit: "Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    code: "NEBULIZER_COMPRESSOR_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "OVEN",
    code: "OVEN_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "OVEN",
    code: "OVEN_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "OVEN",
    code: "OVEN_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "OVEN",
    code: "OVEN_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "OVEN",
    code: "OVEN_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "OXYGEN_CONCENTRATORS",
    code: "OXYGEN_CONCENTRATORS_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "OXYGEN_CONCENTRATORS",
    code: "OXYGEN_CONCENTRATORS_PHYSICAL_002",
    name: "Katup dan control",
    inspectionLimit: "Sebelum mempergunakan/ mengubah ubah tombol control, periksa posisinya, jika terlihat tidak berada pada poisisnya (periksa dengan menggunakan mode pemeriksaan standra). Bandingkan dengan posisi control. Ingat pengaturan tersebut dan kembalikan pada pengaturan awal jika sudah selesai pekerjaan.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "OXYGEN_CONCENTRATORS",
    code: "OXYGEN_CONCENTRATORS_PHYSICAL_003",
    name: "Tampilan dan indicator",
    inspectionLimit: "Selama pengecekan fungsi, pastikan indicator dan tampilan layer berfungsi baik",
    sortOrder: 30,
  },
  // PATIENT_MONITOR — exact copy of BED_SIDE_MONITOR checklist (separate rows / codes)
  {
    deviceTypeCode: "PATIENT_MONITOR",
    code: "PATIENT_MONITOR_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    code: "PATIENT_MONITOR_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    code: "PATIENT_MONITOR_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    code: "PATIENT_MONITOR_PHYSICAL_004",
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    code: "PATIENT_MONITOR_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "PHOTOTHERAPY",
    code: "PHOTOTHERAPY_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "PHOTOTHERAPY",
    code: "PHOTOTHERAPY_PHYSICAL_002",
    name: "Rodan dan pengunci",
    inspectionLimit: "Jika unit bergerak dengan roda, periksa kondisinya. Pastikan dapat bergerak dan berputar, periksa rem dan kunci roda, pastikan berfungsi dengan baik",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "PHOTOTHERAPY",
    code: "PHOTOTHERAPY_PHYSICAL_003",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "PHOTOTHERAPY",
    code: "PHOTOTHERAPY_PHYSICAL_004",
    name: "Kabel catu utama (line cord)",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tuker kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "PHOTOTHERAPY",
    code: "PHOTOTHERAPY_PHYSICAL_005",
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "PLATELET_AGITATOR_INCUBATOR",
    code: "PLATELET_AGITATOR_INCUBATOR_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "PLATELET_AGITATOR_INCUBATOR",
    code: "PLATELET_AGITATOR_INCUBATOR_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "PLATELET_AGITATOR_INCUBATOR",
    code: "PLATELET_AGITATOR_INCUBATOR_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "PLATELET_AGITATOR_INCUBATOR",
    code: "PLATELET_AGITATOR_INCUBATOR_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "PLATELET_AGITATOR_INCUBATOR",
    code: "PLATELET_AGITATOR_INCUBATOR_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    code: "PULSE_OXIMETERS_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    code: "PULSE_OXIMETERS_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    code: "PULSE_OXIMETERS_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    code: "PULSE_OXIMETERS_PHYSICAL_004",
    name: "Tombol, Saklar dan kontrol",
    inspectionLimit: "Periksa semua fungsi tombol/saklar atau control, pastikn berfungsi baik.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    code: "PULSE_OXIMETERS_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    code: "PULSE_OXIMETERS_PHYSICAL_006",
    name: "Kelengkapan alat",
    inspectionLimit: "Cek kelengkapan alat, pastikan lengkap dan berfungsi baik.",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    code: "RESUSCITATORS_PULMONARY_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    code: "RESUSCITATORS_PULMONARY_PHYSICAL_002",
    name: "Selang utama sumber gas",
    inspectionLimit: "Periksa selang-selang sumber gas, apakah terlihat ada kerusakan, pastikan seluruh koneksinya terikat dengan kuat",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    code: "RESUSCITATORS_PULMONARY_PHYSICAL_003",
    name: "Tombol, saklar dan control",
    inspectionLimit: "Periksa semua fungsi tombol/saklar atau kontrol, pastikan befungsi dengan baik",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    code: "RESUSCITATORS_PULMONARY_PHYSICAL_004",
    name: "Tampilan dan indicator",
    inspectionLimit: "Selama pengecekan fungsi, pastikan indicator dan tampilan layer berfungsi baik.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    code: "RESUSCITATORS_PULMONARY_PHYSICAL_005",
    name: "System interlock gas",
    inspectionLimit: "Periksa system pengaman (interlock) gas befungsi baik",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    code: "RESUSCITATORS_PULMONARY_PHYSICAL_006",
    name: "Kelengkapan alat",
    inspectionLimit: "Cek kelengkapan alat, pastikan lengkap dan berfungsi baik.",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "ROTATOR",
    code: "ROTATOR_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "ROTATOR",
    code: "ROTATOR_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "ROTATOR",
    code: "ROTATOR_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "ROTATOR",
    code: "ROTATOR_PHYSICAL_004",
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "ROTATOR",
    code: "ROTATOR_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    code: "SPHYGMOMANOMETERS_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    code: "SPHYGMOMANOMETERS_PHYSICAL_002",
    name: "Balon tensi",
    inspectionLimit: "tabung, selang, periksa kondisi tabung, selang dan balon tensi. Pastikan tidak ada yang retak, bocor, tertekuk, maupun kotor.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    code: "SPHYGMOMANOMETERS_PHYSICAL_003",
    name: "Gauge/tabung",
    inspectionLimit: "pastikan penunjuk pada aneroid gauge bergerak turun secara lembut dan perlahan dan tidak lengket. Pada manometer air raksa, tabung raksa harus dalam keadaan bersih. Periksa juga kolom air raksa naik dan bererak secara lembut.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    code: "SPHYGMOMANOMETERS_PHYSICAL_004",
    name: "Indicator",
    inspectionLimit: "pastikan tanda meter maupun skala dalam kedaan bersih dan mudah diliat dan kaca penutup pada sphygmomanometer aneroid masih dalam kedaan utuh",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    code: "SPHYGMOMANOMETERS_PHYSICAL_005",
    name: "Konektor",
    inspectionLimit: "periksa dan pastikan semua kondisi konektor dalam kedaan baik",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    code: "SPHYGMOMANOMETERS_PHYSICAL_006",
    name: "Label",
    inspectionLimit: "periksa apakah ada label, plakat, stiker, atau kartu instruksi manual tersedia dan terbaca 374653683000 Tidak",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    code: "SPHYGMOMANOMETERS_PHYSICAL_007",
    name: "Manset",
    inspectionLimit: "pastikan semua manset dalam kondisi bagus, bersih, dan tidak sobek.",
    sortOrder: 70,
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    code: "SPHYGMOMANOMETERS_PHYSICAL_008",
    name: "Pengaturan titik 0",
    inspectionLimit: "pastikan manset tidak ada tekanan, maka aneroid gauge atau level air raksa harus berada di titik 0 (±1 mmHg). Apabila level air raksa tidak berada pada posisi 0, buang atau tambahkan air raksanya dengan hati-hati sampai air raksa berada di level 0 mmHg. Ganti aneroid gauge apabila tidak berada pada posisi 0 mmHg",
    sortOrder: 80,
  },
  {
    deviceTypeCode: "SPIROMETER",
    code: "SPIROMETER_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "SPIROMETER",
    code: "SPIROMETER_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "SPIROMETER",
    code: "SPIROMETER_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "SPIROMETER",
    code: "SPIROMETER_PHYSICAL_004",
    name: "Tombol, saklar dan control",
    inspectionLimit: "Periksa seluruhnya pastikan berfungsi baik",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "SPIROMETER",
    code: "SPIROMETER_PHYSICAL_005",
    name: "Tampilan dan indicator",
    inspectionLimit: "Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi baik",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "STERILLIZER",
    code: "STERILLIZER_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "STERILLIZER",
    code: "STERILLIZER_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "STERILLIZER",
    code: "STERILLIZER_PHYSICAL_003",
    name: "Kabel catu utama (Line cord)",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "STERILLIZER",
    code: "STERILLIZER_PHYSICAL_004",
    name: "Tombol, saklar dan kontrol",
    inspectionLimit: "Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "STERILLIZER",
    code: "STERILLIZER_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "SUCTION_PUMP",
    code: "SUCTION_PUMP_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "SUCTION_PUMP",
    code: "SUCTION_PUMP_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "SUCTION_PUMP",
    code: "SUCTION_PUMP_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "SUCTION_PUMP",
    code: "SUCTION_PUMP_PHYSICAL_004",
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit: "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "SUCTION_PUMP",
    code: "SUCTION_PUMP_PHYSICAL_005",
    name: "Tampilan dan indicator",
    inspectionLimit: "Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi baik.",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "SUCTION_PUMP",
    code: "SUCTION_PUMP_PHYSICAL_006",
    name: "Sistem pengunci pergerakan",
    inspectionLimit: "Lakukan pemeriksaan system pengunci pergerakan",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "SUCTION_PUMP",
    code: "SUCTION_PUMP_PHYSICAL_007",
    name: "Filter",
    inspectionLimit: "Periksa kondisi filter pastikan tidak kotor 374663683100Tidak Baik",
    sortOrder: 70,
  },
  {
    deviceTypeCode: "SUCTION_PUMP",
    code: "SUCTION_PUMP_PHYSICAL_008",
    name: "Motor/pompa penghisap",
    inspectionLimit: "Periksa kondisi fisik motor dan pastikan berfungsi 374654635500 Baik 374663683100 Tidak Baik",
    sortOrder: 80,
  },
  {
    deviceTypeCode: "SYRINGE_PUMP",
    code: "SYRINGE_PUMP_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "SYRINGE_PUMP",
    code: "SYRINGE_PUMP_PHYSICAL_002",
    name: "Tusuk kontak alat",
    inspectionLimit: "Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "SYRINGE_PUMP",
    code: "SYRINGE_PUMP_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "Periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "SYRINGE_PUMP",
    code: "SYRINGE_PUMP_PHYSICAL_004",
    name: "Tombol, saklar dan control",
    inspectionLimit: "Periksa seluruhnya pastikan berfungsi baik",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "SYRINGE_PUMP",
    code: "SYRINGE_PUMP_PHYSICAL_005",
    name: "Tampilan dan indicator",
    inspectionLimit: "Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi baik",
    sortOrder: 50,
  },
  {
    deviceTypeCode: "SYRINGE_PUMP",
    code: "SYRINGE_PUMP_PHYSICAL_006",
    name: "System pengunci pergerakan",
    inspectionLimit: "Lakukan pemeriksaan system pengunci pergerakan 374653683000 Tidak",
    sortOrder: 60,
  },
  {
    deviceTypeCode: "SYRINGE_PUMP",
    code: "SYRINGE_PUMP_PHYSICAL_007",
    name: "Alarm dsan system interlock.",
    inspectionLimit: "Periksa alarm dan system interlock pastikan berfungsi dengan baik.",
    sortOrder: 70,
  },
  {
    deviceTypeCode: "SYRINGE_PUMP",
    code: "SYRINGE_PUMP_PHYSICAL_008",
    name: "Motor/pompa penghisap",
    inspectionLimit: "Periksa kondisi fisik motor dan pastikan berfungsi baik/normal.",
    sortOrder: 80,
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    code: "ULTRASONIC_NEBULIZERS_PHYSICAL_001",
    name: "Badan / Permukaan",
    inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
    sortOrder: 10,
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    code: "ULTRASONIC_NEBULIZERS_PHYSICAL_002",
    name: "Kotak kontak alat",
    inspectionLimit: "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
    sortOrder: 20,
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    code: "ULTRASONIC_NEBULIZERS_PHYSICAL_003",
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
    sortOrder: 30,
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    code: "ULTRASONIC_NEBULIZERS_PHYSICAL_004",
    name: "Tombol, Saklar dan control",
    inspectionLimit: "Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal.",
    sortOrder: 40,
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    code: "ULTRASONIC_NEBULIZERS_PHYSICAL_005",
    name: "Tampilan dan indikator",
    inspectionLimit: "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
    sortOrder: 50,
  },
];

export const EXPECTED_PHYSICAL_CHECK_ITEM_COUNT = 251;
export const EXPECTED_PHYSICAL_CHECK_DEVICE_TYPE_COUNT = 45;

/** Intentional zeros — never invent items for these. */
export const PHYSICAL_CHECK_INTENTIONAL_ZERO_DEVICE_TYPE_CODES = [
  "ELECTRIC_BEDS",
] as const;

/**
 * Static dataset validation — no Prisma writes.
 * Safe for dry-run and unit tests.
 */
export function validatePhysicalCheckItemsDataset(
  items: PhysicalCheckItemSeedRow[] = PHYSICAL_CHECK_ITEMS,
): void {
  if (items.length !== EXPECTED_PHYSICAL_CHECK_ITEM_COUNT) {
    throw new Error(
      `[seed] Expected ${EXPECTED_PHYSICAL_CHECK_ITEM_COUNT} PhysicalCheckItem rows, got ${items.length}`,
    );
  }

  const deviceTypes = new Set(items.map((row) => row.deviceTypeCode));
  if (deviceTypes.size !== EXPECTED_PHYSICAL_CHECK_DEVICE_TYPE_COUNT) {
    throw new Error(
      `[seed] Expected ${EXPECTED_PHYSICAL_CHECK_DEVICE_TYPE_COUNT} DeviceTypes, got ${deviceTypes.size}`,
    );
  }

  for (const zeroCode of PHYSICAL_CHECK_INTENTIONAL_ZERO_DEVICE_TYPE_CODES) {
    if (deviceTypes.has(zeroCode)) {
      throw new Error(`[seed] ${zeroCode} must remain zero-item / unresolved — found seed rows`);
    }
  }

  if (!deviceTypes.has("COLD_CHAIN") || !deviceTypes.has("KULKAS_VAKSIN")) {
    throw new Error("[seed] Cold Chain mapping requires both COLD_CHAIN and KULKAS_VAKSIN");
  }

  const seen = new Set<string>();
  for (const row of items) {
    if (!row.deviceTypeCode || !row.code || !row.name || !row.inspectionLimit) {
      throw new Error(`[seed] Incomplete row: ${JSON.stringify(row)}`);
    }
    if (!Number.isInteger(row.sortOrder) || row.sortOrder <= 0) {
      throw new Error(`[seed] Invalid sortOrder for ${row.code}: ${row.sortOrder}`);
    }
    const key = `${row.deviceTypeCode}::${row.code}`;
    if (seen.has(key)) {
      throw new Error(`[seed] Duplicate (deviceTypeCode, code): ${key}`);
    }
    seen.add(key);
  }
}

async function seedPhysicalCheckItems(): Promise<void> {
  validatePhysicalCheckItemsDataset();

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    const byType = new Map<string, number>();
    for (const row of PHYSICAL_CHECK_ITEMS) {
      byType.set(row.deviceTypeCode, (byType.get(row.deviceTypeCode) ?? 0) + 1);
    }
    console.log(
      `[seed] dry-run OK — ${PHYSICAL_CHECK_ITEMS.length} items / ${byType.size} DeviceTypes validated; no database mutation.`,
    );
    console.log(
      `[seed] dry-run COLD_CHAIN=${byType.get("COLD_CHAIN") ?? 0}, KULKAS_VAKSIN=${byType.get("KULKAS_VAKSIN") ?? 0}.`,
    );
    console.log(
      `[seed] dry-run ELECTRIC_BEDS=0 (intentional), PATIENT_MONITOR=${byType.get("PATIENT_MONITOR") ?? 0}.`,
    );
    return;
  }

  const requiredCodes = [...new Set(PHYSICAL_CHECK_ITEMS.map((row) => row.deviceTypeCode))];
  const types = await prisma.deviceType.findMany({
    where: { code: { in: requiredCodes } },
    select: { id: true, code: true },
  });
  const idByCode = new Map(types.map((row) => [row.code, row.id]));

  const missing = requiredCodes.filter((code) => !idByCode.has(code));
  if (missing.length > 0) {
    throw new Error(
      `[seed] Missing DeviceType code(s) — create/seed DeviceType first, do not invent here: ${missing.join(", ")}`,
    );
  }

  let upserted = 0;
  for (const row of PHYSICAL_CHECK_ITEMS) {
    const deviceTypeId = idByCode.get(row.deviceTypeCode);
    if (!deviceTypeId) {
      throw new Error(`[seed] DeviceType not resolved: ${row.deviceTypeCode}`);
    }
    await prisma.devicePhysicalCheckItem.upsert({
      where: {
        deviceTypeId_code: {
          deviceTypeId,
          code: row.code,
        },
      },
      create: {
        deviceTypeId,
        code: row.code,
        name: row.name,
        inspectionLimit: row.inspectionLimit,
        sortOrder: row.sortOrder,
        isActive: true,
      },
      update: {
        name: row.name,
        inspectionLimit: row.inspectionLimit,
        sortOrder: row.sortOrder,
        isActive: true,
      },
    });
    upserted += 1;
  }

  console.log(`[seed] ${upserted} DevicePhysicalCheckItem rows upserted.`);
  await prisma.$disconnect();
}

// Only auto-run when invoked as a seed script (not when imported by tests).
if (process.argv[1]?.includes("seed-physical-check-items")) {
  seedPhysicalCheckItems().catch(async (error) => {
    console.error("[seed] Failed:", error);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
}
