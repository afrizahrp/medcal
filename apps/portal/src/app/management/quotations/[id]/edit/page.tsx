"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { parseISO } from "date-fns";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../../components/access-denied";
import {
  QuotationFormFields,
  type QuotationFormValue,
} from "../../quotation-form-fields";
import {
  PageHeader,
  Surface,
  formActionsClass,
  formPageClass,
  formSurfaceClass,
  formatQuotationApiError,
  itemsFromQuotation,
  isPositiveIntegerQty,
  moneyNumber,
} from "../../quotations-ui";
import { useQuotation, useUpdateQuotation } from "../../use-quotations-query";

function parseValidUntil(dateStr: string | null): Date | undefined {
  if (!dateStr) return undefined;
  try {
    return parseISO(dateStr);
  } catch {
    return undefined;
  }
}

export default function EditQuotationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const query = useQuotation(params.id);
  const updateMutation = useUpdateQuotation();

  const [form, setForm] = useState<QuotationFormValue>({
    source: "PORTAL",
    validUntil: undefined,
    items: [],
  });
  const [dateOpen, setDateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const quotation = query.data;

  useEffect(() => {
    if (quotation && !initialized) {
      setForm({
        source: quotation.source,
        validUntil: parseValidUntil(quotation.validUntil),
        items: itemsFromQuotation(quotation),
      });
      setInitialized(true);
    }
  }, [quotation, initialized]);

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
          title="Quotation tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/quotations", label: "Quotations" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Quotation tidak ditemukan.</p>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat quotation.</p>
      </div>
    );
  }

  if (quotation.status !== "DRAFT") {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Quotation tidak dapat diedit"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/quotations", label: "Quotations" },
            { href: `/quotations/${quotation.id}`, label: quotation.number },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">
          Hanya quotation DRAFT yang dapat diedit.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/quotations/${quotation.id}`}>Kembali ke Detail</Link>
        </Button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.items.some((item) => !item.requestItemId)) {
      setError("Item quotation tidak lengkap — setiap baris harus terhubung ke item requisition.");
      return;
    }
    for (const item of form.items) {
      if (!item.description.trim()) {
        setError("Setiap item wajib memiliki deskripsi.");
        return;
      }
      if (!isPositiveIntegerQty(item.qty)) {
        setError("Qty setiap item harus bilangan bulat lebih dari 0.");
        return;
      }
      if (item.unitPrice.trim() === "" || moneyNumber(item.unitPrice) < 0) {
        setError("Setiap item wajib memiliki unit price yang valid.");
        return;
      }
    }

    try {
      await updateMutation.mutateAsync({
        id: quotation!.id,
        input: {
          source: form.source,
          validUntil: form.validUntil ?? null,
          items: form.items.map((item) => ({
            requestItemId: item.requestItemId,
            description: item.description.trim(),
            qty: moneyNumber(item.qty),
            unitPrice: moneyNumber(item.unitPrice),
          })),
        },
      });
      router.push(`/quotations/${quotation!.id}`);
    } catch (err) {
      setError(formatQuotationApiError(err, "Gagal memperbarui quotation.").message);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title={`Edit ${quotation.number}`}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/quotations", label: "Quotations" },
          { href: `/quotations/${quotation.id}`, label: quotation.number },
          { label: "Edit" },
        ]}
      />

      <form noValidate onSubmit={submit}>
        <Surface className={formSurfaceClass}>
          {error ? (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Customer</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{quotation.customer.name}</dd>
              <dd className="text-xs text-slate-400">{quotation.customer.number}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Requisition</dt>
              <dd className="mt-0.5">
                <Link
                  href={`/calibration-requests/${quotation.request.id}`}
                  className="font-mono text-sm text-brand-700 hover:underline"
                >
                  {quotation.request.number}
                </Link>
              </dd>
            </div>
          </dl>

          <QuotationFormFields
            value={form}
            onChange={setForm}
            dateOpen={dateOpen}
            onDateOpenChange={setDateOpen}
          />

          <div className={formActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href={`/quotations/${quotation.id}`}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              <Save className="h-4 w-4" />
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}
