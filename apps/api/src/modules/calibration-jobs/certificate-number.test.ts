import { describe, expect, it } from "vitest";
import {
  EXTERNAL_CERTIFICATE_NUMBER_MAX_LENGTH,
  isReservedGeneratedCertificateNumber,
  normalizeExternalCertificateNumber,
} from "./certificate-number";
import {
  buildVerificationUrl,
  generateVerificationToken,
  isWellFormedVerificationToken,
} from "./certificate-verification-token";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return (err as { response?: { code?: string } }).response?.code;
  }
  return undefined;
}

describe("normalizeExternalCertificateNumber", () => {
  it("trims and collapses whitespace but keeps the meaningful value and case verbatim", () => {
    expect(normalizeExternalCertificateNumber("  PKM-CERT-2026-00123 ")).toBe("PKM-CERT-2026-00123");
    expect(normalizeExternalCertificateNumber("Kal/2026/00123   rev.A")).toBe("Kal/2026/00123 rev.A");
  });

  it("does not force an external issuer's numbering into any fixed format", () => {
    for (const ok of ["ABC-001", "KAL/2026/00123", "12345", "PKM CERT 7.B_2", "X"]) {
      expect(normalizeExternalCertificateNumber(ok)).toBe(ok);
    }
  });

  it("requires a non-empty string", () => {
    for (const bad of [undefined, null, "", "   ", 7, {}]) {
      expect(codeOf(() => normalizeExternalCertificateNumber(bad))).toBe("CERTIFICATE_NUMBER_REQUIRED");
    }
  });

  it("enforces the maximum length after normalisation", () => {
    expect(normalizeExternalCertificateNumber("A".repeat(EXTERNAL_CERTIFICATE_NUMBER_MAX_LENGTH))).toHaveLength(
      EXTERNAL_CERTIFICATE_NUMBER_MAX_LENGTH,
    );
    expect(codeOf(() => normalizeExternalCertificateNumber("A".repeat(EXTERNAL_CERTIFICATE_NUMBER_MAX_LENGTH + 1)))).toBe(
      "CERTIFICATE_NUMBER_TOO_LONG",
    );
  });

  it("rejects unsafe characters and bad starts", () => {
    for (const bad of ["A;B", "<b>", "'; DROP", "-ABC", "/ABC", "A\u0000B", "A\nB C", "A%B", "A*B"]) {
      const code = codeOf(() => normalizeExternalCertificateNumber(bad));
      expect(code === "CERTIFICATE_NUMBER_INVALID", `${JSON.stringify(bad)} -> ${code}`).toBe(true);
    }
  });

  it("reserves the whole CRT/ namespace, not just the well-formed pattern", () => {
    for (const reserved of ["CRT/2026/09/00001", "crt/2026/09/00001", "Crt/x", "CRT/", " CRT /1", "CRT/ABC"]) {
      expect(isReservedGeneratedCertificateNumber(reserved)).toBe(true);
      expect(codeOf(() => normalizeExternalCertificateNumber(reserved))).toBe("CERTIFICATE_NUMBER_RESERVED");
    }
    // Only a leading CRT/ is reserved.
    for (const fine of ["CRT-2026-1", "CRTX/1", "ACRT/1", "CER/2026/09/00001", "XCRT/1"]) {
      expect(isReservedGeneratedCertificateNumber(fine)).toBe(false);
    }
  });
});

describe("verification token", () => {
  it("is 32 random bytes, base64url, and unique", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateVerificationToken()));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(isWellFormedVerificationToken(t)).toBe(true);
  });

  it("only accepts the 43-char base64url shape", () => {
    expect(isWellFormedVerificationToken("A".repeat(43))).toBe(true);
    expect(isWellFormedVerificationToken("A".repeat(42))).toBe(false);
    expect(isWellFormedVerificationToken("A".repeat(43) + "=")).toBe(false);
    expect(isWellFormedVerificationToken("../".repeat(15))).toBe(false);
    expect(isWellFormedVerificationToken(undefined)).toBe(false);
  });

  it("builds the verification URL from the configured portal origin and never invents one", () => {
    const t = "T".repeat(43);
    expect(buildVerificationUrl(t, { NEXT_PUBLIC_CUSTOMER_PORTAL_URL: "https://customer.kalibrasimedika.co.id/" } as never)).toBe(
      `https://customer.kalibrasimedika.co.id/verify/certificate/${t}`,
    );
    expect(buildVerificationUrl(t, {} as never)).toBeNull();
    expect(buildVerificationUrl(t, { NEXT_PUBLIC_CUSTOMER_PORTAL_URL: "  " } as never)).toBeNull();
  });
});
