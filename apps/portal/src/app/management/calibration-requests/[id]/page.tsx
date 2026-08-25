"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Edit, Send, X } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  PageHeader,
  Surface,
  formPageClass,
  formSurfaceClass,
  StatusBadge,
  ServiceModeBadge,
  DetailField,
  ConfirmDialog,
  SERVICE_MODE_LABELS,
} from "../calibration-requests-ui";
import { formatRelativeTime } from "../../leads/leads-ui";
import {
  useCalibrationRequest,
  useSubmitCalibrationRequest,
  useCancelCalibrationRequest,
} from "../use-calibration-requests-query";

export default function CalibrationRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const query = useCalibrationRequest(params.id);
  const submitMutation = useSubmitCalibrationRequest();
  const cancelMutation = useCancelCalibrationRequest();

  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const request = query.data;

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
          title="Calibration Request tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/calibration-requests", label: "Calibration Requests" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Calibration request tidak ditemukan.</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat calibration request.</p>
      </div>
    );
  }

  const isDraft = request.status === "DRAFT";
  const isSubmitted = request.status === "SUBMITTED";
  const canCancel =
    request.status !== "CANCELLED" && request.status !== "FULFILLED";
  const isReadOnly = !isDraft;

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    try {
      await submitMutation.mutateAsync(request!.id);
      setSuccess("Calibration request berhasil disubmit.");
      setShowSubmitConfirm(false);
      await query.refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.data?.message ?? err.message);
      } else {
        setError("Gagal submit calibration request.");
      }
      setShowSubmitConfirm(false);
    }
  }

  async function handleCancel() {
    setError(null);
    setSuccess(null);
    try {
      await cancelMutation.mutateAsync(request!.id);
      setSuccess("Calibration request berhasil dibatalkan.");
      setShowCancelConfirm(false);
      await query.refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.data?.message ?? err.message);
      } else {
        setError("Gagal membatalkan calibration request.");
      }
      setShowCancelConfirm(false);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title={request.number}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/calibration-requests", label: "Calibration Requests" },
          { label: request.number },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={formSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-sm text-slate-600">{request.number}</p>
          <StatusBadge status={request.status} />
        </div>

        {isReadOnly ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Request ini tidak dapat diedit dalam status saat ini.
          </p>
        ) : null}

        <dl className="mt-4 space-y-4 text-sm">
          <DetailField label="Customer">
            <Link
              href={`/customers/${request.customer.id}`}
              className="font-medium text-brand-700 hover:underline"
            >
              {request.customer.name}
            </Link>
            <span className="ml-2 text-slate-400">({request.customer.number})</span>
          </DetailField>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Service Mode">
              <ServiceModeBadge mode={request.serviceMode} />
            </DetailField>
            <DetailField label="Created">
              {formatRelativeTime(request.createdAt)}
            </DetailField>
          </div>

          {request.desiredScheduleNote ? (
            <DetailField label="Desired Schedule">
              {request.desiredScheduleNote}
            </DetailField>
          ) : null}

          {request.notes ? (
            <DetailField label="Notes">
              <span className="whitespace-pre-wrap">{request.notes}</span>
            </DetailField>
          ) : null}
        </dl>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">
            Devices ({request.items.length})
          </h3>
          <div className="mt-3 space-y-2">
            {request.items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 bg-slate-50/50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {item.device.brand ?? "Unknown"} {item.device.model ?? ""}
                    </p>
                    {item.device.serialNumber ? (
                      <p className="mt-0.5 font-mono text-xs text-slate-500">
                        S/N: {item.device.serialNumber}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-1 text-sm text-slate-600">{item.notes}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/calibration-requests">
              <ArrowLeft className="h-4 w-4" />
              Back to List
            </Link>
          </Button>

          {isDraft ? (
            <>
              <Button type="button" variant="outline" asChild>
                <Link href={`/calibration-requests/${request.id}/edit`}>
                  <Edit className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button type="button" onClick={() => setShowSubmitConfirm(true)}>
                <Send className="h-4 w-4" />
                Submit
              </Button>
            </>
          ) : null}

          {canCancel ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowCancelConfirm(true)}
            >
              <X className="h-4 w-4" />
              Cancel Request
            </Button>
          ) : null}
        </div>
      </Surface>

      <ConfirmDialog
        open={showSubmitConfirm}
        title="Submit Calibration Request?"
        description="Setelah disubmit, request tidak dapat diedit lagi. Lanjutkan?"
        confirmLabel="Submit"
        onConfirm={handleSubmit}
        onCancel={() => setShowSubmitConfirm(false)}
        loading={submitMutation.isPending}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Calibration Request?"
        description="Request yang dibatalkan tidak dapat dipulihkan. Lanjutkan?"
        confirmLabel="Cancel Request"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelConfirm(false)}
        loading={cancelMutation.isPending}
        variant="destructive"
      />
    </div>
  );
}
