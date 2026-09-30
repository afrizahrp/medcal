import { describe, expect, it } from "vitest";
import { formatDate, isPlausibleToken, presentStatus } from "./certificate-verification";

describe("presentStatus", () => {
  it("tells the reader the actual state, not merely that a certificate exists", () => {
    expect(presentStatus("VALID")).toMatchObject({ tone: "ok", label: "Sertifikat valid" });
    expect(presentStatus("EXPIRED")).toMatchObject({ tone: "warn", label: "Sertifikat kedaluwarsa" });
    expect(presentStatus("REVOKED")).toMatchObject({ tone: "bad", label: "Sertifikat dicabut" });
    expect(presentStatus("SUPERSEDED")).toMatchObject({ tone: "bad", label: "Sertifikat telah diganti" });
    const labels = new Set(
      (["VALID", "EXPIRED", "REVOKED", "SUPERSEDED"] as const).map((s) => presentStatus(s).label),
    );
    expect(labels.size).toBe(4);
  });
});

describe("isPlausibleToken", () => {
  it("accepts only the 43-char base64url shape", () => {
    expect(isPlausibleToken("A".repeat(43))).toBe(true);
    expect(isPlausibleToken("a-_".repeat(14) + "a")).toBe(true);
    expect(isPlausibleToken("A".repeat(42))).toBe(false);
    expect(isPlausibleToken("A".repeat(44))).toBe(false);
    expect(isPlausibleToken("A".repeat(42) + "/")).toBe(false);
    expect(isPlausibleToken("")).toBe(false);
  });
});

describe("formatDate", () => {
  it("formats in Asia/Jakarta and tolerates null/invalid", () => {
    // 2026-09-30 17:30Z is already 1 Oktober in Jakarta.
    expect(formatDate("2026-09-30T17:30:00.000Z")).toBe("1 Oktober 2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});
