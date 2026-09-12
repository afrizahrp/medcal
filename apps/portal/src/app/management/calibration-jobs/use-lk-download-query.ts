"use client";

import { apiFetch, apiFetchBlob } from "@medcal/shared";

// LK Result PDF Download v1 — two-step client flow:
//   1. requestLkDownloadReauth() — caller re-enters their password, gets back
//      a short-lived, single-use, job-scoped token. Never persist this token
//      beyond the in-memory download step below.
//   2. downloadLkResultPdf() — consumes the token and streams the PDF, same
//      blob-download convention as openKontrolAlatPdf/openIdentityCorrectionPdf.

export interface LkDownloadReauthResult {
  token: string;
  expiresAt: string;
}

export async function requestLkDownloadReauth(
  jobId: string,
  password: string,
): Promise<LkDownloadReauthResult> {
  return apiFetch<LkDownloadReauthResult>(`/calibration-jobs/${jobId}/lk/reauth`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function downloadLkResultPdf(jobId: string, token: string): Promise<void> {
  const blob = await apiFetchBlob(
    `/calibration-jobs/${jobId}/lk/pdf?token=${encodeURIComponent(token)}`,
  );
  if (blob.size === 0) throw new Error("Empty LK PDF");
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `LK-${jobId}.pdf`;
    anchor.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
