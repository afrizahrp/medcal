import { describe, expect, it } from "vitest";
import { canvasPixelRatio, choosePdfRenderMode } from "./pdf-render-mode";

describe("choosePdfRenderMode", () => {
  it("uses the native viewer only on a non-touch browser that reports PDF support", () => {
    expect(choosePdfRenderMode({ pdfViewerEnabled: true, coarsePointer: false })).toBe("native");
  });

  it("uses PDF.js on touch devices even when the browser claims PDF support (iOS Safari)", () => {
    expect(choosePdfRenderMode({ pdfViewerEnabled: true, coarsePointer: true })).toBe("pdfjs");
  });

  it("uses PDF.js when the browser cannot show PDFs inline (Android Chrome)", () => {
    expect(choosePdfRenderMode({ pdfViewerEnabled: false, coarsePointer: true })).toBe("pdfjs");
    expect(choosePdfRenderMode({ pdfViewerEnabled: false, coarsePointer: false })).toBe("pdfjs");
  });

  it("uses PDF.js when the browser does not expose pdfViewerEnabled at all", () => {
    expect(choosePdfRenderMode({ pdfViewerEnabled: undefined, coarsePointer: false })).toBe("pdfjs");
    expect(choosePdfRenderMode({ pdfViewerEnabled: undefined, coarsePointer: true })).toBe("pdfjs");
  });
});

describe("canvasPixelRatio", () => {
  it("follows the device pixel ratio up to 2", () => {
    expect(canvasPixelRatio(1, 390, 552)).toBe(1);
    expect(canvasPixelRatio(2, 390, 552)).toBe(2);
    expect(canvasPixelRatio(3, 390, 552)).toBe(2);
  });

  it("never goes below 1, whatever the browser reports", () => {
    expect(canvasPixelRatio(0, 390, 552)).toBe(1);
    expect(canvasPixelRatio(0.5, 390, 552)).toBe(1);
  });

  it("lowers the ratio so a very large page stays within the canvas pixel budget", () => {
    const ratio = canvasPixelRatio(2, 1000, 10_000);
    expect(ratio).toBeLessThan(2);
    expect(1000 * ratio * 10_000 * ratio).toBeLessThanOrEqual(4096 * 4096 + 1);
  });

  it("copes with a zero-sized page", () => {
    expect(canvasPixelRatio(2, 0, 0)).toBe(2);
  });
});
