import { describe, expect, it } from "vitest";

import {
  formatDocumentNumber,
  isValidDocumentNumber,
  parseDocumentNumberYearMonth,
} from "./format-document-number";
import { DOCUMENT_TYPE_PREFIX, resolveDocumentPrefix } from "./document-type-prefix";

describe("formatDocumentNumber", () => {
  it("formats PREFIX/YYYY/MM/NNNNN with zero-padded month and sequence", () => {
    const issuedAt = new Date("2026-08-15T10:00:00.000Z");

    expect(formatDocumentNumber("QUO", issuedAt, 1)).toBe("QUO/2026/08/00001");
    expect(formatDocumentNumber("QUO", issuedAt, 12)).toBe("QUO/2026/08/00012");
    expect(formatDocumentNumber("CUS", issuedAt, 99999)).toBe(
      "CUS/2026/08/99999",
    );
  });

  it("uses UTC year and month from issuedAt", () => {
    const issuedAt = new Date("2026-12-31T20:00:00.000Z");

    expect(formatDocumentNumber("CRQ", issuedAt, 3)).toBe("CRQ/2026/12/00003");
  });

  it("rejects invalid prefix or sequence", () => {
    const issuedAt = new Date("2026-08-01T00:00:00.000Z");

    expect(() => formatDocumentNumber("quo", issuedAt, 1)).toThrow(
      /Invalid prefix/,
    );
    expect(() => formatDocumentNumber("QUO", issuedAt, 0)).toThrow(
      /Invalid sequence/,
    );
    expect(() => formatDocumentNumber("QUO", issuedAt, 100000)).toThrow(
      /Invalid sequence/,
    );
  });
});

describe("isValidDocumentNumber", () => {
  it("validates approved format", () => {
    expect(isValidDocumentNumber("QUO/2026/08/00001")).toBe(true);
    expect(isValidDocumentNumber("quo/2026/08/00001")).toBe(false);
    expect(isValidDocumentNumber("QUO/2026/8/00001")).toBe(false);
    expect(isValidDocumentNumber("QUO/2026/08/1")).toBe(false);
  });
});

describe("parseDocumentNumberYearMonth", () => {
  it("parses year and month from formatted number", () => {
    expect(parseDocumentNumberYearMonth("SPK/2027/01/00001")).toEqual({
      year: 2027,
      month: 1,
    });
  });
});

describe("resolveDocumentPrefix", () => {
  it("maps locked document types to 3-letter prefixes", () => {
    expect(DOCUMENT_TYPE_PREFIX.CUSTOMER).toBe("CUS");
    expect(DOCUMENT_TYPE_PREFIX.CALIBRATION_REQUEST).toBe("CRQ");
    expect(DOCUMENT_TYPE_PREFIX.QUOTATION).toBe("QUO");
    expect(DOCUMENT_TYPE_PREFIX.PURCHASE_ORDER).toBe("PUR");
    expect(DOCUMENT_TYPE_PREFIX.WORK_ORDER).toBe("SPK");
    expect(resolveDocumentPrefix("QUOTATION")).toBe("QUO");
  });
});

describe("year reset and month transition formatting", () => {
  it("resets display month while sequence is caller-controlled", () => {
    expect(
      formatDocumentNumber("QUO", new Date("2026-12-31T00:00:00.000Z"), 99999),
    ).toBe("QUO/2026/12/99999");
    expect(
      formatDocumentNumber("QUO", new Date("2027-01-01T00:00:00.000Z"), 1),
    ).toBe("QUO/2027/01/00001");
  });

  it("continues sequence across month boundary in formatted output", () => {
    expect(
      formatDocumentNumber("QUO", new Date("2026-08-31T00:00:00.000Z"), 1),
    ).toBe("QUO/2026/08/00001");
    expect(
      formatDocumentNumber("QUO", new Date("2026-09-01T00:00:00.000Z"), 2),
    ).toBe("QUO/2026/09/00002");
  });
});
