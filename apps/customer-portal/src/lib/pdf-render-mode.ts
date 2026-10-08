/**
 * How the certificate PDF is shown inline.
 *
 * "native"  — the browser's own PDF viewer inside an <iframe>. Used only where
 *             the browser reports it can show PDFs inline AND the device is not
 *             touch-first: Android Chrome has no inline viewer (the iframe
 *             stays blank and the file is downloaded instead) and iOS Safari
 *             shows a single page, so touch devices never use it.
 * "pdfjs"   — pages drawn onto canvases by PDF.js; works in every browser.
 */
export type PdfRenderMode = "native" | "pdfjs";

export interface PdfEnvironment {
  /** navigator.pdfViewerEnabled — undefined in browsers that predate the property. */
  pdfViewerEnabled: boolean | undefined;
  /** matchMedia("(pointer: coarse)") — the primary input is a finger. */
  coarsePointer: boolean;
}

export function choosePdfRenderMode(env: PdfEnvironment): PdfRenderMode {
  return env.pdfViewerEnabled === true && !env.coarsePointer ? "native" : "pdfjs";
}

/** Device pixel ratio above this adds memory but no visible sharpness on a phone. */
const MAX_PIXEL_RATIO = 2;

/** iOS Safari draws nothing on a canvas larger than 4096 x 4096 pixels. */
const MAX_CANVAS_PIXELS = 4096 * 4096;

/**
 * Output scale for a canvas that is shown `cssWidth` x `cssHeight` CSS pixels
 * large: the device pixel ratio, capped so the canvas stays inside the
 * pixel budget (a very tall or large-format page is drawn less sharply
 * instead of not at all).
 */
export function canvasPixelRatio(deviceRatio: number, cssWidth: number, cssHeight: number): number {
  const wanted = Math.min(Math.max(deviceRatio, 1), MAX_PIXEL_RATIO);
  const area = cssWidth * cssHeight;
  if (area <= 0) return wanted;
  return Math.min(wanted, Math.sqrt(MAX_CANVAS_PIXELS / area));
}
