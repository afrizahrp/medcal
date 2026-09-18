import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderKontrolAlatPdf, type KontrolAlatPdfInput } from "./kontrol-alat-pdf";

function pdfDecodedText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const chunks: string[] = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    let ops = "";
    try {
      ops = inflateSync(Buffer.from(match[1] ?? "", "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const hex of ops.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const h = hex[1] ?? "";
      if (h.length % 2 !== 0) continue;
      chunks.push(Buffer.from(h, "hex").toString("latin1"));
    }
  }
  return chunks.join("");
}

function makeInput(overrides: Partial<KontrolAlatPdfInput["kontrolAlat"]> = {}): KontrolAlatPdfInput {
  return {
    company: {
      id: "PKM",
      name: "PT Presisi Kalibrasi Medika",
      legalName: "PT PRESISI KALIBRASI MEDIKA",
    },
    job: {
      unitOrdinal: 1,
      unitTotal: 2,
      startedAt: new Date("2026-09-12T02:00:00.000Z"),
      submittedAt: null,
      deviceBrand: "BIPMED",
      deviceModel: "BCF-301",
      deviceSerial: "BCF1-VII260007",
      deviceTypeName: "Centrifuge",
    },
    workOrder: {
      number: "WOL/2026/09/00001",
      customer: { name: "RS Contoh" },
      purchaseOrder: { customerPoNumber: "65-SPH-PKM-2026" },
      requestReviewMethodOk: true,
      requestReviewEquipmentOk: true,
      requestReviewPersonnelOk: true,
      requestReviewConfirmAgree: true,
      requestReviewConfirmEmail: false,
      requestReviewConfirmLetter: false,
      requestReviewConfirmOther: false,
      requestReviewConfirmOtherText: null,
      requestReviewCompletedAt: new Date("2026-09-11T00:00:00.000Z"),
      requestReviewCompletedBy: { name: "Admin Lab" },
    },
    kontrolAlat: {
      number: "KAL/2026/09/00007",
      createdAt: new Date("2026-09-12T01:00:00.000Z"),
      workExecuted: true,
      notExecutedReason: null,
      capacity: "6 x 50 ml",
      visualPowerCable: true,
      visualDisplay: true,
      visualButtons: true,
      functionInitialOk: true,
      functionFinalOk: null,
      certificateNumber: null,
      completedAt: null,
      accessories: [{ label: "Kabel Power", present: true, sortOrder: 10 }],
      signatures: [
        {
          signerKind: "ADMINISTRATION",
          signerName: "Siti Admin",
          signedAt: new Date("2026-09-12T03:00:00.000Z"),
        },
        { signerKind: "TECHNICAL_OFFICER", signerName: "Budi Teknis", signedAt: null },
      ],
      ...overrides,
    },
    completedAt: null,
  };
}

describe("renderKontrolAlatPdf", () => {
  it("names the file from the KAL document number, not F.MU.08", async () => {
    const result = await renderKontrolAlatPdf(makeInput());
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(result.filename).toBe("PKM-KAL-20260912-00007.pdf");
    expect(result.filename).not.toContain("F.MU.08");
    expect(result.filename).not.toContain("WOL");
    const decoded = pdfDecodedText(result.buffer);
    expect(decoded).toContain("F.MU.08");
    expect(decoded).toContain("KAL/2026/09/00007");
  });

  it("renders unsigned and not-executed variants without throwing", async () => {
    const result = await renderKontrolAlatPdf(
      makeInput({
        workExecuted: false,
        notExecutedReason: "Alat tidak lengkap",
        accessories: [],
        signatures: [],
      }),
    );
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
