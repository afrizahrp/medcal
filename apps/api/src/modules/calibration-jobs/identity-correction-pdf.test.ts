import { describe, expect, it } from "vitest";
import type { Company } from "@medcal/db";
import { renderIdentityCorrectionPdf } from "./identity-correction-pdf";
import type { IdentityCorrectionDetail } from "./calibration-jobs.service";

const company: Company = {
  id: "PKM",
  name: "PT Presisi Kalibrasi Medika",
  legalName: "PT PRESISI KALIBRASI MEDIKA",
  taxId: "01.234.567.8-999.000",
  address: "Jakarta Timur",
  phone: "021-1234567",
  email: "info@pkm.co.id",
  status: "ACTIVE",
  settingsJson: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const job = {
  workOrder: { number: "SPK/2026/08/00001" },
  customerDeclaredDeviceName: "Centrifuge BIPMED BCF-301",
  customerDeclaredAkdAkl: "AKL 20301234567",
};

function makeCorrection(
  overrides: Partial<IdentityCorrectionDetail> = {},
): IdentityCorrectionDetail {
  return {
    id: "ic-1",
    companyId: "PKM",
    calibrationJobId: "job-1",
    number: "BAI/2026/09/00003",
    status: "PENDING_REVIEW",
    prevDeviceId: null,
    newDeviceId: "device-2",
    prevSerial: "OLD-SERIAL-01",
    newSerial: "NEW-SERIAL-02",
    prevAkdAkl: null,
    newAkdAkl: null,
    reason:
      "Serial number pada label fisik alat berbeda dari yang tercantum pada dokumen permintaan pelanggan. Teknisi mengonfirmasi langsung ke pelanggan di lokasi.",
    submittedByUserId: "user-tech",
    decidedByUserId: null,
    decidedAt: null,
    decisionNote: null,
    akdAklGateReopened: false,
    createdAt: new Date("2026-09-05T02:00:00.000Z"),
    updatedAt: new Date("2026-09-05T02:00:00.000Z"),
    submittedBy: { id: "user-tech", name: "Farras Zuhdi" },
    decidedBy: null,
    prevDevice: null,
    newDevice: { id: "device-2", code: "DEV-002", serialNumber: "NEW-SERIAL-02" },
    signatures: [
      {
        id: "sig-tech",
        companyId: "PKM",
        identityCorrectionId: "ic-1",
        signerRole: "TECHNICIAN",
        signerName: "Farras Zuhdi",
        fileObjectId: null,
        status: "SIGNED",
        unavailableReason: null,
        signedAt: new Date("2026-09-05T02:00:00.000Z"),
        createdAt: new Date("2026-09-05T02:00:00.000Z"),
        updatedAt: new Date("2026-09-05T02:00:00.000Z"),
      },
      {
        id: "sig-cust",
        companyId: "PKM",
        identityCorrectionId: "ic-1",
        signerRole: "CUSTOMER",
        signerName: "Ridwan",
        fileObjectId: null,
        status: "SIGNED",
        unavailableReason: null,
        signedAt: new Date("2026-09-05T02:00:00.000Z"),
        createdAt: new Date("2026-09-05T02:00:00.000Z"),
        updatedAt: new Date("2026-09-05T02:00:00.000Z"),
      },
    ],
    files: [],
    ...overrides,
  } as IdentityCorrectionDetail;
}

// Minimal 1x1 PNG.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe("renderIdentityCorrectionPdf", () => {
  it("renders a PENDING_REVIEW BA with no photo yet", async () => {
    const result = await renderIdentityCorrectionPdf({
      correction: makeCorrection(),
      job,
      company,
      photo: null,
    });

    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.filename).toBe("PKM-BAI-20260905-00003.pdf");
    expect(pageCount(result.buffer)).toBe(1);
  });

  it("embeds an image photo", async () => {
    const result = await renderIdentityCorrectionPdf({
      correction: makeCorrection({
        files: [{ id: "file-1", originalName: "foto-ba.png", mimeType: "image/png" }],
      }),
      job,
      company,
      photo: { buffer: TINY_PNG, mimeType: "image/png", originalName: "foto-ba.png" },
    });

    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("prints a note instead of embedding a PDF attachment", async () => {
    const result = await renderIdentityCorrectionPdf({
      correction: makeCorrection({
        files: [{ id: "file-1", originalName: "foto-ba.pdf", mimeType: "application/pdf" }],
      }),
      job,
      company,
      photo: { buffer: Buffer.from("%PDF-1.4"), mimeType: "application/pdf", originalName: "foto-ba.pdf" },
    });

    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders a decided (APPROVED) BA with decision fields", async () => {
    const result = await renderIdentityCorrectionPdf({
      correction: makeCorrection({
        status: "APPROVED",
        decidedByUserId: "user-mgr",
        decidedBy: { id: "user-mgr", name: "Budi Santoso" },
        decidedAt: new Date("2026-09-06T04:00:00.000Z"),
        decisionNote: "Sesuai foto BA dan konfirmasi pelanggan.",
      }),
      job,
      company,
      photo: null,
    });

    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("does not throw when nothing was signed and there is no photo", async () => {
    const result = await renderIdentityCorrectionPdf({
      correction: makeCorrection({
        signatures: [
          {
            id: "sig-tech",
            companyId: "PKM",
            identityCorrectionId: "ic-1",
            signerRole: "TECHNICIAN",
            signerName: null,
            fileObjectId: null,
            status: "UNAVAILABLE",
            unavailableReason: "Teknisi lupa membawa alat tulis.",
            signedAt: null,
            createdAt: new Date("2026-09-05T02:00:00.000Z"),
            updatedAt: new Date("2026-09-05T02:00:00.000Z"),
          },
          {
            id: "sig-cust",
            companyId: "PKM",
            identityCorrectionId: "ic-1",
            signerRole: "CUSTOMER",
            signerName: null,
            fileObjectId: null,
            status: "REFUSED",
            unavailableReason: "Pelanggan menolak menandatangani sebelum verifikasi ulang.",
            signedAt: null,
            createdAt: new Date("2026-09-05T02:00:00.000Z"),
            updatedAt: new Date("2026-09-05T02:00:00.000Z"),
          },
        ],
      }),
      job,
      company,
      photo: null,
    });

    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("wraps a long reason and multi-row change table without throwing", async () => {
    const result = await renderIdentityCorrectionPdf({
      correction: makeCorrection({
        reason: "Sangat panjang. ".repeat(60),
        newDeviceId: "device-2",
        newSerial: "NEW-SERIAL-02",
        newAkdAkl: "AKL 99999999999",
        prevAkdAkl: "AKL 11111111111",
      }),
      job,
      company,
      photo: null,
    });

    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
