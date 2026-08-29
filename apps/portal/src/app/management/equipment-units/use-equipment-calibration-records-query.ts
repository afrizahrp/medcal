"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch, apiFetchBlob } from "@medcal/shared";
import type {
  EquipmentCalibrationRecordCreateInput,
  EquipmentCalibrationRecordUpdateInput,
} from "@medcal/shared";

export const EQUIPMENT_CALIBRATION_RECORDS_QUERY_KEY = "equipment-calibration-records" as const;

export type CalibrationValidityStatus = "VALID" | "EXPIRED" | "NOT_YET_VALID" | "NO_RECORD";

export interface CalibrationValidity {
  status: CalibrationValidityStatus;
  recordId: string | null;
  validUntil: string | null;
}

export interface CalibrationUserRef {
  id: string;
  name: string | null;
  email: string;
}

export interface CalibrationDocument {
  id: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  createdAt: string;
  uploadedByUserId: string | null;
}

export interface EquipmentCalibrationRecordRow {
  id: string;
  companyId: string;
  equipmentId: string;
  calibrationDate: string;
  validFrom: string | null;
  validUntil: string;
  certificateNumber: string | null;
  provider: string | null;
  result: string | null;
  remarks: string | null;
  acceptedForUse: boolean;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  acceptanceNotes: string | null;
  status: "DRAFT" | "CONFIRMED";
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedBy: CalibrationUserRef | null;
  createdBy: CalibrationUserRef | null;
  documents: CalibrationDocument[];
}

export interface EquipmentCalibrationRecordListResponse {
  data: EquipmentCalibrationRecordRow[];
  validity: CalibrationValidity;
}

export function useEquipmentCalibrationRecords(equipmentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [EQUIPMENT_CALIBRATION_RECORDS_QUERY_KEY, "for-equipment", equipmentId],
    queryFn: () =>
      apiFetch<EquipmentCalibrationRecordListResponse>(
        `/equipment/${equipmentId}/calibration-records`,
      ),
    enabled: Boolean(equipmentId) && enabled,
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [EQUIPMENT_CALIBRATION_RECORDS_QUERY_KEY] });
}

export function useCreateEquipmentCalibrationRecord(equipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EquipmentCalibrationRecordCreateInput) =>
      apiFetch<EquipmentCalibrationRecordRow>(`/equipment/${equipmentId}/calibration-records`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateEquipmentCalibrationRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EquipmentCalibrationRecordUpdateInput }) =>
      apiFetch<EquipmentCalibrationRecordRow>(`/equipment-calibration-records/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteEquipmentCalibrationRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: true }>(`/equipment-calibration-records/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidate(queryClient),
  });
}

/**
 * Certificate PDF upload goes through the generic FilesModule. Raw fetch (not
 * apiFetch) because the body is multipart/form-data — the browser sets the
 * boundary; forcing Content-Type: application/json would break it.
 */
export function useUploadCalibrationCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ recordId, file }: { recordId: string; file: File }) => {
      const form = new FormData();
      form.append("ownerType", "EQUIPMENT_CALIBRATION");
      form.append("ownerId", recordId);
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
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteCalibrationCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      apiFetch<{ id: string; deleted: true }>(`/files/${fileId}`, { method: "DELETE" }),
    onSuccess: () => invalidate(queryClient),
  });
}

/** Fetch a certificate blob and trigger a browser download. */
export async function downloadCalibrationCertificate(doc: CalibrationDocument): Promise<void> {
  const blob = await apiFetchBlob(`/files/${doc.id}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = doc.originalName || `${doc.id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
