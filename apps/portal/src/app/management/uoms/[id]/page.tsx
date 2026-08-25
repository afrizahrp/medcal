"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  UomFormFields,
  buildUomUpdatePayload,
  formatUomApiError,
  type UomFormValue,
} from "../uom-form-fields";
import {
  type UomRow,
  UomCategoryBadge,
  UomStatusBadge,
  PageHeader,
  Surface,
  uomFormActionsClass,
  uomFormPageClass,
  uomFormSurfaceClass,
  selectClassName,
} from "../uoms-ui";
import { useUom, useUpdateUom } from "../use-uoms-query";

const emptyForm: UomFormValue = {
  code: "",
  name: "",
  symbol: "",
  category: "",
};

function formFromUom(uom: UomRow): UomFormValue {
  return {
    code: uom.code,
    name: uom.name,
    symbol: uom.symbol,
    category: uom.category,
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

export default function UomDetailPage() {
  const params = useParams<{ id: string }>();
  const { capabilities } = useAuthz();
  const uomQuery = useUom(params.id);
  const updateMutation = useUpdateUom();

  const uom = uomQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UomFormValue>(emptyForm);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!uom) return;
    setForm(formFromUom(uom));
    setIsActive(uom.isActive);
  }, [uom]);

  if (!capabilities?.uomRead) {
    return <AccessDenied />;
  }

  if (uomQuery.isLoading) {
    return (
      <div className={uomFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(uomQuery.error)) {
    return <AccessDenied />;
  }

  if (uomQuery.error instanceof ApiError && uomQuery.error.status === 404) {
    return (
      <div className={uomFormPageClass}>
        <PageHeader
          title="UOM tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/uoms", label: "UOM" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">UOM tidak ditemukan.</p>
      </div>
    );
  }

  if (!uom) {
    return (
      <div className={uomFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat UOM.</p>
      </div>
    );
  }

  function setField<K extends keyof UomFormValue>(field: K, next: UomFormValue[K]) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  function resetForm() {
    setForm(formFromUom(uom!));
    setIsActive(uom!.isActive);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.uomUpdate) return;
    setError(null);
    setSuccess(null);

    if (!form.code.trim()) {
      setError("Kode UOM wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama UOM wajib diisi.");
      return;
    }
    if (!form.symbol.trim()) {
      setError("Simbol UOM wajib diisi.");
      return;
    }
    if (!form.category) {
      setError("Kategori UOM wajib dipilih.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: uom!.id,
        input: buildUomUpdatePayload({ ...form, isActive }),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await uomQuery.refetch();
    } catch (err) {
      setError(formatUomApiError(err));
    }
  }

  return (
    <div className={uomFormPageClass}>
      <PageHeader
        title={uom.name}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/uoms", label: "UOM" },
          { label: uom.code },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={uomFormSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-sm text-slate-600">{uom.code}</p>
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
            <UomStatusBadge isActive={uom.isActive} />
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <UomFormFields value={form} onChange={setField} />

            <div className={uomFormActionsClass}>
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
                <span className="font-mono font-medium text-slate-900">{uom.code}</span>
              </DetailField>

              <DetailField label="Nama">
                <span className="font-medium text-slate-900">{uom.name}</span>
              </DetailField>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Simbol">
                  <span className="font-medium">{uom.symbol}</span>
                </DetailField>
                <DetailField label="Kategori">
                  <UomCategoryBadge category={uom.category} />
                </DetailField>
              </div>
            </dl>

            {capabilities.uomUpdate ? (
              <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Surface>
    </div>
  );
}
