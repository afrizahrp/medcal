import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as ExcelJS from "exceljs";

/**
 * Regenerates the downloadable "Import Requisition dari Excel" template that the
 * portal serves from apps/portal/public/medcal-requisition-template.xlsx.
 *
 * The column headers here MUST stay in lock-step with the importer's contract in
 * calibration-request-import.service.ts (HEADER_ALIASES) — "Nama Alat" and "Qty"
 * are required, "Model", "Device ID" and "AKD/AKL/NIE" are optional. Run after
 * any change to that contract:
 *
 *   pnpm --filter @medcal/api run template:requisition
 */
const OUT = resolve(__dirname, "../../portal/public/medcal-requisition-template.xlsx");

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MEDCAL";
  workbook.created = new Date();

  // ── Sheet 1: the data template ────────────────────────────────────────────
  const data = workbook.addWorksheet("Data Alat");
  data.columns = [
    { header: "Nama Alat", key: "namaAlat", width: 32 },
    { header: "Model", key: "model", width: 20 },
    { header: "Qty", key: "qty", width: 10 },
    { header: "Device ID", key: "deviceId", width: 22 },
    { header: "AKD/AKL/NIE", key: "akdAkl", width: 24 },
  ];
  data.getRow(1).font = { bold: true };
  data.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFF4FF" },
  };

  // Example rows — clearly labelled as examples in the first column.
  data.addRow({
    namaAlat: "Contoh: Tensimeter",
    model: "AB-123",
    qty: 5,
    deviceId: "",
    akdAkl: "",
  });
  data.addRow({
    namaAlat: "Contoh: Bed Side Monitor",
    model: "BSM-501",
    qty: 3,
    deviceId: "BSM001",
    akdAkl: "",
  });
  data.addRow({
    namaAlat: "Contoh: Dental Unit",
    model: "",
    qty: 1,
    deviceId: "",
    akdAkl: "AKD 20403012345",
  });

  const note = data.addRow({
    namaAlat: "Hapus baris contoh di atas, lalu isi data alat customer mulai dari sini.",
  });
  note.font = { italic: true, color: { argb: "FF7A7A7A" } };
  data.mergeCells(`A${note.number}:E${note.number}`);

  // ── Sheet 2: "Petunjuk" ───────────────────────────────────────────────────
  const guide = workbook.addWorksheet("Petunjuk");
  guide.columns = [{ width: 100 }];
  const lines: Array<{ text: string; bold?: boolean }> = [
    { text: "Petunjuk Pengisian Template Import Requisition", bold: true },
    { text: "" },
    { text: "Kolom:", bold: true },
    { text: '• Nama Alat  : WAJIB. Nama alat sebagaimana disebut customer (mis. "Tensimeter").' },
    { text: "• Model      : OPSIONAL. Model alat dari customer jika ada." },
    {
      text:
        "• Qty        : WAJIB. Jumlah unit alat pada baris ini (bilangan bulat positif, " +
        "mis. 1, 3, 10).",
    },
    {
      text:
        "• Device ID  : OPSIONAL. Isi hanya jika customer memberikan Device ID. " +
        "Satu baris hanya boleh berisi satu Device ID.",
    },
    {
      text:
        "• AKD/AKL/NIE: OPSIONAL. Nomor Izin Edar yang diberikan customer " +
        "(maks. 120 karakter). Boleh diisi untuk Qty berapa pun. " +
        "Kosongkan jika customer belum memberikan.",
    },
    { text: "" },
    { text: "Aturan penting:", bold: true },
    {
      text:
        "• Setiap baris Excel menjadi 1 item requisition. Qty tetap tersimpan sebagai jumlah " +
        "unit pada item tersebut — baris TIDAK dipecah menjadi beberapa item.",
    },
    {
      text:
        "• AKD/AKL/NIE yang diisi adalah deklarasi customer, bukan hasil verifikasi teknis " +
        "per unit fisik. Verifikasi final per unit dilakukan kemudian oleh Teknisi.",
    },
    { text: "• Jangan invent/membuat placeholder Device ID." },
    {
      text:
        '• Jangan gunakan "000", "-", "N/A", atau nilai dummy lain untuk Device ID ' +
        "yang tidak diberikan customer — biarkan kosong.",
    },
    { text: "" },
    {
      text:
        'Setelah unggah, sistem akan mencocokkan "Nama Alat" ke Device Type MEDCAL ' +
        "(termasuk lewat alias). Baris yang tidak cocok harus dipetakan manual di halaman preview " +
        "sebelum requisition dibuat.",
    },
  ];
  for (const line of lines) {
    const row = guide.addRow([line.text]);
    if (line.bold) row.font = { bold: true };
  }

  mkdirSync(dirname(OUT), { recursive: true });
  await workbook.xlsx.writeFile(OUT);
  console.log(`[template] wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
