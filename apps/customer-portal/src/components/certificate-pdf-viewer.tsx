"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetchBlob } from "@medcal/shared";
import { pdfLoadErrorMessage } from "../lib/certificate-verification";
import { isUnauthorizedError } from "../lib/customer-query";
import { expireSession } from "../lib/session";
import { linkAction } from "../lib/ui-classes";
import { ErrorState, LoadingState } from "./status-blocks";

type ViewerState =
  | { phase: "loading" }
  | { phase: "ready"; url: string }
  | { phase: "error"; message: string };

/**
 * Shows the certificate PDF inline as soon as it mounts. The PDF is fetched
 * through the authenticated API call (session cookie) and rendered from a
 * temporary Blob URL, so the PDF endpoint stays session-only — nothing public.
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
        setState({ phase: "ready", url: objectUrl });
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

  if (state.phase === "loading") return <LoadingState label="Memuat sertifikat…" />;

  if (state.phase === "error") return <ErrorState message={state.message} onRetry={retry} />;

  return (
    <div className="space-y-2">
      <iframe
        src={state.url}
        title="Sertifikat kalibrasi (PDF)"
        className="h-[75vh] min-h-[420px] w-full rounded-md border border-slate-200 bg-slate-50"
      />
      {/* Some mobile browsers cannot render PDFs inside a frame; this always works. */}
      <a href={state.url} target="_blank" rel="noopener noreferrer" className={`${linkAction} underline`}>
        Buka PDF di tab baru
      </a>
    </div>
  );
}
