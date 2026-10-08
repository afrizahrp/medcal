"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { ApiError, apiFetchBlob } from "@medcal/shared";
import { pdfLoadErrorMessage } from "../lib/certificate-verification";
import { isUnauthorizedError } from "../lib/customer-query";
import { canvasPixelRatio, choosePdfRenderMode } from "../lib/pdf-render-mode";
import { expireSession } from "../lib/session";
import { linkAction } from "../lib/ui-classes";
import { ErrorState, LoadingState } from "./status-blocks";

type ViewerState =
  | { phase: "loading" }
  | { phase: "native"; url: string }
  | { phase: "canvas"; url: string; blob: Blob }
  | { phase: "error"; message: string };

/** Bundled with the app (public/pdfjs/standard_fonts) so the un-embedded Helvetica of our own certificates looks the same on every device. */
const STANDARD_FONT_URL = "/pdfjs/standard_fonts/";

const LOADING_LABEL = "Memuat sertifikat…";

/**
 * Draws every page of the PDF onto a canvas, top to bottom, page 1 first, and
 * shows the first page as soon as it is ready. Used where the browser has no
 * usable inline PDF viewer (see pdf-render-mode.ts). PDF.js is imported only
 * here, so it is never downloaded where the native viewer is used.
 *
 * Everything started here is released on cleanup — the in-flight page render,
 * the document and its worker — and a cancelled run never touches the DOM
 * again, so React StrictMode's mount/cleanup/mount cannot leave a second copy
 * of the pages behind.
 */
function PdfCanvasPages({ blob, onError }: { blob: Blob; onError: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [firstPageShown, setFirstPageShown] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    let renderTask: RenderTask | null = null;
    setFirstPageShown(false);

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({
          data,
          isEvalSupported: false,
          standardFontDataUrl: STANDARD_FONT_URL,
          useSystemFonts: false,
        });
        const pdf = await task.promise;
        if (cancelled) return;

        const cssWidth = host.clientWidth || window.innerWidth;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const natural = page.getViewport({ scale: 1 });
          const fit = cssWidth / natural.width;
          const ratio = canvasPixelRatio(window.devicePixelRatio || 1, cssWidth, natural.height * fit);
          const viewport = page.getViewport({ scale: fit * ratio });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "block h-auto w-full rounded-md border border-slate-200 bg-white";
          host.appendChild(canvas);

          renderTask = page.render({ canvas, viewport });
          await renderTask.promise;
          renderTask = null;
          page.cleanup();
          if (cancelled) return;
          if (pageNumber === 1) setFirstPageShown(true);
        }
        // Every page is on screen: release the document and its worker now.
        void task.destroy();
      } catch {
        // A run that was cancelled by cleanup rejects on purpose; that is not a failure.
        if (!cancelled) onError();
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void task?.destroy();
      host.replaceChildren();
    };
  }, [blob, onError]);

  return (
    <div className="space-y-2">
      {firstPageShown ? null : <LoadingState label={LOADING_LABEL} />}
      <div ref={hostRef} role="group" aria-label="Sertifikat kalibrasi (PDF)" className="space-y-2" />
    </div>
  );
}

/**
 * Shows the certificate PDF inline as soon as it mounts. The PDF is fetched
 * through the authenticated API call (session cookie) and rendered from a
 * temporary Blob URL, so the PDF endpoint stays session-only — nothing public.
 * Desktop browsers with a built-in PDF viewer keep using it; everywhere else
 * the pages are drawn with PDF.js.
 */
export function CertificatePdfViewer({ token }: { token: string }) {
  const [state, setState] = useState<ViewerState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ phase: "loading" });

    apiFetchBlob(`/certificate-verification/${encodeURIComponent(token)}/pdf`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const mode = choosePdfRenderMode({
          pdfViewerEnabled: navigator.pdfViewerEnabled,
          coarsePointer: window.matchMedia("(pointer: coarse)").matches,
        });
        setState(mode === "native" ? { phase: "native", url: objectUrl } : { phase: "canvas", url: objectUrl, blob });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isUnauthorizedError(err)) {
          void expireSession();
          return;
        }
        setState({ phase: "error", message: pdfLoadErrorMessage(err instanceof ApiError ? err.status : null) });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const renderFailed = useCallback(
    () => setState({ phase: "error", message: pdfLoadErrorMessage(null) }),
    [],
  );

  if (state.phase === "loading") return <LoadingState label={LOADING_LABEL} />;

  if (state.phase === "error") return <ErrorState message={state.message} onRetry={retry} />;

  return (
    <div className="space-y-2">
      {state.phase === "native" ? (
        <iframe
          src={state.url}
          title="Sertifikat kalibrasi (PDF)"
          className="h-[75vh] min-h-[420px] w-full rounded-md border border-slate-200 bg-slate-50"
        />
      ) : (
        <PdfCanvasPages blob={state.blob} onError={renderFailed} />
      )}
      {/* Some mobile browsers cannot render PDFs inside a frame; this always works. */}
      <a href={state.url} target="_blank" rel="noopener noreferrer" className={`${linkAction} underline`}>
        Buka PDF di tab baru
      </a>
    </div>
  );
}
