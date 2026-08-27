# VERIFIKASI PRODUCTION (READ-ONLY) — Device Management

## PERHATIAN KHUSUS — baca dulu sebelum mulai

Ini adalah task PERTAMA sepanjang proyek ini yang menyentuh server PRODUCTION, bukan database
lokal `pkmdb` seperti biasanya. Karena itu:

1. **Konfirmasi dulu kamu (Cursor) benar-benar punya akses ke server production** (lewat SSH
   terminal, atau mekanisme apapun yang tersedia). Kalau tidak ada akses sama sekali, STOP dan
   laporkan itu — jangan mencoba cara lain untuk "mengakali" akses.
2. **HANYA jalankan query SELECT/COUNT.** JANGAN jalankan `docker compose exec` dengan command
   apapun selain query read-only di bawah. JANGAN jalankan `prisma migrate`, `seed`,
   `backfill`, atau perintah tulis apapun — meski hasil verifikasi nanti menunjukkan ada data
   yang kurang/tidak sesuai. Task ini MURNI untuk melihat kondisi, bukan memperbaiki.
3. Kalau ragu sama sekali command yang mau dijalankan itu read-only atau tidak, JANGAN
   jalankan — laporkan dan tanya dulu.
4. Command yang dipakai untuk connect ke production adalah pola yang sama seperti yang
   project owner sudah pakai sebelumnya:
   ```
   docker compose --env-file .env.production -f docker-compose.prod.yml exec api \
     sh -c 'psql "$DATABASE_URL" -c "..."'
   ```
   Gunakan pola ini (atau `npx prisma studio` kalau lebih mudah untuk sekadar melihat data),
   ganti isinya dengan query di bawah.

## Query yang dijalankan (semua read-only)

### 1. Migration yang sudah ter-apply
```sql
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 20;
```
Cek apakah ada migration yang menambah `deviceTypeId` ke `Device`, migration yang menambah
`valueType`/`toleranceMin`/`toleranceMax`/`toleranceNote` ke `DeviceCalibrationParameter`, dan
migration yang menambah tabel `JobReferenceEquipmentUsed`.

### 2. Jumlah baris tiap tabel
```sql
SELECT
  (SELECT COUNT(*) FROM "DeviceCategory") AS categories,
  (SELECT COUNT(*) FROM "DeviceType") AS device_types,
  (SELECT COUNT(*) FROM "Uom") AS uoms,
  (SELECT COUNT(*) FROM "DeviceCapability") AS capabilities,
  (SELECT COUNT(*) FROM "DeviceCapabilityItem") AS capability_items,
  (SELECT COUNT(*) FROM "DeviceCalibrationParameter") AS calibration_parameters;
```
Bandingkan dengan angka yang seharusnya (kondisi dev/staging terakhir): Category=13,
DeviceType=59, Uom=46, Capability=30, CapabilityItem=98, CalibrationParameter=489.

### 3. Toleransi benar-benar terisi
```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE "toleranceMin" IS NOT NULL OR "toleranceMax" IS NOT NULL) AS has_numeric_tolerance,
  COUNT(*) FILTER (WHERE "toleranceNote" IS NOT NULL) AS has_note
FROM "DeviceCalibrationParameter";
```

### 4. Nama sudah Bahasa Indonesia
```sql
SELECT code, name FROM "DeviceCapability" WHERE code = 'ELECTRICAL_SAFETY';
SELECT code, name FROM "DeviceCapabilityItem" WHERE code = 'PROTECTIVE_EARTH_RESISTANCE';
```
Seharusnya "Keselamatan Listrik" dan "Resistansi Pembumian Protektif" — bukan versi Inggris.

### 5. Pattern-C split sudah benar
```sql
SELECT code, "toleranceMin", "toleranceMax", "toleranceNote"
FROM "DeviceCalibrationParameter" WHERE code LIKE 'ACLV_STER_TEMP%';
```
Seharusnya 2 baris (`ACLV_STER_TEMP_121`, `ACLV_STER_TEMP_134`), bukan 1 baris lama yang
`toleranceMin`/`Max`-nya NULL.

## Output

Laporkan hasil kelima query di atas apa adanya (angka/isi mentah, jangan diringkas atau
disimpulkan sendiri) — analisis dan kesimpulan langkah berikutnya akan dilakukan terpisah
setelah melihat hasilnya. Konfirmasi juga secara eksplisit: tidak ada satupun command tulis
yang dijalankan di task ini.
