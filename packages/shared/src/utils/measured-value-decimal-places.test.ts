import { describe, expect, it } from "vitest";
import {
  fractionalDigitCount,
  isMeasuredValueNumericShape,
  measuredValueDecimalPlacesExceededMessage,
  respectsDecimalPlaces,
  validateMeasuredValuePrecision,
} from "./measured-value-decimal-places";

describe("fractionalDigitCount", () => {
  it("counts digits after the decimal separator from text", () => {
    expect(fractionalDigitCount("23")).toBe(0);
    expect(fractionalDigitCount("23.0")).toBe(1);
    expect(fractionalDigitCount("23.20")).toBe(2);
    expect(fractionalDigitCount("23.23")).toBe(2);
    expect(fractionalDigitCount("-3.25")).toBe(2);
    expect(fractionalDigitCount(" 12.0 ")).toBe(1);
  });

  it("returns null for non-plain decimals", () => {
    expect(fractionalDigitCount("")).toBeNull();
    expect(fractionalDigitCount("12,0")).toBeNull();
    expect(fractionalDigitCount("abc")).toBeNull();
    expect(fractionalDigitCount("1e2")).toBeNull();
  });
});

describe("respectsDecimalPlaces", () => {
  it("treats null/undefined as no restriction", () => {
    expect(respectsDecimalPlaces("23.234567", null)).toBe(true);
    expect(respectsDecimalPlaces("23.234567", undefined)).toBe(true);
  });

  it("enforces decimalPlaces = 0", () => {
    expect(respectsDecimalPlaces("23", 0)).toBe(true);
    expect(respectsDecimalPlaces("23.0", 0)).toBe(false);
    expect(respectsDecimalPlaces("23.2", 0)).toBe(false);
  });

  it("enforces decimalPlaces = 1", () => {
    expect(respectsDecimalPlaces("23", 1)).toBe(true);
    expect(respectsDecimalPlaces("23.0", 1)).toBe(true);
    expect(respectsDecimalPlaces("23.2", 1)).toBe(true);
    expect(respectsDecimalPlaces("23.23", 1)).toBe(false);
  });

  it("enforces decimalPlaces = 2", () => {
    expect(respectsDecimalPlaces("23", 2)).toBe(true);
    expect(respectsDecimalPlaces("23.2", 2)).toBe(true);
    expect(respectsDecimalPlaces("23.23", 2)).toBe(true);
    expect(respectsDecimalPlaces("23.234", 2)).toBe(false);
  });
});

describe("validateMeasuredValuePrecision", () => {
  it("distinguishes invalid format from excess decimals", () => {
    expect(validateMeasuredValuePrecision("12,0", 1)).toEqual({
      ok: false,
      reason: "invalid_format",
    });
    expect(validateMeasuredValuePrecision("23.23", 1)).toEqual({
      ok: false,
      reason: "decimal_places_exceeded",
      decimalPlaces: 1,
    });
    expect(validateMeasuredValuePrecision("23.2", 1)).toEqual({ ok: true });
    expect(validateMeasuredValuePrecision("23.234", null)).toEqual({ ok: true });
  });

  it("preserves existing numeric-shape acceptance", () => {
    expect(isMeasuredValueNumericShape("120")).toBe(true);
    expect(isMeasuredValueNumericShape("-3.25")).toBe(true);
    expect(isMeasuredValueNumericShape(" 12.0 ")).toBe(true);
    expect(isMeasuredValueNumericShape("")).toBe(false);
  });
});

describe("measuredValueDecimalPlacesExceededMessage", () => {
  it("returns Indonesian copy for 0 and N", () => {
    expect(measuredValueDecimalPlacesExceededMessage(0)).toMatch(/bilangan bulat/);
    expect(measuredValueDecimalPlacesExceededMessage(1)).toBe(
      "Maksimal 1 angka di belakang koma.",
    );
  });
});
