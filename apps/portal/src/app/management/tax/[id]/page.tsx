"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  TaxFormFields,
  buildTaxUpdatePayload,
  formatTaxApiError,
  fractionToPercentInput,
  percentInputToFraction,
  type TaxFormValue,
} from "../tax-form-fields";
import {
  type TaxRow,
  TaxExcludeBadge,
  TaxStatusBadge,
  PageHeader,
  Surface,
  formatTaxRate,
  taxFormActionsClass,
  taxFormPageClass,
  taxFormSurfaceClass,
  selectClassName,
} from "../tax-ui";
import { useTax, useUpdateTax } from "../use-tax-query";

const emptyForm: TaxFormValue = {
  taxCode: "",
  description: "",
  taxRatePercent: "",
  isExclude: false,
};

function formFromTax(tax: TaxRow): TaxFormValue {
  return {
    taxCode: tax.taxCode,
    description: tax.description,
    taxRatePercent: fractionToPercentInput(tax.taxRate),
    isExclude: tax.isExclude,
  };
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{children}</dd>
    </div>
  );
}

export default function TaxDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();
  const taxQuery = useTax(params.id);
  const updateMutation = useUpdateTax();

  const tax = taxQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<TaxFormValue>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!tax) return;
    setForm(formFromTax(tax));
    setIsActive(tax.isActive);
  }, [tax]);

  if (!capabilities?.taxManage) {
    return <AccessDenied />;
  }

  if (taxQuery.isLoading) {
    return (
      <div className={taxFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(taxQuery.error)) {
    return <AccessDenied />;
  }

  if (taxQuery.error instanceof ApiError && taxQuery.error.status === 404) {
    return (
      <div className={taxFormPageClass}>
        <PageHeader
          title="Tax tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/tax", label: "Tax" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Tax tidak ditemukan.</p>
      </div>
    );
  }

  if (!tax) {
    return (
      <div className={taxFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat tax.</p>
      </div>
    );
  }

  function setField<K extends keyof TaxFormValue>(field: K, next: TaxFormValue[K]) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  function resetForm() {
    setForm(formFromTax(tax!));
    setIsActive(tax!.isActive);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.taxCode.trim()) {
      setError("Kode tax wajib diisi.");
      return;
    }
    if (!form.description.trim()) {
      setError("Deskripsi tax wajib diisi.");
      return;
    }
    if (percentInputToFraction(form.taxRatePercent) == null) {
      setError("Tarif tax wajib diisi antara 0 dan 100.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: tax!.id,
        input: buildTaxUpdatePayload({ ...form, isActive }),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await taxQuery.refetch();
    } catch (err) {
      setError(formatTaxApiError(err));
    }
  }

  return (
    <div className={taxFormPageClass}>
      <PageHeader
        title={tax.description}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/tax", label: "Tax" },
          { label: tax.taxCode },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={taxFormSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-sm text-slate-600">{tax.taxCode}</p>
          {editing ? (
            <select
              value={isActive ? "true" : "false"}
              onChange={(e) => setIsActive(e.target.value === "true")}
              className={`${selectClassName} min-w-[140px]`}
              aria-label="Status"
            >
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          ) : (
            <TaxStatusBadge isActive={tax.isActive} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <TaxFormFields value={form} onChange={setField} />

            <div className={taxFormActionsClass}>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="mt-3 space-y-3 text-sm">
              <DetailField label="Kode">
                <span className="font-mono font-medium text-slate-900">{tax.taxCode}</span>
              </DetailField>

              <DetailField label="Deskripsi">
                <span className="font-medium text-slate-900">{tax.description}</span>
              </DetailField>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Tarif">
                  <span className="font-medium">{formatTaxRate(tax.taxRate)}</span>
                </DetailField>
                <DetailField label="Perlakuan">
                  <TaxExcludeBadge isExclude={tax.isExclude} />
                </DetailField>
              </div>
            </dl>

            <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </div>
          </>
        )}
      </Surface>
    </div>
  );
}
