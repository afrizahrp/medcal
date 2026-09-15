"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  FileDown,
  FileText,
  Save,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { ApiError, isForbidden, isIdentityIncomplete } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { AccessDenied } from "../../../../components/access-denied";
import { SignatureImage } from "../signature-image";
import { LkDownloadButton } from "../lk-download-button";
import {
  usePortalKontrolAlat,
  usePatchPortalKontrolAlat,
  useUpdatePortalKontrolAlatAccessory,
  useSignPortalKontrolAlat,
  openKontrolAlatPdf,
  type PortalKontrolAlat,
  type PortalKontrolAlatSignature,
  type PortalKontrolAlatSignerKind,
} from "../use-kontrol-alat-query";
import {
  AkdAklStatusBadge,
  ConfirmDialog,
  DetailField,
  IdentityCorrectionStatusBadge,
  JobReferenceEquipmentValidityBadge,
  JobStatusBadge,
  PageHeader,
  Surface,
  declaredAkdAkl,
  declaredDeviceName,
  formPageClass,
  formSurfaceClass,
  formatDate,
  formatDateTime,
  resolvedDeviceType,
  type CalibrationJobDeviceCandidate,
  type CalibrationJobRow,
} from "../calibration-jobs-ui";
import {
  AKD_AKL_APPROVAL_STATUS_LABELS,
  canDecideIdentity,
  canEscalateIdentity,
  canRecordReferenceEquipment,
  canReplaceReferenceEquipment,
  canSubmitIdentityCorrection,
  isReferenceEquipmentApprovalPending,
  canDecideQualityReview,
  correctionMissingImage,
  formatCalibrationJobApiError,
  formatMeasurementHasilDisplay,
  formatMeasurementNormalValue,
  formatReferenceEquipmentError,
  isAwaitingQualityReview,
  isIdentityGateLocked,
  isQualityReviewApproved,
  isReferenceEquipmentUsable,
  latestQualityReview,
  MISSING_CORRECTION_IMAGE_MESSAGE,
  qualityReviewDisplayAttempt,
  REFERENCE_EQUIPMENT_VALIDITY_BADGE_CLASS,
  REFERENCE_EQUIPMENT_VALIDITY_LABELS,
  shouldShowRejectionFeedback,
  summarizeCorrectionChanges,
  toQualityReviewRejectInput,
} from "../calibration-job-utils";
import {
  useCalibrationJob,
  useDeviceCandidates,
  useDecideIdentity,
  useDecideQualityReview,
  useEscalateIdentity,
} from "../use-calibration-jobs-query";
import {
  openIdentityCorrectionPdf,
  useDecideIdentityCorrection,
  useIdentityCorrections,
  useSubmitIdentityCorrection,
  useUploadIdentityCorrectionSignature,
  type IdentityCorrection,
  type IdentityCorrectionSignature,
  type IdentityCorrectionSubmitInput,
  type SignatureStatus,
} from "../use-identity-corrections-query";
import {
  useDecideReferenceEquipmentApproval,
  useReferenceEquipmentApprovals,
  useReferenceEquipmentCandidates,
  useReferenceEquipmentUsed,
  useReplaceReferenceEquipmentUsed,
  type JobReferenceEquipmentReplaceItem,
  type ReferenceEquipmentCandidate,
  type ReferenceEquipmentUsed,
} from "../use-reference-equipment-used-query";
import {
  useMeasurementParameters,
  useMeasurementResults,
  type PortalMeasurementResult,
} from "../use-measurement-results-query";

const SIGNER_ROLES = ["TECHNICIAN", "CUSTOMER"] as const;
type SignerRole = (typeof SIGNER_ROLES)[number];
const SIGNER_LABEL: Record<SignerRole, string> = { TECHNICIAN: "Teknisi", CUSTOMER: "Pelanggan" };
const SIGNATURE_STATUS_LABEL: Record<SignatureStatus, string> = {
  SIGNED: "Ditandatangani",
  UNAVAILABLE: "Tidak tersedia",
  REFUSED: "Menolak",
};
const IMAGE_ACCEPT = "image/png,image/jpeg,application/pdf";

export default function CalibrationJobDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();

  const query = useCalibrationJob(params.id);
  const corrections = useIdentityCorrections(params.id);
  const measurementParameters = useMeasurementParameters(params.id);
  const measurementResults = useMeasurementResults(params.id);
  const refEquipment = useReferenceEquipmentUsed(params.id);

  const isWol = query.data?.workOrder.serviceMode === "SEND_TO_LAB";
  const kontrolAlatQuery = usePortalKontrolAlat(isWol ? params.id : "");

  const refCandidates = useReferenceEquipmentCandidates(
    params.id,
    Boolean(capabilities?.calibrationJobRecordReferenceEquipmentUsed),
  );
  const replaceRefEquipment = useReplaceReferenceEquipmentUsed(params.id);
  const escalateMutation = useEscalateIdentity();
  const decideMutation = useDecideIdentity();
  const decideQualityReview = useDecideQualityReview();
  const submitCorrection = useSubmitIdentityCorrection();
  const decideCorrection = useDecideIdentityCorrection();
  const uploadSignature = useUploadIdentityCorrectionSignature();

  const [dialog, setDialog] = useState<
    "escalate" | "approve" | "reject" | "submit-correction" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Inline feedback for the reference-equipment section — the shared top-of-page
  // banner is off-screen when the manager is working down in that section.
  const [refEquipmentNotice, setRefEquipmentNotice] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Status-strip accordion: which sections are expanded. Sections whose badge
  // signals "needs attention" auto-expand once, on first load — re-derived on
  // every 6s poll would fight the user's manual expand/collapse choices.
  const [openSections, setOpenSections] = useState<string[]>([]);
  const didInitExpand = useRef(false);
  const identitySectionRef = useRef<HTMLDivElement>(null);
  const refEquipmentSectionRef = useRef<HTMLDivElement>(null);
  const measurementSectionRef = useRef<HTMLDivElement>(null);
  const correctionsSectionRef = useRef<HTMLDivElement>(null);
  const akdAklSectionRef = useRef<HTMLDivElement>(null);
  const kontrolAlatSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (didInitExpand.current || !query.data) return;
    didInitExpand.current = true;
    const job = query.data;
    const signals = job.actionSignals;
    const gateLocked = isIdentityGateLocked(job);
    const initial: string[] = [];
    // Only open sections that still have an actionable remediation.
    if (signals.referenceEquipmentNeedsApproval) initial.push("ref-equipment");
    if (signals.identityCorrectionPending || signals.identityIncomplete) {
      initial.push("corrections");
    }
    if (signals.identityIncomplete) initial.push("identity");
    if (job.akdAklApprovalStatus === "PENDING_REVIEW" && !gateLocked) {
      initial.push("akd-akl");
    }
    setOpenSections(initial);

    const focusRef = signals.identityCorrectionPending
      ? correctionsSectionRef
      : signals.referenceEquipmentNeedsApproval
        ? refEquipmentSectionRef
        : signals.identityIncomplete
          ? identitySectionRef
          : null;
    if (focusRef) {
      requestAnimationFrame(() => {
        focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [query.data]);

  function focusSection(value: string, ref: RefObject<HTMLDivElement | null>) {
    setOpenSections((prev) => (prev.includes(value) ? prev : [...prev, value]));
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const job = query.data;

  if (isForbidden(query.error)) {
    return <AccessDenied />;
  }

  if (query.isLoading) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Calibration Job tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/calibration-jobs", label: "Calibration Jobs" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Calibration job tidak ditemukan.</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat calibration job.</p>
      </div>
    );
  }

  async function run<T>(action: () => Promise<T>, okMessage: string, fallback: string) {
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(okMessage);
      setDialog(null);
      await query.refetch();
    } catch (err) {
      setError(formatCalibrationJobApiError(err, fallback));
    }
  }

  async function handleSubmitCorrection(form: SubmitCorrectionForm) {
    if (!job) return;
    setError(null);
    setSuccess(null);
    try {
      const input: IdentityCorrectionSubmitInput = {
        reason: form.reason.trim(),
        ...(form.attrs.device ? { newDeviceId: form.deviceId } : {}),
        ...(form.attrs.serial ? { newSerial: form.serial.trim() } : {}),
        ...(form.attrs.akdAkl ? { newAkdAkl: form.akdAkl.trim() } : {}),
        signatures: {
          TECHNICIAN: toSignatureInput(form.signatures.TECHNICIAN),
          CUSTOMER: toSignatureInput(form.signatures.CUSTOMER),
        },
      };
      const res = await submitCorrection.mutateAsync({ jobId: job.id, input });

      let uploadFailed = false;
      if (form.file) {
        try {
          await uploadSignature.mutateAsync({
            jobId: job.id,
            correctionId: res.correction.id,
            file: form.file,
          });
        } catch {
          uploadFailed = true;
        }
      }

      setDialog(null);
      setSuccess(
        `BA ${res.correction.number} dibuat.` +
          (uploadFailed ? " Foto BA gagal diunggah — unggah ulang di detail BA." : ""),
      );
      await Promise.all([query.refetch(), corrections.refetch()]);
    } catch (err) {
      setError(formatCalibrationJobApiError(err, "Gagal mengajukan koreksi identitas."));
    }
  }

  async function handleDecideCorrection(
    correction: IdentityCorrection,
    decision: "APPROVE" | "REJECT",
    note?: string,
  ) {
    if (!job) return;
    setError(null);
    setSuccess(null);
    try {
      await decideCorrection.mutateAsync({
        jobId: job.id,
        correctionId: correction.id,
        input: { decision, ...(note ? { decisionNote: note } : {}) },
      });
      setSuccess(decision === "APPROVE" ? "BA koreksi disetujui." : "BA koreksi ditolak.");
      await Promise.all([query.refetch(), corrections.refetch()]);
    } catch (err) {
      setError(formatCalibrationJobApiError(err, "Gagal memproses keputusan BA."));
    }
  }

  async function handleApproveQualityReview(notes?: string) {
    if (!job) return;
    setError(null);
    setSuccess(null);
    try {
      await decideQualityReview.mutateAsync({
        id: job.id,
        input: { decision: "APPROVE", ...(notes ? { notes } : {}) },
      });
      setSuccess("Disetujui.");
      await Promise.all([query.refetch(), measurementResults.refetch()]);
    } catch (err) {
      setError(formatCalibrationJobApiError(err, "Gagal memproses keputusan BA."));
    }
  }

  async function handleRejectQualityReview(notes: string) {
    if (!job) return;
    const input = toQualityReviewRejectInput(notes);
    if (!input) return;
    setError(null);
    setSuccess(null);
    try {
      await decideQualityReview.mutateAsync({
        id: job.id,
        input,
      });
      setSuccess("Dikembalikan untuk perbaikan.");
      await Promise.all([query.refetch(), measurementResults.refetch()]);
    } catch (err) {
      setError(formatCalibrationJobApiError(err, "Gagal menolak hasil."));
    }
  }

  async function handleReplaceReferenceEquipment(items: JobReferenceEquipmentReplaceItem[]) {
    if (!job) return;
    setError(null);
    setSuccess(null);
    setRefEquipmentNotice(null);
    try {
      const saved = await replaceRefEquipment.mutateAsync(items);
      await Promise.all([query.refetch(), refEquipment.refetch(), refCandidates.refetch()]);
      const overrides = saved.filter((row) => row.validityOverridden).length;
      const msg =
        `Tersimpan — ${saved.length} alat referensi dicatat` +
        (overrides > 0 ? `, ${overrides} dengan override validitas.` : ".") +
        " Badge di daftar Calibration Jobs & Work Order menyusul dalam beberapa detik.";
      setSuccess("Daftar alat referensi disimpan.");
      setRefEquipmentNotice({ ok: true, text: msg });
    } catch (err) {
      const text = formatReferenceEquipmentError(err, "Gagal menyimpan alat referensi.");
      setError(text);
      setRefEquipmentNotice({ ok: false, text });
    }
  }

  async function handleUploadCorrectionImage(correctionId: string, file: File) {
    if (!job) return;
    setError(null);
    setSuccess(null);
    try {
      await uploadSignature.mutateAsync({ jobId: job.id, correctionId, file });
      setSuccess("Foto BA diunggah.");
      await corrections.refetch();
    } catch (err) {
      setError(formatCalibrationJobApiError(err, "Gagal mengunggah foto BA."));
    }
  }

  const deviceType = resolvedDeviceType(job);
  const gateLocked = isIdentityGateLocked(job);
  const showEscalate =
    canEscalateIdentity(job) && Boolean(capabilities?.calibrationJobEscalateIdentity);
  const showDecide = canDecideIdentity(job) && Boolean(capabilities?.calibrationJobApproveIdentity);
  const canSubmitCorrection =
    canSubmitIdentityCorrection(job) &&
    Boolean(capabilities?.calibrationJobSubmitIdentityCorrection);
  const canDecideCorrection = Boolean(capabilities?.calibrationJobDecideIdentityCorrection);
  const canApproveQualityReview =
    Boolean(capabilities?.calibrationJobDecideQualityReview) && canDecideQualityReview(job);
  const canRecordKontrolAlat = Boolean(capabilities?.calibrationJobRecordKontrolAlat);
  const canRecordRefEquipment = Boolean(capabilities?.calibrationJobRecordReferenceEquipmentUsed);
  const canOverrideRefEquipment = Boolean(
    capabilities?.calibrationJobOverrideReferenceEquipmentValidity,
  );
  const canDecideRefApproval = Boolean(
    capabilities?.calibrationJobDecideReferenceEquipmentApproval,
  );
  const correctionRows = corrections.data ?? [];
  const hasPendingCorrection = correctionRows.some((c) => c.status === "PENDING_REVIEW");
  const gateReopenedBy = correctionRows.find(
    (c) => c.status === "APPROVED" && c.akdAklGateReopened,
  );

  return (
    <div className={formPageClass}>
      <PageHeader
        title={`${job.workOrder.number} · Unit ${job.unitOrdinal}/${job.unitTotal}`}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/calibration-jobs", label: "Calibration Jobs" },
          { label: `${job.workOrder.number} #${job.unitOrdinal}` },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={formSurfaceClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Link
              href={`/work-orders/${job.workOrder.id}`}
              className="font-mono text-sm text-brand-700 hover:underline"
            >
              {job.workOrder.number}
            </Link>
            <span className="text-xs text-slate-400">
              Unit {job.unitOrdinal} dari {job.unitTotal}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <JobStatusBadge status={job.status} />
            <div className="flex items-center gap-2">
              {job.status === "ACCEPTED_BY_QA" ? <LkDownloadButton jobId={job.id} /> : null}
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href="/calibration-jobs">
                  <ArrowLeft className="h-4 w-4" />
                  Back to List
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {gateLocked ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Job ini sudah melewati tahap verifikasi identitas — eskalasi, keputusan AKD/AKL, dan
            koreksi identitas tidak lagi tersedia.
          </p>
        ) : null}

        <StatusStrip
          job={job}
          onFocusIdentity={() => focusSection("identity", identitySectionRef)}
          onFocusRefEquipment={() => focusSection("ref-equipment", refEquipmentSectionRef)}
          onFocusMeasurement={() => focusSection("measurement", measurementSectionRef)}
          onFocusCorrections={() => focusSection("corrections", correctionsSectionRef)}
          onFocusAkdAkl={() => focusSection("akd-akl", akdAklSectionRef)}
        />

        <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="mt-2">
          {/* Kontrol Alat — WOL only */}
          {isWol ? (
            <AccordionItem
              ref={kontrolAlatSectionRef}
              value="kontrol-alat"
              className="border-t border-slate-100"
            >
              <AccordionTrigger className="px-0 py-3 text-sm font-semibold text-slate-900 hover:no-underline">
                <span className="flex items-center gap-2">
                  Kontrol Alat (F.MU.08)
                  {job.kontrolAlat?.completedAt ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500" />
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent forceMount>
                <KontrolAlatAccordionContent
                  jobId={params.id}
                  job={job}
                  kontrolAlatQuery={kontrolAlatQuery}
                  canRecord={canRecordKontrolAlat}
                />
              </AccordionContent>
            </AccordionItem>
          ) : null}

          <AccordionItem ref={identitySectionRef} value="identity" className="border-t border-slate-100">
            <AccordionTrigger className="px-0 py-3 text-sm font-semibold text-slate-900 hover:no-underline">
              Identitas
            </AccordionTrigger>
            <AccordionContent>
              <dl className="space-y-4 text-sm">
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailField label="Declared Device Name">{declaredDeviceName(job)}</DetailField>
                  <DetailField label="Resolved Device Type">
                    {deviceType ? (
                      <>
                        {deviceType.name}
                        <span className="ml-2 font-mono text-xs text-slate-400">
                          {deviceType.code}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">Tidak dapat ditentukan</span>
                    )}
                  </DetailField>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailField label="Declared AKD/AKL/NIE">{declaredAkdAkl(job)}</DetailField>
                  <DetailField label="Technician Observed AKD/AKL">
                    {job.technicianObservedAkdAkl ?? "—"}
                  </DetailField>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailField label="Technician Observed Serial">
                    {job.technicianObservedSerial ?? "—"}
                  </DetailField>
                  <DetailField label="Requisition Line">
                    {job.calibrationRequestItemId ? (
                      <span className="font-mono text-xs text-slate-500">
                        {job.calibrationRequestItemId}
                      </span>
                    ) : (
                      "—"
                    )}
                  </DetailField>
                </div>
              </dl>

              <div className="mt-5 border-t border-slate-100 pt-5">
                <h4 className="text-sm font-semibold text-slate-900">Assigned Device</h4>
                {job.actionSignals.identityIncomplete ? (
                  <p
                    role="status"
                    className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  >
                    Identity perangkat belum lengkap. Device ID dan/atau serial observasi belum
                    terisi.
                  </p>
                ) : isIdentityIncomplete(job) ? (
                  <p
                    role="status"
                    className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                  >
                    Identity perangkat belum lengkap. Koreksi identitas tidak lagi tersedia karena
                    job sudah melewati tahap verifikasi identitas.
                  </p>
                ) : null}
                {job.device ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                    <div>
                      <Link
                        href={`/devices/${job.device.id}`}
                        className="font-mono text-sm font-medium text-brand-700 hover:underline"
                      >
                        {job.device.code ?? job.device.id}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Serial: {job.device.serialNumber ?? "—"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    Belum ada device yang di-assign. Identitas fisik dikonfirmasi lewat Berita
                    Acara Koreksi Identitas di bawah.
                  </p>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            ref={refEquipmentSectionRef}
            value="ref-equipment"
            className="border-t border-slate-100"
          >
            <AccordionTrigger className="px-0 py-3 text-sm font-semibold text-slate-900 hover:no-underline">
              Alat Referensi yang Digunakan
            </AccordionTrigger>
            <AccordionContent forceMount>
              <ReferenceEquipmentSection
                job={job}
                used={refEquipment}
                candidates={refCandidates}
                canRecord={canRecordRefEquipment}
                canOverride={canOverrideRefEquipment}
                canDecideApproval={canDecideRefApproval}
                submitting={replaceRefEquipment.isPending}
                notice={refEquipmentNotice}
                onSubmit={handleReplaceReferenceEquipment}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            ref={measurementSectionRef}
            value="measurement"
            className="border-t border-slate-100"
          >
            <AccordionTrigger className="px-0 py-3 text-sm font-semibold text-slate-900 hover:no-underline">
              Hasil Pengukuran
            </AccordionTrigger>
            <AccordionContent forceMount>
              <QualityReviewPanel
                job={job}
                parametersQuery={measurementParameters}
                resultsQuery={measurementResults}
                canDecide={canApproveQualityReview}
                decidePending={decideQualityReview.isPending}
                onApprove={handleApproveQualityReview}
                onReject={handleRejectQualityReview}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            ref={correctionsSectionRef}
            value="corrections"
            className="border-t border-slate-100"
          >
            <AccordionTrigger className="px-0 py-3 text-sm font-semibold text-slate-900 hover:no-underline">
              Identity Corrections (Berita Acara)
            </AccordionTrigger>
            <AccordionContent>
              {corrections.isLoading ? (
                <p className="mt-3 text-sm text-slate-400">Memuat…</p>
              ) : corrections.isError ? (
                <p className="mt-3 text-sm text-red-600">Gagal memuat daftar koreksi identitas.</p>
              ) : correctionRows.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  Belum ada koreksi identitas untuk job ini.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {correctionRows.map((correction) => (
                    <CorrectionCard
                      key={correction.id}
                      jobId={params.id}
                      correction={correction}
                      canDecide={canDecideCorrection}
                      canUpload={canSubmitCorrection}
                      uploadPending={uploadSignature.isPending}
                      decidePending={decideCorrection.isPending}
                      onDecide={handleDecideCorrection}
                      onUploadImage={handleUploadCorrectionImage}
                    />
                  ))}
                </ul>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            ref={akdAklSectionRef}
            value="akd-akl"
            className="border-t border-slate-100"
          >
            <AccordionTrigger className="px-0 py-3 text-sm font-semibold text-slate-900 hover:no-underline">
              AKD/AKL/NIE Approval
            </AccordionTrigger>
            <AccordionContent>
              <dl className="space-y-4 text-sm">
                <DetailField label="Status">
                  <AkdAklStatusBadge status={job.akdAklApprovalStatus} />
                </DetailField>
                {gateReopenedBy ? (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Gate dibuka kembali ke PENDING_REVIEW oleh BA {gateReopenedBy.number}.
                  </p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailField label="Decided By">{job.akdAklApprovedBy?.name ?? "—"}</DetailField>
                  <DetailField label="Decided At">{formatDateTime(job.akdAklApprovedAt)}</DetailField>
                </div>
                <DetailField label="Decision / Escalation Note">
                  {job.akdAklDecisionNote ? (
                    <span className="whitespace-pre-wrap">{job.akdAklDecisionNote}</span>
                  ) : (
                    "—"
                  )}
                </DetailField>
              </dl>
              <p className="mt-2 text-xs text-slate-400">
                v1: catatan eskalasi dan catatan keputusan berbagi satu kolom — catatan teknisi
                akan tertimpa oleh catatan manajer.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {showEscalate ? (
            <Button type="button" variant="outline" onClick={() => setDialog("escalate")}>
              <ShieldAlert className="h-4 w-4" />
              Escalate Identity
            </Button>
          ) : null}
          {showDecide ? (
            <>
              <Button type="button" onClick={() => setDialog("approve")}>
                <Check className="h-4 w-4" />
                Approve
              </Button>
              <Button type="button" variant="destructive" onClick={() => setDialog("reject")}>
                <X className="h-4 w-4" />
                Reject
              </Button>
            </>
          ) : null}
        </div>
      </Surface>

      <EscalateDialog
        open={dialog === "escalate"}
        job={job}
        pending={escalateMutation.isPending}
        onCancel={() => setDialog(null)}
        onSubmit={(input) =>
          run(
            () => escalateMutation.mutateAsync({ id: job.id, input }),
            "Identitas dieskalasi — menunggu keputusan TECHNICIAN_MANAGER.",
            "Gagal mengeskalasi identitas.",
          )
        }
      />

      <ConfirmDialog
        open={dialog === "approve"}
        title="Approve AKD/AKL/NIE?"
        description="Device ini akan dinyatakan lolos gate regulasi dan kalibrasi dapat dilanjutkan. APPROVED bersifat final."
        confirmLabel="Approve"
        loading={decideMutation.isPending}
        onConfirm={() =>
          run(
            () => decideMutation.mutateAsync({ id: job.id, input: { decision: "APPROVE" } }),
            "AKD/AKL/NIE disetujui.",
            "Gagal menyetujui AKD/AKL.",
          )
        }
        onCancel={() => setDialog(null)}
      />

      <RejectDialog
        open={dialog === "reject"}
        pending={decideMutation.isPending}
        title="Reject AKD/AKL/NIE"
        description="Job ini tidak dapat dilanjutkan ke kalibrasi. Catatan wajib diisi."
        onCancel={() => setDialog(null)}
        onSubmit={(note) =>
          run(
            () =>
              decideMutation.mutateAsync({
                id: job.id,
                input: { decision: "REJECT", akdAklDecisionNote: note },
              }),
            "AKD/AKL/NIE ditolak.",
            "Gagal menolak AKD/AKL.",
          )
        }
      />

      <SubmitCorrectionDialog
        open={dialog === "submit-correction"}
        job={job}
        pending={submitCorrection.isPending || uploadSignature.isPending}
        onCancel={() => setDialog(null)}
        onSubmit={handleSubmitCorrection}
      />
    </div>
  );
}

// ── Status strip ──────────────────────────────────────────────────────────────

const statusChipBase =
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-ring";
const statusChipNeutral = "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100";
const statusChipAttention = "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100";
const statusChipOk = "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";

function StatusChip({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "neutral" | "attention" | "ok";
  onClick: () => void;
}) {
  const toneClass =
    tone === "attention" ? statusChipAttention : tone === "ok" ? statusChipOk : statusChipNeutral;
  return (
    <button type="button" className={`${statusChipBase} ${toneClass}`} onClick={onClick}>
      {tone === "attention" ? <ShieldAlert className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  );
}

/**
 * At-a-glance summary above the accordion sections. Attention tones follow
 * `job.actionSignals` (actionable only) plus AKD/AKL pending while the identity
 * gate is still open. Hasil Pengukuran stays navigational.
 */
function StatusStrip({
  job,
  onFocusIdentity,
  onFocusRefEquipment,
  onFocusMeasurement,
  onFocusCorrections,
  onFocusAkdAkl,
}: {
  job: CalibrationJobRow;
  onFocusIdentity: () => void;
  onFocusRefEquipment: () => void;
  onFocusMeasurement: () => void;
  onFocusCorrections: () => void;
  onFocusAkdAkl: () => void;
}) {
  const identityIncomplete = job.actionSignals.identityIncomplete;
  const refEquipmentNeedsApproval = job.actionSignals.referenceEquipmentNeedsApproval;
  const identityCorrectionPending = job.actionSignals.identityCorrectionPending;
  const gateLocked = isIdentityGateLocked(job);
  const akdAklActionable = job.akdAklApprovalStatus === "PENDING_REVIEW" && !gateLocked;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <StatusChip
        label={identityIncomplete ? "Identitas · Belum Lengkap" : "Identitas"}
        tone={identityIncomplete ? "attention" : "neutral"}
        onClick={onFocusIdentity}
      />
      <StatusChip
        label={refEquipmentNeedsApproval ? "Alat Referensi · Perlu Persetujuan" : "Alat Referensi"}
        tone={refEquipmentNeedsApproval ? "attention" : "neutral"}
        onClick={onFocusRefEquipment}
      />
      <StatusChip label="Hasil Pengukuran" tone="neutral" onClick={onFocusMeasurement} />
      <StatusChip
        label={identityCorrectionPending ? "Koreksi Identitas · Menunggu Review" : "Koreksi Identitas"}
        tone={identityCorrectionPending ? "attention" : "neutral"}
        onClick={onFocusCorrections}
      />
      <StatusChip
        label={`AKD/AKL · ${AKD_AKL_APPROVAL_STATUS_LABELS[job.akdAklApprovalStatus]}`}
        tone={
          akdAklActionable
            ? "attention"
            : job.akdAklApprovalStatus === "APPROVED"
              ? "ok"
              : "neutral"
        }
        onClick={onFocusAkdAkl}
      />
    </div>
  );
}

// ── Kontrol Alat accordion content ────────────────────────────────────────────

const SIGNER_KIND_LABELS: Record<PortalKontrolAlatSignerKind, string> = {
  ADMINISTRATION: "Administrasi",
  TECHNICAL_OFFICER: "Petugas Teknis",
};

function BoolChip({ value }: { value: boolean | null }) {
  if (value === true)
    return (
      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
        Baik / OK
      </span>
    );
  if (value === false)
    return (
      <span className="rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
        Tidak OK
      </span>
    );
  return <span className="text-slate-400">—</span>;
}

function KontrolAlatSignatureBlock({
  sig,
  canRecord,
  jobId,
}: {
  sig: PortalKontrolAlatSignature;
  canRecord: boolean;
  jobId: string;
}) {
  const signMutation = useSignPortalKontrolAlat(jobId);
  const signed = sig.signedAt != null;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {SIGNER_KIND_LABELS[sig.signerKind]}
      </p>
      {signed ? (
        <>
          <p className="mt-1 text-sm font-medium text-emerald-700">Ditandatangani</p>
          <p className="text-xs text-slate-500">
            {sig.signerName} · {formatDateTime(sig.signedAt)}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">Belum ditandatangani</p>
          {canRecord ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={signMutation.isPending}
              onClick={() => signMutation.mutate({ signerKind: sig.signerKind })}
            >
              {signMutation.isPending ? "Menandatangani…" : "Tandatangani sebagai saya"}
            </Button>
          ) : null}
          {signMutation.isError ? (
            <p className="mt-1 text-xs text-red-600">Gagal menandatangani.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function KontrolAlatAccordionContent({
  jobId,
  job,
  kontrolAlatQuery,
  canRecord,
}: {
  jobId: string;
  job: CalibrationJobRow;
  kontrolAlatQuery: ReturnType<typeof usePortalKontrolAlat>;
  canRecord: boolean;
}) {
  const patchMutation = usePatchPortalKontrolAlat(jobId);
  const updateAccessory = useUpdatePortalKontrolAlatAccessory(jobId);

  const [certInput, setCertInput] = useState<string | null>(null);
  const [pdfPending, setPdfPending] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const ka = kontrolAlatQuery.data;
  const isJobApproved = isQualityReviewApproved(job);
  const jobLocked = job.status !== "PENDING";
  const canEdit = canRecord && !jobLocked;
  const canEditCert = canRecord && isJobApproved;

  if (kontrolAlatQuery.isLoading) {
    return <p className="mt-3 text-sm text-slate-400">Memuat Kontrol Alat…</p>;
  }

  if (kontrolAlatQuery.isError) {
    return (
      <p className="mt-3 text-sm text-red-600">
        Gagal memuat Kontrol Alat.
      </p>
    );
  }

  if (!ka) {
    return <p className="mt-3 text-sm text-slate-500">Data Kontrol Alat tidak tersedia.</p>;
  }

  const completedAt = ka.completedAt;

  async function handleDownloadPdf() {
    setPdfError(null);
    setPdfPending(true);
    try {
      await openKontrolAlatPdf(jobId);
    } catch {
      setPdfError("Gagal membuka PDF F.MU.08. Coba lagi.");
    } finally {
      setPdfPending(false);
    }
  }

  return (
    <div className="mt-3 space-y-5 text-sm">
      {/* Status + Download */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {completedAt ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <Clock className="h-4 w-4 text-amber-500" />
          )}
          <span className={completedAt ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
            {completedAt
              ? `Selesai & ditandatangani — ${formatDateTime(completedAt)}`
              : "Belum lengkap — perlu diisi dan ditandatangani"}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pdfPending}
          onClick={handleDownloadPdf}
        >
          <FileDown className="h-3.5 w-3.5" />
          {pdfPending ? "Membuka…" : "Unduh PDF"}
        </Button>
      </div>
      {pdfError ? <p className="text-xs text-red-600">{pdfError}</p> : null}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          No. Dokumen
        </p>
        <p className="font-mono text-slate-800">{ka.number}</p>
      </div>

      {/* No. Sertifikat — editable only after MT approve */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          No. Sertifikat
        </p>
        {canEditCert ? (
          <div className="flex items-center gap-2">
            <Input
              value={certInput ?? ka.certificateNumber ?? ""}
              onChange={(e) => setCertInput(e.target.value)}
              maxLength={100}
              placeholder="Masukkan nomor sertifikat"
              className="max-w-sm"
            />
            <Button
              type="button"
              size="sm"
              disabled={patchMutation.isPending}
              onClick={() => {
                const v = (certInput ?? "").trim();
                patchMutation.mutate(
                  { certificateNumber: v || null },
                  { onSuccess: () => setCertInput(null) },
                );
              }}
            >
              <Save className="h-3.5 w-3.5" />
              {patchMutation.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        ) : (
          <p className="text-slate-700">
            {ka.certificateNumber || (
              <span className="text-slate-400">
                {isJobApproved ? "Belum diisi" : "Tersedia setelah MT Approve"}
              </span>
            )}
          </p>
        )}
      </div>

      {/* I. Pelaksanaan */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          I. Pelaksanaan Pekerjaan
        </p>
        <dl className="space-y-1">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Pekerjaan dilaksanakan</dt>
            <dd>
              <BoolChip value={ka.workExecuted} />
            </dd>
          </div>
          {ka.workExecuted === false && ka.notExecutedReason ? (
            <div className="text-slate-500">
              <dt className="text-xs">Alasan:</dt>
              <dd className="mt-0.5 text-slate-700">{ka.notExecutedReason}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {/* III. Uji Visual */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Uji Visual
        </p>
        <dl className="space-y-1">
          {(
            [
              { label: "Kabel daya / power supply", field: "visualPowerCable" as const },
              { label: "Layar / display", field: "visualDisplay" as const },
              { label: "Tombol / kontrol", field: "visualButtons" as const },
            ] as const
          ).map(({ label, field }) => (
            <div key={field} className="flex items-center justify-between">
              <dt className="text-slate-500">{label}</dt>
              <dd>
                <BoolChip value={ka[field]} />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Uji Fungsi */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Uji Fungsi
        </p>
        <dl className="space-y-1">
          {(
            [
              { label: "Uji fungsi awal (sebelum kalibrasi)", field: "functionInitialOk" as const },
              { label: "Uji fungsi akhir (setelah kalibrasi)", field: "functionFinalOk" as const },
            ] as const
          ).map(({ label, field }) => (
            <div key={field} className="flex items-center justify-between">
              <dt className="text-slate-500">{label}</dt>
              <dd>
                <BoolChip value={ka[field]} />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Perlengkapan */}
      {ka.accessories.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Perlengkapan
          </p>
          <ul className="space-y-1">
            {ka.accessories.map((acc) => (
              <li key={acc.id} className="flex items-center justify-between gap-2">
                <span className="text-slate-700">{acc.label}</span>
                {canEdit ? (
                  <div className="flex gap-1">
                    {(
                      [
                        { label: "Ada", v: true as boolean | null, cls: "bg-emerald-100 text-emerald-800" },
                        { label: "Tdk Ada", v: false as boolean | null, cls: "bg-red-100 text-red-800" },
                        { label: "—", v: null, cls: "bg-slate-100 text-slate-500" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={String(opt.v)}
                        type="button"
                        disabled={updateAccessory.isPending}
                        onClick={() =>
                          updateAccessory.mutate({ accessoryId: acc.id, input: { present: opt.v } })
                        }
                        className={[
                          "rounded-md px-2 py-0.5 text-[11px] font-medium",
                          acc.present === opt.v ? opt.cls : "bg-slate-50 text-slate-400",
                        ].join(" ")}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <BoolChip value={acc.present} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Tanda Tangan */}
      {ka.signatures.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Tanda Tangan
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {ka.signatures.map((sig) => (
              <KontrolAlatSignatureBlock key={sig.id} sig={sig} canRecord={canRecord} jobId={jobId} />
            ))}
          </div>
        </div>
      ) : null}

      {patchMutation.isError ? (
        <p className="text-xs text-red-600">Gagal menyimpan perubahan Kontrol Alat.</p>
      ) : null}
    </div>
  );
}

// ── Reference equipment used ─────────────────────────────────────────────────

interface RefEquipmentQueryLike<T> {
  isLoading: boolean;
  isError: boolean;
  data: T | undefined;
}

/**
 * Thin Portal client over the same candidates + full-set-replace API tech-pwa
 * uses. TECHNICIAN_MANAGER (typically at a desk with Portal open) reviews and
 * overrides reference equipment here without switching to a phone. All
 * validity / lock / override rules are enforced server-side — this only mirrors
 * them for gating the UI.
 */
function ReferenceEquipmentSection({
  job,
  used,
  candidates,
  canRecord,
  canOverride,
  canDecideApproval,
  submitting,
  notice,
  onSubmit,
}: {
  job: CalibrationJobRow;
  used: RefEquipmentQueryLike<ReferenceEquipmentUsed[]>;
  candidates: RefEquipmentQueryLike<ReferenceEquipmentCandidate[]>;
  canRecord: boolean;
  canOverride: boolean;
  canDecideApproval: boolean;
  submitting: boolean;
  notice: { ok: boolean; text: string } | null;
  onSubmit: (items: JobReferenceEquipmentReplaceItem[]) => void | Promise<void>;
}) {
  const loading = used.isLoading || (canRecord && candidates.isLoading);
  if (loading) {
    return <p className="mt-3 text-sm text-slate-400">Memuat…</p>;
  }
  if (used.isError || (canRecord && candidates.isError)) {
    return <p className="mt-3 text-sm text-red-600">Gagal memuat daftar alat referensi.</p>;
  }

  const usedRows = used.data ?? [];
  const pending = isReferenceEquipmentApprovalPending(job);

  const readOnlyList =
    usedRows.length === 0 ? (
      <p className="mt-2 text-sm text-slate-500">
        Belum ada alat referensi yang dicatat untuk job ini.
      </p>
    ) : (
      <ul className="mt-3 space-y-2">
        {usedRows.map((unit) => (
          <ReferenceEquipmentCard key={unit.id} unit={unit} />
        ))}
      </ul>
    );

  if (!canRecord) {
    return (
      <div className="mt-3 space-y-3">
        {pending ? (
          <ReferenceEquipmentApprovalPanel jobId={job.id} canDecide={canDecideApproval} />
        ) : null}
        {readOnlyList}
      </div>
    );
  }

  const replaceOpen = canReplaceReferenceEquipment(job);
  const hasRecordedOverride = usedRows.some((u) => u.validityOverridden);
  const lockedByOverride = hasRecordedOverride && !canOverride;

  if (!replaceOpen || lockedByOverride) {
    const noticeText = !canRecordReferenceEquipment(job)
      ? job.startedAt === null
        ? "Job belum dimulai — alat referensi baru dapat dicatat setelah kalibrasi berjalan."
        : "Job sudah dikirim — daftar alat referensi tidak dapat diubah lagi."
      : pending
        ? null
        : "Daftar alat referensi berisi alat yang disetujui manajer teknis. Hanya manajer teknis yang dapat mengubahnya.";
    return (
      <div className="mt-3 space-y-3">
        {pending ? (
          <ReferenceEquipmentApprovalPanel jobId={job.id} canDecide={canDecideApproval} />
        ) : noticeText ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{noticeText}</p>
        ) : null}
        {readOnlyList}
      </div>
    );
  }

  const candidateRows = candidates.data ?? [];
  if (candidateRows.length === 0) {
    return (
      <p className="mt-2 text-sm text-slate-500">
        Belum ada alat referensi yang dikonfirmasi pada work order job ini. Hubungi kantor.
      </p>
    );
  }

  return (
    <ReferenceEquipmentEditor
      key={usedRows.map((u) => `${u.equipmentId}:${u.validityOverridden}`).join("|")}
      candidates={candidateRows}
      used={usedRows}
      canOverride={canOverride}
      submitting={submitting}
      notice={notice}
      onSubmit={onSubmit}
    />
  );
}

interface SelRow {
  checked: boolean;
  reason: string;
}

function ReferenceEquipmentApprovalPanel({
  jobId,
  canDecide,
}: {
  jobId: string;
  canDecide: boolean;
}) {
  const approvals = useReferenceEquipmentApprovals(jobId);
  const decide = useDecideReferenceEquipmentApproval(jobId);
  const pending = (approvals.data ?? []).find((row) => row.status === "PENDING_REVIEW") ?? null;
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [rejectNote, setRejectNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (approvals.isLoading) {
    return <p className="text-sm text-slate-400">Memuat permintaan persetujuan…</p>;
  }
  if (!pending) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Menunggu Persetujuan MT
      </p>
    );
  }

  const request = pending;
  const invalidItems = request.items.filter((item) => item.requiresOverride);
  const missingReasons = invalidItems.some((item) => !(reasons[item.equipmentId] ?? "").trim());

  async function onApprove() {
    setLocalError(null);
    try {
      await decide.mutateAsync({
        approvalId: request.id,
        decision: "APPROVE",
        items: invalidItems.map((item) => ({
          equipmentId: item.equipmentId,
          overrideReason: (reasons[item.equipmentId] ?? "").trim(),
        })),
      });
    } catch (err) {
      setLocalError(formatCalibrationJobApiError(err, "Gagal menyetujui alat referensi."));
    }
  }

  async function onReject() {
    setLocalError(null);
    try {
      await decide.mutateAsync({
        approvalId: request.id,
        decision: "REJECT",
        decisionNote: rejectNote.trim(),
      });
    } catch (err) {
      setLocalError(formatCalibrationJobApiError(err, "Gagal menolak permintaan."));
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/70 p-3">
      <p className="text-sm font-semibold text-amber-900">Menunggu Persetujuan MT</p>
      <p className="text-xs text-amber-800">
        Diajukan {pending.submittedBy.name ?? "teknisi"} · {formatDateTime(pending.createdAt)}
      </p>
      <ul className="space-y-2">
        {pending.items.map((item) => (
          <li key={item.id} className="rounded-md border border-amber-100 bg-white px-3 py-2 text-sm">
            <span className="font-mono font-medium">{item.equipment.code}</span>
            <span className="ml-2 text-xs text-slate-500">{item.validityStatus}</span>
            {item.requiresOverride && canDecide ? (
              <textarea
                className="mt-2 w-full rounded-md border border-amber-300 px-2 py-1 text-sm"
                rows={2}
                placeholder="Alasan override (wajib)"
                value={reasons[item.equipmentId] ?? ""}
                onChange={(e) =>
                  setReasons((prev) => ({ ...prev, [item.equipmentId]: e.target.value }))
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
      {canDecide ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
            rows={2}
            placeholder="Catatan penolakan (wajib jika menolak)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={decide.isPending || missingReasons}
              onClick={() => void onApprove()}
            >
              Setujui / Override
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={decide.isPending || rejectNote.trim().length === 0}
              onClick={() => void onReject()}
            >
              Tolak
            </Button>
          </div>
        </div>
      ) : null}
      {localError ? <p className="text-xs text-red-600">{localError}</p> : null}
    </div>
  );
}

function ReferenceEquipmentEditor({
  candidates,
  used,
  canOverride,
  submitting,
  notice,
  onSubmit,
}: {
  candidates: ReferenceEquipmentCandidate[];
  used: ReferenceEquipmentUsed[];
  canOverride: boolean;
  submitting: boolean;
  notice: { ok: boolean; text: string } | null;
  onSubmit: (items: JobReferenceEquipmentReplaceItem[]) => void | Promise<void>;
}) {
  const sorted = useMemo(
    () =>
      [...candidates].sort(
        (a, b) => Number(b.requiredForDeviceType) - Number(a.requiredForDeviceType),
      ),
    [candidates],
  );

  const recordedByEquipmentId = useMemo(() => new Map(used.map((u) => [u.equipmentId, u])), [used]);

  const [selection, setSelection] = useState<Record<string, SelRow>>(() => {
    const usedByEquipmentId = new Map(used.map((u) => [u.equipmentId, u]));
    const next: Record<string, SelRow> = {};
    for (const c of candidates) {
      const rec = usedByEquipmentId.get(c.equipmentId);
      next[c.equipmentId] = { checked: Boolean(rec), reason: rec?.overrideReason ?? "" };
    }
    return next;
  });

  const toggle = (equipmentId: string, checked: boolean) =>
    setSelection((prev) => ({ ...prev, [equipmentId]: { ...prev[equipmentId], checked } }));
  const setReason = (equipmentId: string, reason: string) =>
    setSelection((prev) => ({ ...prev, [equipmentId]: { ...prev[equipmentId], reason } }));

  const missingOverrideReason =
    canOverride &&
    sorted.some((c) => {
      const row = selection[c.equipmentId];
      if (!row?.checked || isReferenceEquipmentUsable(c.validity.status)) return false;
      return row.reason.trim().length === 0;
    });

  function handleSubmit() {
    const items: JobReferenceEquipmentReplaceItem[] = sorted
      .filter((c) => selection[c.equipmentId]?.checked)
      .map((c) =>
        isReferenceEquipmentUsable(c.validity.status)
          ? { equipmentId: c.equipmentId }
          : canOverride
            ? {
                equipmentId: c.equipmentId,
                override: { reason: selection[c.equipmentId].reason.trim() },
              }
            : { equipmentId: c.equipmentId },
      );
    void onSubmit(items);
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-slate-600">
        Pilih alat referensi yang digunakan untuk kalibrasi job ini. Daftar ini menggantikan seluruh
        catatan sebelumnya.
      </p>
      <ul className="space-y-2">
        {sorted.map((c) => (
          <CandidateRow
            key={c.equipmentId}
            candidate={c}
            row={selection[c.equipmentId] ?? { checked: false, reason: "" }}
            recorded={recordedByEquipmentId.get(c.equipmentId) ?? null}
            canOverride={canOverride}
            onToggle={(checked) => toggle(c.equipmentId, checked)}
            onReason={(reason) => setReason(c.equipmentId, reason)}
          />
        ))}
      </ul>
      {notice ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        {missingOverrideReason ? (
          <span className="text-xs text-amber-700">
            Isi alasan override untuk setiap alat tidak valid yang dicentang.
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={submitting || missingOverrideReason}
          onClick={handleSubmit}
        >
          <Save className="h-3.5 w-3.5" />
          {submitting ? "Menyimpan…" : "Simpan alat referensi"}
        </Button>
      </div>
    </div>
  );
}

function CandidateValidityBadge({
  status,
}: {
  status: ReferenceEquipmentCandidate["validity"]["status"];
}) {
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${REFERENCE_EQUIPMENT_VALIDITY_BADGE_CLASS[status]}`}
    >
      {REFERENCE_EQUIPMENT_VALIDITY_LABELS[status]}
    </span>
  );
}

function CandidateRow({
  candidate: c,
  row,
  recorded,
  canOverride,
  onToggle,
  onReason,
}: {
  candidate: ReferenceEquipmentCandidate;
  row: SelRow;
  recorded: ReferenceEquipmentUsed | null;
  canOverride: boolean;
  onToggle: (checked: boolean) => void;
  onReason: (reason: string) => void;
}) {
  const usable = isReferenceEquipmentUsable(c.validity.status);
  const inactive = !c.isActive;
  const needsOverride = !usable && !inactive;
  const checkboxDisabled = inactive;
  const brandModel = [c.brand, c.model].filter(Boolean).join(" ");

  return (
    <li
      className={
        needsOverride && row.checked
          ? "rounded-lg border border-amber-300 bg-amber-50/60 p-3"
          : "rounded-lg border border-slate-200 p-3"
      }
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0"
          checked={row.checked}
          disabled={checkboxDisabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-medium text-slate-900">{c.code}</span>
            {brandModel ? <span className="text-sm text-slate-600">{brandModel}</span> : null}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {c.equipmentTypeName}
            {c.serialNumber ? ` · SN ${c.serialNumber}` : ""}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <CandidateValidityBadge status={c.validity.status} />
            {inactive ? (
              <span className="rounded-md bg-slate-400 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                Nonaktif
              </span>
            ) : null}
            <span className="text-xs text-slate-400">
              {c.requiredForDeviceType
                ? "Wajib untuk jenis alat ini"
                : "Tidak wajib untuk jenis alat ini"}
            </span>
          </span>
          {needsOverride && !canOverride ? (
            <span className="mt-1 block text-xs text-amber-700">
              Kalibrasi tidak valid — simpan lalu ajukan persetujuan. Belum dapat dipakai sampai
              manajer teknis menyetujui.
            </span>
          ) : null}
        </span>
      </label>

      {needsOverride && canOverride && row.checked ? (
        <div className="mt-2 pl-7">
          <label
            htmlFor={`override-${c.equipmentId}`}
            className="block text-xs font-medium text-amber-800"
          >
            Alasan override (wajib)
          </label>
          <textarea
            id={`override-${c.equipmentId}`}
            maxLength={2000}
            rows={2}
            value={row.reason}
            onChange={(e) => onReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-amber-300 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      ) : null}

      {recorded?.validityOverridden ? (
        <p className="mt-2 pl-7 text-xs text-amber-700">
          <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
          Override tercatat
          {recorded.overriddenBy?.name ? ` oleh ${recorded.overriddenBy.name}` : ""}
          {recorded.overriddenAt ? ` · ${formatDateTime(recorded.overriddenAt)}` : ""}
        </p>
      ) : recorded ? (
        <p className="mt-2 pl-7 text-xs text-emerald-700">
          <Check className="mr-1 inline h-3.5 w-3.5" />
          Tercatat sebagai alat referensi job ini.
        </p>
      ) : null}
    </li>
  );
}

function ReferenceEquipmentCard({ unit }: { unit: ReferenceEquipmentUsed }) {
  const { equipment, equipmentCalibrationRecord: record, validityOverridden } = unit;
  const brandModel = [equipment.brand, equipment.model].filter(Boolean).join(" ");

  return (
    <li
      className={
        validityOverridden
          ? "rounded-lg border border-amber-300 bg-amber-50/60 p-3"
          : "rounded-lg border border-slate-200 p-3"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <span className="font-mono text-sm font-medium text-slate-800">{equipment.code}</span>
          {brandModel ? <span className="ml-2 text-sm text-slate-600">{brandModel}</span> : null}
          {equipment.serialNumber ? (
            <span className="ml-2 font-mono text-xs text-slate-400">
              SN {equipment.serialNumber}
            </span>
          ) : null}
          <p className="mt-0.5 text-xs text-slate-500">{equipment.equipmentType.name}</p>
        </div>
        <JobReferenceEquipmentValidityBadge overridden={validityOverridden} />
      </div>

      <p className={`mt-1.5 text-xs ${validityOverridden ? "text-amber-700" : "text-slate-500"}`}>
        {record ? (
          <>
            Sertifikat {record.certificateNumber ?? "—"} · berlaku s/d{" "}
            {formatDate(record.validUntil)}
          </>
        ) : (
          "Tidak ada sertifikat kalibrasi yang berlaku"
        )}
      </p>

      {validityOverridden ? (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-800">
          <p className="flex items-center gap-1.5 font-semibold">
            <ShieldAlert className="h-3.5 w-3.5" />
            Validitas kalibrasi di-override
          </p>
          <p className="mt-1">
            Oleh: {unit.overriddenBy?.name ?? "—"} · {formatDateTime(unit.overriddenAt)}
          </p>
          {unit.overrideReason ? (
            <p className="mt-1 whitespace-pre-wrap">Alasan: {unit.overrideReason}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// ── Quality review (MT APPROVE | REJECT) ─────────────────────────────────────

function QualityReviewPanel({
  job,
  parametersQuery,
  resultsQuery,
  canDecide,
  decidePending,
  onApprove,
  onReject,
}: {
  job: CalibrationJobRow;
  parametersQuery: ReturnType<typeof useMeasurementParameters>;
  resultsQuery: ReturnType<typeof useMeasurementResults>;
  canDecide: boolean;
  decidePending: boolean;
  onApprove: (notes?: string) => void | Promise<void>;
  onReject: (notes: string) => void | Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const awaiting = isAwaitingQualityReview(job);
  const approved = isQualityReviewApproved(job);
  const showRejection = shouldShowRejectionFeedback(job);
  const review = latestQualityReview(job);
  const attempt = qualityReviewDisplayAttempt(job);
  const parameters = [
    ...(parametersQuery.data?.parameters ?? []),
    ...(parametersQuery.data?.gridParameters ?? []),
  ];
  const paramById = new Map(parameters.map((p) => [p.id, p]));
  const nameById = new Map(parameters.map((p) => [p.id, p.name]));
  const pointById = new Map(
    parameters.flatMap((p) => (p.testPoints ?? []).map((tp) => [tp.id, tp] as const)),
  );
  const pointLabelById = new Map(
    [...pointById.entries()].map(([id, tp]) => [id, tp.settingLabel] as const),
  );
  const capabilityByParamId = new Map(parameters.map((p) => [p.id, p.capabilityName]));
  const capabilityOrder = new Map(
    (parametersQuery.data?.capabilityGroups ?? []).map((g, i) => [g.capability.name, i] as const),
  );
  const rows = (resultsQuery.data ?? []).filter((row) => row.attemptNumber === attempt);
  // Bucket the (already parameter-sorted) result rows by capability, preserving
  // row order within each bucket. Bucket order follows the catalog's capability
  // sort order (DeviceTypeCapabilityOrder); unknown capabilities sort last.
  const groupedRows = (() => {
    const buckets = new Map<string, PortalMeasurementResult[]>();
    for (const row of rows) {
      const cap = capabilityByParamId.get(row.deviceCalibrationParameterId) ?? "Lainnya";
      const bucket = buckets.get(cap);
      if (bucket) bucket.push(row);
      else buckets.set(cap, [row]);
    }
    return [...buckets.entries()].sort(
      ([a], [b]) =>
        (capabilityOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (capabilityOrder.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b),
    );
  })();

  return (
    <div className="mt-3 space-y-4">
      {parametersQuery.isLoading || resultsQuery.isLoading ? (
        <p className="text-sm text-slate-400">Memuat…</p>
      ) : parametersQuery.isError || resultsQuery.isError ? (
        <p className="text-sm text-red-600">Gagal memuat hasil pengukuran.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada hasil pengukuran untuk job ini.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-1 pr-3 font-medium">Parameter</th>
                <th className="py-1 pr-3 font-medium">Pengulangan</th>
                <th className="py-1 pr-3 font-medium">Hasil</th>
                <th className="py-1 pr-3 font-medium">Nilai Normal</th>
                <th className="py-1 font-medium">Satuan</th>
              </tr>
            </thead>
            {groupedRows.map(([capabilityName, capRows]) => {
              const paramCount = new Set(capRows.map((r) => r.deviceCalibrationParameterId)).size;
              return (
                <tbody key={capabilityName}>
                  <tr className="border-t border-slate-200 bg-slate-100/70">
                    <td colSpan={5} className="py-1.5 pr-3">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {capabilityName}
                        <span className="font-normal normal-case text-slate-400">
                          · {paramCount} parameter
                        </span>
                      </span>
                    </td>
                  </tr>
                  {capRows.map((row) => {
                    const param = paramById.get(row.deviceCalibrationParameterId);
                    const testPoint = row.calibrationTestPointId
                      ? pointById.get(row.calibrationTestPointId)
                      : undefined;
                    return (
                      <tr key={row.id} className="border-t border-slate-200">
                        <td className="py-1 pr-3 text-slate-700">
                          {nameById.get(row.deviceCalibrationParameterId) ??
                            row.deviceCalibrationParameterId}
                          {row.calibrationTestPointId
                            ? ` · ${pointLabelById.get(row.calibrationTestPointId) ?? row.calibrationTestPointId}`
                            : ""}
                        </td>
                        <td className="py-1 pr-3 font-mono text-slate-500">{row.replicateIndex}</td>
                        <td className="py-1 pr-3 font-mono text-slate-800">
                          {formatMeasurementHasilDisplay(row.measuredValue, param?.decimalPlaces) ??
                            row.measuredText ??
                            (row.measuredBool == null ? "—" : String(row.measuredBool))}
                        </td>
                        <td className="py-1 pr-3 font-mono text-slate-700">
                          {formatMeasurementNormalValue({
                            effectiveToleranceMin: row.effectiveToleranceMin,
                            effectiveToleranceMax: row.effectiveToleranceMax,
                            testPoint: testPoint
                              ? {
                                  toleranceMin: testPoint.toleranceMin ?? null,
                                  toleranceMax: testPoint.toleranceMax ?? null,
                                  toleranceNote: testPoint.toleranceNote ?? null,
                                }
                              : null,
                            parameter: param
                              ? {
                                  toleranceMin: param.toleranceMin,
                                  toleranceMax: param.toleranceMax,
                                  toleranceNote: param.toleranceNote,
                                }
                              : null,
                          })}
                        </td>
                        <td className="py-1 text-slate-600">{param?.uom?.symbol ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      {approved && review ? (
        <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
          <DetailField label="Status">
            <IdentityCorrectionStatusBadge status="APPROVED" />
          </DetailField>
          <DetailField label="Diputuskan oleh">{review.reviewer?.name ?? "—"}</DetailField>
          <DetailField label="Diputuskan pada">{formatDateTime(review.reviewedAt)}</DetailField>
          <DetailField label="Catatan keputusan">
            {review.notes ? <span className="whitespace-pre-wrap">{review.notes}</span> : "—"}
          </DetailField>
        </div>
      ) : null}

      {showRejection && review ? (
        <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
          <DetailField label="Diputuskan oleh">{review.reviewer?.name ?? "—"}</DetailField>
          <DetailField label="Diputuskan pada">{formatDateTime(review.reviewedAt)}</DetailField>
          <DetailField label="Catatan keputusan">
            {review.notes ? <span className="whitespace-pre-wrap">{review.notes}</span> : "—"}
          </DetailField>
        </div>
      ) : null}

      {awaiting && !canDecide ? (
        <IdentityCorrectionStatusBadge status="PENDING_REVIEW" />
      ) : null}

      {awaiting && canDecide ? (
        <div className="space-y-3 border-t border-slate-200 pt-3">
          <label className="block text-sm font-medium text-slate-700">
            Catatan keputusan
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              disabled={decidePending}
              onClick={() => onApprove(notes.trim() || undefined)}
            >
              <Check className="h-3.5 w-3.5" /> Setujui
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={decidePending}
              onClick={() => setRejectOpen(true)}
            >
              <X className="h-3.5 w-3.5" /> Tolak
            </Button>
          </div>
        </div>
      ) : null}

      <RejectDialog
        open={rejectOpen}
        pending={decidePending}
        title="Tolak hasil pengukuran"
        description="Hasil dikembalikan ke teknisi untuk perbaikan. Catatan wajib diisi."
        confirmLabel="Tolak"
        onCancel={() => setRejectOpen(false)}
        onSubmit={async (note) => {
          await onReject(note);
          setRejectOpen(false);
        }}
      />
    </div>
  );
}

// ── Identity correction card (list row + inline detail) ───────────────────────

function CorrectionCard({
  jobId,
  correction,
  canDecide,
  canUpload,
  uploadPending,
  decidePending,
  onDecide,
  onUploadImage,
}: {
  jobId: string;
  correction: IdentityCorrection;
  canDecide: boolean;
  canUpload: boolean;
  uploadPending: boolean;
  decidePending: boolean;
  onDecide: (
    correction: IdentityCorrection,
    decision: "APPROVE" | "REJECT",
    note?: string,
  ) => void | Promise<void>;
  onUploadImage: (correctionId: string, file: File) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pdfPending, setPdfPending] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const changes = summarizeCorrectionChanges(correction);
  const missingImage = correctionMissingImage(correction);
  const isPending = correction.status === "PENDING_REVIEW";

  async function handleDownloadPdf() {
    setPdfError(null);
    setPdfPending(true);
    try {
      await openIdentityCorrectionPdf(jobId, correction.id, `${correction.number.replace(/\//g, "-")}.pdf`);
    } catch {
      setPdfError("Gagal membuka PDF Berita Acara.");
    } finally {
      setPdfPending(false);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left"
      >
        <span className="font-mono text-sm font-medium text-slate-800">{correction.number}</span>
        <IdentityCorrectionStatusBadge status={correction.status} />
        <span className="text-xs text-slate-500">
          {changes.length ? changes.map((c) => c.attr).join(", ") : "—"}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          {SIGNER_ROLES.map((role) => {
            const sig = correction.signatures.find((s) => s.signerRole === role);
            return (
              <span
                key={role}
                title={`${SIGNER_LABEL[role]}: ${sig ? SIGNATURE_STATUS_LABEL[sig.status] : "—"}`}
              >
                {SIGNER_LABEL[role][0]}
                {sig?.status === "SIGNED" ? "✓" : sig?.status === "REFUSED" ? "✕" : "–"}
              </span>
            );
          })}
          <span>{formatDateTime(correction.createdAt)}</span>
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 px-3 py-3 text-sm">
          <DetailField label="Alasan">
            <span className="whitespace-pre-wrap">{correction.reason}</span>
          </DetailField>

          {changes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-xs">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-1 pr-3 font-medium">Atribut</th>
                    <th className="py-1 pr-3 font-medium">Sebelum</th>
                    <th className="py-1 font-medium">Sesudah</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((row) => (
                    <tr key={row.attr} className="border-t border-slate-200">
                      <td className="py-1 pr-3 text-slate-600">{row.attr}</td>
                      <td className="py-1 pr-3 font-mono text-slate-500">{row.prev}</td>
                      <td className="py-1 font-mono text-slate-800">{row.next}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {SIGNER_ROLES.map((role) => {
              const sig = correction.signatures.find((s) => s.signerRole === role);
              if (!sig) return null;
              return <SignatureBlock key={role} signature={sig} />;
            })}
          </div>

          <CorrectionPhotoBlock
            correction={correction}
            editable={isPending && canUpload}
            uploadPending={uploadPending}
            onUploadImage={onUploadImage}
          />

          <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
            {pdfError ? <p className="text-xs text-red-600">{pdfError}</p> : <span />}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pdfPending}
              onClick={handleDownloadPdf}
            >
              <FileDown className="h-3.5 w-3.5" />
              {pdfPending ? "Membuka…" : "Unduh PDF"}
            </Button>
          </div>

          {correction.status !== "PENDING_REVIEW" ? (
            <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
              <DetailField label="Diputuskan oleh">{correction.decidedBy?.name ?? "—"}</DetailField>
              <DetailField label="Diputuskan pada">
                {formatDateTime(correction.decidedAt)}
              </DetailField>
              <DetailField label="Catatan keputusan">
                {correction.decisionNote ? (
                  <span className="whitespace-pre-wrap">{correction.decisionNote}</span>
                ) : (
                  "—"
                )}
              </DetailField>
            </div>
          ) : null}

          {correction.akdAklGateReopened ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Koreksi ini membuka kembali gate AKD/AKL job ke PENDING_REVIEW.
            </p>
          ) : null}

          {isPending && canDecide ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
              {missingImage ? (
                <p className="mr-auto text-xs text-amber-600">{MISSING_CORRECTION_IMAGE_MESSAGE}</p>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={decidePending}
                onClick={() => onDecide(correction, "APPROVE")}
              >
                <Check className="h-3.5 w-3.5" /> Setujui
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={decidePending}
                onClick={() => setRejectOpen(true)}
              >
                <X className="h-3.5 w-3.5" /> Tolak
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <RejectDialog
        open={rejectOpen}
        pending={decidePending}
        title={`Tolak BA ${correction.number}`}
        description="BA ditolak — tidak ada perubahan yang ditulis ke job. Catatan wajib diisi."
        onCancel={() => setRejectOpen(false)}
        onSubmit={async (note) => {
          await onDecide(correction, "REJECT", note);
          setRejectOpen(false);
        }}
      />
    </li>
  );
}

function SignatureBlock({ signature }: { signature: IdentityCorrectionSignature }) {
  const roleLabel = SIGNER_LABEL[signature.signerRole];

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{roleLabel}</p>
      <p className="mt-1 text-sm text-slate-700">
        {SIGNATURE_STATUS_LABEL[signature.status]}
        {signature.signerName ? ` · ${signature.signerName}` : ""}
      </p>
      {signature.status !== "SIGNED" && signature.unavailableReason ? (
        <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">
          {signature.unavailableReason}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One photo per correction — both signatures are on the same physical sheet,
 * so the upload/preview lives here, not inside either SignatureBlock.
 */
function CorrectionPhotoBlock({
  correction,
  editable,
  uploadPending,
  onUploadImage,
}: {
  correction: IdentityCorrection;
  editable: boolean;
  uploadPending: boolean;
  onUploadImage: (correctionId: string, file: File) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const image = correction.files.find((f) => (f.mimeType ?? "").startsWith("image/"));
  const pdf = correction.files.find((f) => (f.mimeType ?? "") === "application/pdf");
  const anySigned = correction.signatures.some((s) => s.status === "SIGNED");

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Foto BA</p>

      {image ? (
        <div className="mt-2">
          <SignatureImage fileId={image.id} alt="Foto BA (lembar tanda tangan)" />
        </div>
      ) : pdf ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <FileText className="h-3.5 w-3.5" /> {pdf.originalName ?? "Lampiran PDF"}
        </p>
      ) : anySigned ? (
        <p className="mt-2 text-xs text-amber-600">Foto BA belum diunggah.</p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Tidak ada tanda tangan — foto tidak diperlukan.
        </p>
      )}

      {editable && correction.files.length === 0 ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onUploadImage(correction.id, file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={uploadPending}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploadPending ? "Mengunggah…" : "Unggah foto BA"}
          </Button>
        </>
      ) : null}
    </div>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

function EscalateDialog({
  open,
  job,
  pending,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  job: CalibrationJobRow;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: { technicianObservedAkdAkl?: string | null; reason?: string }) => void;
}) {
  const [observed, setObserved] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setObserved(job.technicianObservedAkdAkl ?? "");
      setReason("");
    }
  }, [open, job.technicianObservedAkdAkl]);

  if (!open) return null;

  return (
    <DialogShell title="Escalate AKD/AKL/NIE" onCancel={onCancel} pending={pending}>
      <p className="mt-2 text-sm text-slate-600">
        Menaikkan job ini ke PENDING_REVIEW untuk keputusan TECHNICIAN_MANAGER.
      </p>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        AKD/AKL/NIE yang diamati di lokasi
        <Input
          value={observed}
          onChange={(e) => setObserved(e.target.value)}
          placeholder="Kosongkan jika tidak ada sama sekali"
          className="mt-1"
        />
      </label>
      <label className="mt-3 block text-sm font-medium text-slate-700">
        Alasan eskalasi (opsional)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </label>
      <DialogActions
        pending={pending}
        confirmLabel="Escalate"
        onCancel={onCancel}
        onConfirm={() =>
          onSubmit({
            technicianObservedAkdAkl: observed.trim() ? observed.trim() : "",
            reason: reason.trim() || undefined,
          })
        }
      />
    </DialogShell>
  );
}

function RejectDialog({
  open,
  pending,
  title,
  description,
  confirmLabel = "Reject",
  onCancel,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  if (!open) return null;

  return (
    <DialogShell title={title} onCancel={onCancel} pending={pending}>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Catatan keputusan
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </label>
      <DialogActions
        pending={pending}
        confirmLabel={confirmLabel}
        destructive
        disabled={!note.trim()}
        onCancel={onCancel}
        onConfirm={() => onSubmit(note.trim())}
      />
    </DialogShell>
  );
}

// ── Submit correction dialog ─────────────────────────────────────────────────

interface SignatureFormValue {
  status: SignatureStatus;
  signerName: string;
  unavailableReason: string;
}

interface SubmitCorrectionForm {
  reason: string;
  attrs: { device: boolean; serial: boolean; akdAkl: boolean };
  deviceId: string;
  serial: string;
  akdAkl: string;
  signatures: Record<SignerRole, SignatureFormValue>;
  /** Photo of the signed BA sheet — one per correction, not per signer. */
  file: File | null;
}

function emptySignature(): SignatureFormValue {
  return { status: "SIGNED", signerName: "", unavailableReason: "" };
}

function toSignatureInput(v: SignatureFormValue) {
  return {
    status: v.status,
    ...(v.status === "SIGNED" ? { signerName: v.signerName.trim() } : {}),
    ...(v.status !== "SIGNED" ? { unavailableReason: v.unavailableReason.trim() } : {}),
  };
}

function signatureBlockValid(v: SignatureFormValue): boolean {
  if (v.status === "SIGNED") return v.signerName.trim().length > 0;
  return v.unavailableReason.trim().length > 0;
}

function SubmitCorrectionDialog({
  open,
  job,
  pending,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  job: CalibrationJobRow;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (form: SubmitCorrectionForm) => void;
}) {
  const [reason, setReason] = useState("");
  const [attrs, setAttrs] = useState({ device: false, serial: false, akdAkl: false });
  const [deviceId, setDeviceId] = useState("");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [serial, setSerial] = useState("");
  const [akdAkl, setAkdAkl] = useState("");
  const [signatures, setSignatures] = useState<Record<SignerRole, SignatureFormValue>>({
    TECHNICIAN: emptySignature(),
    CUSTOMER: emptySignature(),
  });
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setAttrs({ device: false, serial: false, akdAkl: false });
      setDeviceId("");
      setDeviceSearch("");
      setSerial(job.technicianObservedSerial ?? "");
      setAkdAkl(job.technicianObservedAkdAkl ?? "");
      setSignatures({ TECHNICIAN: emptySignature(), CUSTOMER: emptySignature() });
      setFile(null);
    }
  }, [open, job.technicianObservedSerial, job.technicianObservedAkdAkl]);

  const debouncedSearch = useDebouncedValue(deviceSearch, 400);
  const candidatesQuery = useDeviceCandidates(job.id, debouncedSearch, open && attrs.device);
  const candidates = candidatesQuery.data ?? [];

  if (!open) return null;

  const anyAttr = attrs.device || attrs.serial || attrs.akdAkl;
  const attrsValid =
    (!attrs.device || deviceId.length > 0) &&
    (!attrs.serial || serial.trim().length > 0) &&
    (!attrs.akdAkl || akdAkl.trim().length > 0);
  const signaturesValid =
    signatureBlockValid(signatures.TECHNICIAN) && signatureBlockValid(signatures.CUSTOMER);
  const canConfirm = reason.trim().length > 0 && anyAttr && attrsValid && signaturesValid;

  function setSig(role: SignerRole, patch: Partial<SignatureFormValue>) {
    setSignatures((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));
  }

  return (
    <DialogShell title="Ajukan Koreksi Identitas" onCancel={onCancel} pending={pending} wide>
      <div className="mt-4 max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <label className="block text-sm font-medium text-slate-700">
          Alasan koreksi *
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={2000}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </label>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-700">Atribut yang dikoreksi *</legend>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={attrs.device}
              onChange={(e) => setAttrs((p) => ({ ...p, device: e.target.checked }))}
            />
            Device
          </label>
          {attrs.device ? (
            <div className="ml-6 space-y-2">
              <Input
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                placeholder="Cari serial / brand / model…"
              />
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {candidatesQuery.isLoading ? (
                  <p className="text-sm text-slate-400">Memuat…</p>
                ) : candidatesQuery.isError ? (
                  <p className="text-sm text-red-600">Gagal memuat kandidat device.</p>
                ) : candidates.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Tidak ada device yang cocok. Device harus didaftarkan lebih dulu oleh
                    admin/kantor.
                  </p>
                ) : (
                  candidates.map((device: CalibrationJobDeviceCandidate) => (
                    <label
                      key={device.id}
                      className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="correction-device"
                        checked={deviceId === device.id}
                        onChange={() => setDeviceId(device.id)}
                      />
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900">
                          {device.serialNumber ?? device.code ?? device.id}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          {[device.brand, device.model].filter(Boolean).join(" ") || "—"}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={attrs.serial}
              onChange={(e) => setAttrs((p) => ({ ...p, serial: e.target.checked }))}
            />
            Serial (observed)
          </label>
          {attrs.serial ? (
            <Input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              maxLength={120}
              className="ml-6 w-[calc(100%-1.5rem)]"
              placeholder="Serial yang benar"
            />
          ) : null}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={attrs.akdAkl}
              onChange={(e) => setAttrs((p) => ({ ...p, akdAkl: e.target.checked }))}
            />
            AKD/AKL/NIE
          </label>
          {attrs.akdAkl ? (
            <Input
              value={akdAkl}
              onChange={(e) => setAkdAkl(e.target.value)}
              maxLength={120}
              className="ml-6 w-[calc(100%-1.5rem)]"
              placeholder="AKD/AKL/NIE yang benar"
            />
          ) : null}
        </fieldset>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-700">Tanda tangan</p>
          {SIGNER_ROLES.map((role) => {
            const sig = signatures[role];
            return (
              <div key={role} className="rounded-md border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {SIGNER_LABEL[role]}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {(["SIGNED", "UNAVAILABLE", "REFUSED"] as SignatureStatus[]).map((s) => (
                    <label key={s} className="flex items-center gap-1.5 text-sm text-slate-700">
                      <input
                        type="radio"
                        name={`sig-${role}`}
                        checked={sig.status === s}
                        onChange={() => setSig(role, { status: s })}
                      />
                      {SIGNATURE_STATUS_LABEL[s]}
                    </label>
                  ))}
                </div>
                {sig.status === "SIGNED" ? (
                  <div className="mt-2 space-y-2">
                    <Input
                      value={sig.signerName}
                      onChange={(e) => setSig(role, { signerName: e.target.value })}
                      maxLength={120}
                      placeholder="Nama penandatangan"
                    />
                  </div>
                ) : (
                  <textarea
                    value={sig.unavailableReason}
                    onChange={(e) => setSig(role, { unavailableReason: e.target.value })}
                    rows={2}
                    maxLength={500}
                    placeholder="Alasan (mis. pelanggan tidak di tempat)"
                    className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-700">Foto BA (lembar tanda tangan)</p>
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm"
          />
          {file ? (
            <p className="text-xs text-slate-500">{file.name}</p>
          ) : (
            <p className="text-xs text-amber-600">
              Tanpa foto sekarang, BA tetap dibuat — unggah nanti di detail sebelum disetujui.
            </p>
          )}
        </div>
      </div>

      <DialogActions
        pending={pending}
        confirmLabel="Ajukan BA"
        disabled={!canConfirm}
        onCancel={onCancel}
        onConfirm={() => onSubmit({ reason, attrs, deviceId, serial, akdAkl, signatures, file })}
      />
    </DialogShell>
  );
}

function DialogShell({
  title,
  children,
  onCancel,
  pending,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  pending: boolean;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`mx-4 w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-lg bg-white p-6 shadow-xl`}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogActions({
  pending,
  confirmLabel,
  onCancel,
  onConfirm,
  disabled,
  destructive,
}: {
  pending: boolean;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        Batal
      </Button>
      <Button
        type="button"
        variant={destructive ? "destructive" : "default"}
        onClick={onConfirm}
        disabled={pending || disabled}
      >
        {pending ? "Memproses…" : confirmLabel}
      </Button>
    </div>
  );
}
