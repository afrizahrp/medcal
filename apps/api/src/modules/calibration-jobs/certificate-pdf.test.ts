import { describe, expect, it, vi } from "vitest";

// Spy on the real QR encoder so the test can assert WHAT gets encoded.
vi.mock("qrcode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("qrcode")>();
  const real = (actual as unknown as { default: typeof import("qrcode") }).default ?? actual;
  return { default: { ...real, toBuffer: vi.fn(real.toBuffer.bind(real)) } };
});

import QRCode from "qrcode";
import { formatCertificateDate, generatedCertificateFilename, renderGeneratedCertificatePdf } from "./certificate-pdf";

const URL_TOKEN = "Q".repeat(43);
const VERIFICATION_URL = `https://customer.example.test/verify/certificate/${URL_TOKEN}`;

const INPUT = {
  number: "CRT/2026/09/00001",
  issuedAt: new Date("2026-09-30T17:30:00.000Z"),
  validUntil: new Date("2027-09-30T05:00:00.000Z"),
  companyName: "PT Contoh Kalibrasi",
  customerName: "RS Mintohardjo",
  device: { name: "Bed Side Monitor", brand: "Mindray", model: "uMEC12", serialNumber: "SN-123", code: "DVC-000001" },
  verificationUrl: VERIFICATION_URL,
};

/**
 * Text of an UNCOMPRESSED pdfkit page: standard fonts write text as hex
 * strings inside TJ arrays (split by kerning); concatenate the hex groups of
 * each TJ operator and decode them.
 */
function extractPdfLines(pdf: Buffer): string[] {
  const raw = pdf.toString("latin1");
  const lines: string[] = [];
  for (const match of raw.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    const hex = [...match[1]!.matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => m[1]).join("");
    lines.push(Buffer.from(hex, "hex").toString("latin1"));
  }
  return lines;
}

describe("renderGeneratedCertificatePdf", () => {
  it("prints the actual certificate number, identity fields and dates (Asia/Jakarta)", async () => {
    const pdf = await renderGeneratedCertificatePdf(INPUT, { compress: false });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const lines = extractPdfLines(pdf);
    expect(lines).toContain("Nomor: CRT/2026/09/00001");
    expect(lines).toContain("RS Mintohardjo");
    expect(lines).toContain("Bed Side Monitor");
    expect(lines).toContain("SN-123");
    // 2026-09-30 17:30Z is already 1 Oktober in Jakarta.
    expect(lines).toContain("1 Oktober 2026");
    expect(lines).toContain(formatCertificateDate(INPUT.validUntil));
  });

  it("omits valid-until when the certificate has none, and never invents fields", async () => {
    const pdf = await renderGeneratedCertificatePdf(
      { ...INPUT, validUntil: null, device: { ...INPUT.device, brand: null, model: null, serialNumber: null } },
      { compress: false },
    );
    const lines = extractPdfLines(pdf);
    expect(lines).not.toContain("Berlaku sampai");
    expect(lines).not.toContain("Merek");
    expect(lines).not.toContain("Nomor seri");
  });

  it("encodes ONLY the verification URL in the QR and embeds it as an image, printing the same URL", async () => {
    const toBuffer = vi.mocked(QRCode.toBuffer);
    toBuffer.mockClear();

    const pdf = await renderGeneratedCertificatePdf(INPUT, { compress: false });

    expect(toBuffer).toHaveBeenCalledTimes(1);
    // The payload is the bare URL (a locator) - no certificate data, number or ids.
    expect(toBuffer.mock.calls[0]![0]).toBe(VERIFICATION_URL);
    expect(VERIFICATION_URL).not.toContain(encodeURIComponent(INPUT.number));

    const raw = pdf.toString("latin1");
    expect(raw).toContain("/Subtype /Image");
    // The long URL wraps across text lines; stitch them back together.
    expect(extractPdfLines(pdf).join("")).toContain(VERIFICATION_URL);
  });

  it("names the stored file after the number, path-safe", () => {
    expect(generatedCertificateFilename("CRT/2026/09/00001")).toBe("CRT-2026-09-00001.pdf");
  });
});
