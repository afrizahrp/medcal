import type {
  CalibrationJobStatus,
  KontrolAlatSignerKind,
  TechKontrolAlatSignature,
} from "./types";

/** F.MU.08 signer slots. Discriminators only — not Membership roles. */
export const KONTROL_ALAT_SIGNER_SLOTS: readonly KontrolAlatSignerKind[] = [
  "ADMINISTRATION",
  "TECHNICAL_OFFICER",
];

export const KONTROL_ALAT_SIGNER_KIND_LABELS: Record<KontrolAlatSignerKind, string> = {
  ADMINISTRATION: "Administrasi",
  TECHNICAL_OFFICER: "Petugas Teknis",
};

export interface KontrolAlatSignatureSlot {
  kind: KontrolAlatSignerKind;
  label: string;
  signature: TechKontrolAlatSignature | undefined;
}

/**
 * Always two slots, even when the API returned zero signature rows.
 * Signing uses POST upsert by `kind`; a pre-existing row is not required.
 */
export function buildKontrolAlatSignatureSlots(
  signatures: TechKontrolAlatSignature[],
): KontrolAlatSignatureSlot[] {
  return KONTROL_ALAT_SIGNER_SLOTS.map((kind) => ({
    kind,
    label: KONTROL_ALAT_SIGNER_KIND_LABELS[kind],
    signature: signatures.find((row) => row.signerKind === kind),
  }));
}

/**
 * Inspection / accessories / workExecuted are writable only while the job
 * has not started. PENDING must stay editable so the start gate can be met.
 */
export function canEditKontrolAlat(
  canRecord: boolean,
  jobStatus: CalibrationJobStatus,
): boolean {
  return canRecord && jobStatus === "PENDING";
}

export function isSendToLabServiceMode(serviceMode: string): boolean {
  return serviceMode === "SEND_TO_LAB";
}

/**
 * Sticky-bar primary next action while a WOL job is PENDING and unsigned.
 * ON_SITE never qualifies. Completed Kontrol Alat hides this CTA.
 */
export function shouldShowLengkapiKontrolAlatCta(input: {
  serviceMode: string;
  jobStatus: CalibrationJobStatus;
  completedAt: string | null | undefined;
  canRecord: boolean;
}): boolean {
  return (
    isSendToLabServiceMode(input.serviceMode) &&
    input.jobStatus === "PENDING" &&
    input.completedAt == null &&
    input.canRecord
  );
}
