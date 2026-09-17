import { describe, expect, it } from "vitest";
import {
  deviceDescriptionLines,
  quotationAddresseeLine,
  quotationPdfFilename,
  shouldRenderTaxLine,
} from "./quotation-pdf";

describe("quotationAddresseeLine", () => {
  it("uses Bapak/Ibu and the primary contact name", () => {
    expect(
      quotationAddresseeLine({
        contacts: [
          { name: "Andi Wijaya", isPrimary: false },
          { name: "Siti Rahayu", isPrimary: true },
        ],
      }),
    ).toBe("Bapak/Ibu Siti Rahayu");
  });

  it("falls back to the first contact when none is primary", () => {
    expect(
      quotationAddresseeLine({
        contacts: [{ name: "Andi Wijaya", isPrimary: false }],
      }),
    ).toBe("Bapak/Ibu Andi Wijaya");
  });

  it("does not substitute the company name when no contact exists", () => {
    expect(quotationAddresseeLine({ contacts: [] })).toBe("Contact person belum terdaftar");
  });
});

describe("quotationPdfFilename", () => {
  it("formats PKM-QUO-YYYYMMDD-sequence from the quotation number and issue date", () => {
    expect(
      quotationPdfFilename({
        number: "QUO/2026/08/00001",
        companyId: "PKM",
        issuedAt: "2026-08-27T03:00:00.000Z",
      }),
    ).toBe("PKM-QUO-20260827-00001.pdf");
  });
});

describe("shouldRenderTaxLine", () => {
  it("hides the tax line when the tax is Include (isExclude false) — total is already inclusive", () => {
    expect(
      shouldRenderTaxLine({ taxCode: "T2", taxAmount: 99000, taxIsExclude: false }),
    ).toBe(false);
  });

  it("keeps the tax line when the tax is Exclude", () => {
    expect(shouldRenderTaxLine({ taxCode: "T1", taxAmount: 99000, taxIsExclude: true })).toBe(true);
  });

  it("keeps the tax line when the tax mode is unknown (code no longer resolvable)", () => {
    expect(shouldRenderTaxLine({ taxCode: "T1", taxAmount: 99000, taxIsExclude: null })).toBe(true);
    expect(shouldRenderTaxLine({ taxCode: "T1", taxAmount: 99000 })).toBe(true);
  });

  it("hides the tax line when there is no tax at all, as before", () => {
    expect(shouldRenderTaxLine({ taxCode: "", taxAmount: null })).toBe(false);
  });
});

describe("deviceDescriptionLines", () => {
  it("prints the customer alias above the master device name", () => {
    expect(
      deviceDescriptionLines({
        description: "Kalibrasi Tensimeter",
        customerDeviceName: "tensimeter digital",
        deviceTypeName: "Blood Pressure Monitor",
      }),
    ).toEqual(["Kalibrasi Tensimeter", "tensimeter digital", "Blood Pressure Monitor"]);
  });

  it("prints the master name alone when there is no alias, as before", () => {
    expect(
      deviceDescriptionLines({
        description: "Kalibrasi Tensimeter",
        deviceTypeName: "Blood Pressure Monitor",
      }),
    ).toEqual(["Kalibrasi Tensimeter", "Blood Pressure Monitor"]);
  });

  it("never repeats a name that already reads as the line description", () => {
    expect(
      deviceDescriptionLines({
        description: "Blood Pressure Monitor",
        customerDeviceName: "Blood Pressure Monitor",
        deviceTypeName: "Blood Pressure Monitor",
      }),
    ).toEqual(["Blood Pressure Monitor"]);
  });
});
