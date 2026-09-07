"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch, apiFetchBlob } from "@medcal/shared";
import { WORK_ORDERS_QUERY_KEY } from "../work-orders/use-work-orders-query";
import { CALIBRATION_JOBS_QUERY_KEY } from "./use-calibration-jobs-query";
import type { CalibrationJobRow } from "./calibration-jobs-ui";

// ── Types (mirror IdentityCorrectionDetail from calibration-jobs.service) ──────

export type IdentityCorrectionStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export type IdentityCorrectionSignerRole = "TECHNICIAN" | "CUSTOMER";
export type SignatureStatus = "SIGNED" | "UNAVAILABLE" | "REFUSED";

export interface IdentityCorrectionSignatureFile {
  id: string;
  originalName: string | null;
  mimeType: string | null;
}

export interface IdentityCorrectionSignature {
  id: string;
  identityCorrectionId: string;
  signerRole: IdentityCorrectionSignerRole;
  signerName: string | null;
  status: SignatureStatus;
  unavailableReason: string | null;
  signedAt: string | null;
}

export interface IdentityCorrectionDeviceRef {
  id: string;
  code: string | null;
  serialNumber: string | null;
}

export interface IdentityCorrection {
  id: string;
  companyId: string;
  calibrationJobId: string;
  number: string;
  status: IdentityCorrectionStatus;
  prevDeviceId: string | null;
  newDeviceId: string | null;
  prevSerial: string | null;
  newSerial: string | null;
  prevAkdAkl: string | null;
  newAkdAkl: string | null;
  reason: string;
  submittedByUserId: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  akdAklGateReopened: boolean;
  createdAt: string;
  updatedAt: string;
  submittedBy: { id: string; name: string | null } | null;
  decidedBy: { id: string; name: string | null } | null;
  prevDevice: IdentityCorrectionDeviceRef | null;
  newDevice: IdentityCorrectionDeviceRef | null;
  signatures: IdentityCorrectionSignature[];
  /** Photo of the signed BA sheet — one per correction, not per signer. */
  files: IdentityCorrectionSignatureFile[];
}

export interface IdentityCorrectionSubmitResult {
  job: CalibrationJobRow;
  correction: IdentityCorrection;
  deviceTypeValidated: boolean;
}

export interface IdentityCorrectionDecisionResult {
  job: CalibrationJobRow;
  correction: IdentityCorrection;
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface IdentityCorrectionSignatureInput {
  status: SignatureStatus;
  signerName?: string;
  unavailableReason?: string;
}

export interface IdentityCorrectionSubmitInput {
  reason: string;
  newDeviceId?: string | null;
  newSerial?: string | null;
  newAkdAkl?: string | null;
  signatures: {
    TECHNICIAN: IdentityCorrectionSignatureInput;
    CUSTOMER: IdentityCorrectionSignatureInput;
  };
}

export interface IdentityCorrectionDecisionInput {
  decision: "APPROVE" | "REJECT";
  decisionNote?: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

const listKey = (jobId: string) =>
  [CALIBRATION_JOBS_QUERY_KEY, jobId, "identity-corrections"] as const;

function invalidate(queryClient: ReturnType<typeof useQueryClient>, jobId: string) {
  queryClient.invalidateQueries({ queryKey: listKey(jobId) });
  // Approval writes deviceId / observed serial / AKD-AKL back onto the job.
  queryClient.invalidateQueries({ queryKey: [CALIBRATION_JOBS_QUERY_KEY, jobId] });
  queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_QUERY_KEY] });
}

export function useIdentityCorrections(jobId: string | undefined) {
  return useQuery({
    queryKey: listKey(jobId ?? ""),
    queryFn: () =>
      apiFetch<IdentityCorrection[]>(`/calibration-jobs/${jobId}/identity-corrections`),
    enabled: Boolean(jobId),
    // Keep the reviewer's view current against decisions made in another tab.
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
  });
}

export function useSubmitIdentityCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, input }: { jobId: string; input: IdentityCorrectionSubmitInput }) =>
      apiFetch<IdentityCorrectionSubmitResult>(
        `/calibration-jobs/${jobId}/identity-corrections`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: (_data, variables) => invalidate(queryClient, variables.jobId),
  });
}

export function useDecideIdentityCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      correctionId,
      input,
    }: {
      jobId: string;
      correctionId: string;
      input: IdentityCorrectionDecisionInput;
    }) =>
      apiFetch<IdentityCorrectionDecisionResult>(
        `/calibration-jobs/${jobId}/identity-corrections/${correctionId}/decision`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: (_data, variables) => invalidate(queryClient, variables.jobId),
  });
}

/**
 * BA sheet photo upload goes through the generic FilesModule. Raw fetch (not
 * apiFetch) because the body is multipart/form-data — the browser sets the
 * boundary. Mirrors useUploadCalibrationCertificate. One photo per
 * correction (both signatures live on the same physical sheet) — ownerId is
 * the correction id, not either signature's id.
 */
export function useUploadIdentityCorrectionSignature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      correctionId,
      file,
    }: {
      jobId: string;
      correctionId: string;
      file: File;
    }) => {
      const form = new FormData();
      form.append("ownerType", "IDENTITY_CORRECTION");
      form.append("ownerId", correctionId);
      form.append("file", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        let data: ({ code?: string; message?: string } & Record<string, unknown>) | undefined;
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = undefined;
        }
        throw new ApiError(res.status, data?.message ?? res.statusText, data);
      }
      return (await res.json()) as { id: string };
    },
    onSuccess: (_data, variables) => invalidate(queryClient, variables.jobId),
  });
}

// ── PDF export ────────────────────────────────────────────────────────────────

export async function fetchIdentityCorrectionPdf(
  jobId: string,
  correctionId: string,
): Promise<Blob> {
  const blob = await apiFetchBlob(
    `/calibration-jobs/${jobId}/identity-corrections/${correctionId}/pdf`,
  );
  if (blob.size === 0) {
    throw new Error("Empty identity correction PDF");
  }
  return blob;
}

export async function openIdentityCorrectionPdf(
  jobId: string,
  correctionId: string,
  filename?: string,
): Promise<void> {
  const blob = await fetchIdentityCorrectionPdf(jobId, correctionId);
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (filename) anchor.download = filename;
    anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

