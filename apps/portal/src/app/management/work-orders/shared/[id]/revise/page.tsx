"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../../../components/access-denied";
import { formPageClass, formSurfaceClass } from "../../../../quotations/quotations-ui";
import { ConfirmDialog, PageHeader, Surface } from "../../../work-orders-ui";
import {
  useAssignableUsers,
  useReviseSharedSpk,
  useSharedSpk,
} from "../../../use-work-orders-query";
import { usePurchaseOrderAllocationSummary } from "../../../../purchase-orders/use-purchase-orders-query";
import { SharedSpkRevisionEditor, type RevisionUser } from "../../../shared-spk-revision-editor";
import {
  buildRevisionSummary,
  canReviseParent,
  executeRevision,
  initRevisionState,
  reconcileRevisionState,
  revisionReducer,
  validateRevision,
  type PoItemAvailability,
  type RevisionAction,
  type RevisionErrorInfo,
  type RevisionState,
} from "../../../shared-spk-revision";

const SUMMARY_KIND_LABEL = {
  locked: "Terkunci",
  changed: "Diubah",
  removed: "Dibatalkan",
  new: "Baru",
} as const;

/**
 * Revise the distribution of an existing shared ON_SITE job. Calls the existing
 * PUT /work-orders/shared/:id/distribution — the backend decides what is
 * allowed; this screen only edits, previews and reports. Revision is per Child:
 * started / done / cancelled Children are shown read-only.
 */
export default function SharedSpkRevisePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();
  const canRevise = Boolean(capabilities?.workOrderUpdate && capabilities?.workOrderAssign);

  const parentQuery = useSharedSpk(params.id, { poll: false });
  const parent = parentQuery.data;
  const summaryQuery = usePurchaseOrderAllocationSummary(
    capabilities?.purchaseOrderRead ? parent?.purchaseOrder.id : undefined,
  );
  const usersQuery = useAssignableUsers(canRevise);
  const reviseMutation = useReviseSharedSpk();

  const [state, setState] = useState<RevisionState | null>(null);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [error, setError] = useState<RevisionErrorInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removeKey, setRemoveKey] = useState<string | null>(null);
  // Set once the API accepted the revision, so the refreshed Parent data is not
  // mistaken for "changed by another user" while navigating away.
  const [finished, setFinished] = useState(false);

  // Initialise once, then reconcile whenever fresh server data arrives (focus
  // refetch, post-error refetch): a Child that started meanwhile is dropped from
  // the editable set; every other edit is kept.
  useEffect(() => {
    if (!parent || finished) return;
    setState((current) => (current ? reconcileRevisionState(current, parent) : initRevisionState(parent)));
  }, [parent, finished]);

  const dispatch = useCallback((action: RevisionAction) => {
    setState((current) => (current ? revisionReducer(current, action) : current));
  }, []);

  const users = useMemo<RevisionUser[]>(
    () =>
      (usersQuery.data?.data ?? [])
        .filter((user) => user.status === "ACTIVE" && user.membership && user.membership.role !== "CUSTOMER")
        .map((user) => ({ id: user.id, label: user.name ?? user.email })),
    [usersQuery.data],
  );
  const userName = useCallback(
    (id: string) => {
      const known = users.find((user) => user.id === id)?.label;
      if (known) return known;
      const fromChildren = parent?.children.flatMap((child) => child.technicians).find((row) => row.id === id);
      return fromChildren ? (fromChildren.name ?? fromChildren.email) : id;
    },
    [users, parent],
  );

  const items = useMemo<PoItemAvailability[]>(
    () =>
      (summaryQuery.data?.items ?? []).map((item) => ({
        purchaseOrderItemId: item.purchaseOrderItemId,
        label: item.description,
        total: item.qty,
        remaining: item.remainingQty,
      })),
    [summaryQuery.data],
  );
  const itemLabel = useCallback(
    (id: string) => items.find((item) => item.purchaseOrderItemId === id)?.label ?? id,
    [items],
  );

  if (!canRevise) return <AccessDenied />;
  if (isForbidden(parentQuery.error) || isForbidden(summaryQuery.error) || isForbidden(usersQuery.error)) {
    return <AccessDenied />;
  }
  if (parentQuery.isLoading || summaryQuery.isLoading || !state) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }
  if (parentQuery.error instanceof ApiError && parentQuery.error.status === 404) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="SPK tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/work-orders", label: "Work Orders" },
          ]}
        />
      </div>
    );
  }
  if (!parent || !summaryQuery.data) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat data SPK bersama.</p>
      </div>
    );
  }

  const validation = validateRevision(state, parent, items);
  const summary = buildRevisionSummary(parent, state, { userName, itemLabel });
  const removeRow = state.rows.find((row) => row.key === removeKey) ?? null;

  async function submit() {
    if (!state || !validation.valid || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await executeRevision({
      state,
      revise: (input) => reviseMutation.mutateAsync({ id: params.id, input }),
    });
    if (result.ok) {
      // Success is only reported after the API accepted the revision; the
      // mutation already refreshed the Parent data.
      setFinished(true);
      router.push(`/work-orders/shared/${params.id}`);
      return;
    }
    setError(result.error);
    setStep("edit");
    setSubmitting(false);
    if (result.error.refresh) {
      // Re-fetch the live structure + remaining quantities; the reconcile effect
      // drops any Child that is no longer editable and keeps the other edits.
      await Promise.all([parentQuery.refetch(), summaryQuery.refetch()]);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title="Revisi Distribusi"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/work-orders", label: "Work Orders" },
          { href: `/work-orders/shared/${parent.id}`, label: parent.number },
          { label: "Revisi Distribusi" },
        ]}
      />

      <Surface className={formSurfaceClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-slate-600">{parent.number}</p>
            <p className="mt-1 text-xs text-slate-500">
              Revisi berlaku per SPK Child. SPK Child yang sudah dimulai terkunci; nomor SPK induk tidak
              berubah.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/work-orders/shared/${parent.id}`}>Kembali ke SPK Induk</Link>
          </Button>
        </div>

        {!canReviseParent(parent) ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <Lock className="h-4 w-4" />
            Semua SPK Child terkunci. Tidak ada revisi yang tersedia.
          </p>
        ) : null}

        {state.notices.length > 0 ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
            <ul className="space-y-0.5">
              {state.notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
            <button type="button" className="mt-1 text-xs underline" onClick={() => dispatch({ type: "dismissNotices" })}>
              Tutup
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error.message}
          </p>
        ) : null}

        <div className="mt-5">
          {step === "edit" ? (
            <SharedSpkRevisionEditor
              parent={parent}
              items={items}
              users={users}
              state={state}
              validation={validation}
              dispatch={dispatch}
              onRequestRemove={setRemoveKey}
              disabled={submitting}
            />
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Tinjau perubahan</h3>
              <ul className="space-y-2">
                {summary.map((entry) => (
                  <li key={entry.key} className="rounded-md border border-slate-200 p-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                      <span className="font-mono">{entry.label}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        {SUMMARY_KIND_LABEL[entry.kind]}
                      </span>
                    </p>
                    <ul className="mt-1 space-y-0.5 text-slate-600">
                      {entry.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {step === "edit" && !validation.valid ? (
          <ul className="mt-4 space-y-0.5 text-sm text-slate-500">
            {validation.global.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
          {step === "review" ? (
            <>
              <Button type="button" variant="outline" disabled={submitting} onClick={() => setStep("edit")}>
                Kembali
              </Button>
              <Button type="button" disabled={!validation.valid || submitting} onClick={submit}>
                {submitting ? "Menyimpan…" : "Simpan Revisi"}
              </Button>
            </>
          ) : (
            <Button type="button" disabled={!validation.valid || submitting} onClick={() => setStep("review")}>
              Tinjau Perubahan
            </Button>
          )}
        </div>
      </Surface>

      <ConfirmDialog
        open={removeRow !== null}
        title="Batalkan SPK Child ini?"
        description={`${removeRow?.number ?? "SPK Child"} akan dibatalkan saat revisi disimpan. Unit yang dialokasikan dilepas kembali ke Purchase Order, dan nomornya tidak dipakai ulang.`}
        confirmLabel="Batalkan SPK Child"
        variant="destructive"
        onCancel={() => setRemoveKey(null)}
        onConfirm={() => {
          if (removeKey) dispatch({ type: "toggleRemove", key: removeKey });
          setRemoveKey(null);
        }}
      />
    </div>
  );
}
