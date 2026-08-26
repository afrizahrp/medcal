import { describe, expect, it } from "vitest";
import { quotationAddresseeLine, quotationPdfFilename } from "./quotation-pdf";

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
