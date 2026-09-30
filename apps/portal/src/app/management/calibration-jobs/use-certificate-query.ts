"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch, apiFetchBlob } from "@medcal/shared";

export const CERTIFICATE_QUERY_KEY = "calibration-job-certificate" as const;

export interface CertificateVersion {
  id: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  uploadedByUserId: string | null;
  createdAt: string;
  isCurrent: boolean;
}

export type CertificateStatus = "DRAFT" | "ISSUED" | "REVOKED" | "SUPERSEDED";

export type CertificateSource = "UPLOADED" | "GENERATED";

export interface CertificateDetail {
  id: string;
  calibrationJobId: string;
  number: string;
  source: CertificateSource;
  status: CertificateStatus;
  issuedAt: string | null;
  validUntil: string | null;
  /** Public verification URL the QR points at (null until issued / portal URL not configured). */
  verificationUrl: string | null;
  currentVersionId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  versions: CertificateVersion[];
}

export function useCertificate(jobId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [CERTIFICATE_QUERY_KEY, jobId],
    queryFn: () => apiFetch<CertificateDetail | null>(`/calibration-jobs/${jobId}/certificate`),
    enabled: Boolean(jobId) && enabled,
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, jobId: string) {
  queryClient.invalidateQueries({ queryKey: [CERTIFICATE_QUERY_KEY, jobId] });
}

/**
 * Upload an external certificate PDF (or replace its PDF). Raw fetch (not
 * apiFetch) because the body is multipart/form-data — the browser must set its
 * own boundary. `certificateNumber` is the number printed on the certificate,
 * entered/confirmed by the user (never derived from the filename by the
 * server); it is required for the first upload and ignored-or-must-match
 * afterwards. Deliberately carries no QA-status parameter.
 */
export function useUploadCertificate(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, certificateNumber }: { file: File; certificateNumber?: string }) => {
      const form = new FormData();
      // Text fields before the file so multer has them by the time it parses the file part.
      if (certificateNumber !== undefined) form.append("certificateNumber", certificateNumber);
      form.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/calibration-jobs/${jobId}/certificate/versions`,
        { method: "POST", credentials: "include", body: form },
      );
      if (!res.ok) {
        let data: ({ code?: string; message?: string } & Record<string, unknown>) | undefined;
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = undefined;
        }
        throw new ApiError(res.status, data?.message ?? res.statusText, data);
      }
      return (await res.json()) as CertificateDetail;
    },
    onSuccess: () => invalidate(queryClient, jobId),
  });
}

/** Issue a Medcal-generated certificate (allocates CRT number, token, renders the PDF). */
export function useIssueGeneratedCertificate(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<CertificateDetail>(`/calibration-jobs/${jobId}/certificate/issue`, { method: "POST" }),
    onSuccess: () => invalidate(queryClient, jobId),
    // A PDF failure still issued the certificate (number is official): refresh either way.
    onError: () => invalidate(queryClient, jobId),
  });
}

/** QR PNG (verification-URL locator) as an object URL the caller must revoke. */
export async function fetchCertificateQrObjectUrl(jobId: string): Promise<string> {
  const blob = await apiFetchBlob(`/calibration-jobs/${jobId}/certificate/qr`);
  return URL.createObjectURL(blob);
}

export function useDeleteCertificateVersion(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      apiFetch<{ id: string; deleted: true }>(
        `/calibration-jobs/${jobId}/certificate/versions/${fileId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => invalidate(queryClient, jobId),
  });
}

/** Fetch a certificate version blob and trigger a browser download. */
export async function downloadCertificateVersion(
  jobId: string,
  version: CertificateVersion,
): Promise<void> {
  const blob = await apiFetchBlob(
    `/calibration-jobs/${jobId}/certificate/versions/${version.id}/download`,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = version.originalName || `${version.id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
