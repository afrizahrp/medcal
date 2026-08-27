"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import { useCalibrationRequest } from "../../calibration-requests/use-calibration-requests-query";
import {
  QuotationFormFields,
  type QuotationFormValue,
} from "../quotation-form-fields";
import {
  PageHeader,
  Surface,
  formActionsClass,
  formPageClass,
  formSurfaceClass,
  formatQuotationApiError,
  itemsFromRequest,
  isPositiveIntegerQty,
  moneyNumber,
  previewTotals,
} from "../quotations-ui";
import { useCreateQuotation, useQuotations } from "../use-quotations-query";
import { useTaxes } from "../use-taxes-query";

const QUOTABLE_STATUSES = ["SUBMITTED", "IN_QUOTATION"] as const;

function NewQuotationPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get("requestId") ?? "";
  const { capabilities } = useAuthz();

  const requestQuery = useCalibrationRequest(requestId || undefined);
  const existingQuery = useQuotations(
    {
      search: "",
      status: "",
      requestId,
      sortBy: "createdAt",
      sortDir: "desc",
      page: 1,
      pageSize: 1,
    },
    Boolean(requestId),
  );
  const createMutation = useCreateQuotation();
  const taxesQuery = useTaxes();

  const [form, setForm] = useState<QuotationFormValue>({
    source: "PORTAL",
    validUntil: undefined,
    taxCode: "",
    headerDiscountAmount: "0",
    items: [],
  });
  const [dateOpen, setDateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingQuotationId, setExistingQuotationId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const request = requestQuery.data;
  const existing = existingQuery.data?.data[0];

  useEffect(() => {
    if (request && !initialized) {
      setForm((prev) => ({ ...prev, items: itemsFromRequest(request.items) }));
      setInitialized(true);
    }
  }, [request, initialized]);

  if (!capabilities?.quotationCreate) {
    return <AccessDenied />;
  }

  if (!requestId) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="New Quotation"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/quotations", label: "Quotations" },
            { label: "New" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">
          Quotation hanya dapat dibuat dari Requisition. Buka requisition yang sudah
          submitted, lalu pilih Create Quotation.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/calibration-requests">Ke Requisitions</Link>
        </Button>
      </div>
    );
  }

  if (isForbidden(requestQuery.error) || isForbidden(existingQuery.error)) {
    return <AccessDenied />;
  }

  if (requestQuery.isLoading || existingQuery.isLoading) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (requestQuery.error instanceof ApiError && requestQuery.error.status === 404) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Requisition tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/quotations", label: "Quotations" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Requisition tidak ditemukan.</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className={formPageClass}>
        <p className="text-sm text-red-600">Gagal memuat requisition.</p>
      </div>
    );
  }

  if (existing) {
    return (
      <div className={formPageClass}>
        <PageHeader
          title="Quotation sudah ada"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/quotations", label: "Quotations" },
            { label: "New" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">
          Requisition {request.number} sudah memiliki quotation {existing.number}.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/quotations/${existing.id}`}>Lihat Quotation</Link>
        </Button>
      </div>
    );
  }

  const canQuote = QUOTABLE_STATUSES.includes(
    request.status as (typeof QUOTABLE_STATUSES)[number],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExistingQuotationId(null);

    if (!canQuote) {
      setError("Requisition belum dalam status yang bisa dibuatkan quotation.");
      return;
    }

    if (form.items.length === 0) {
      setError("Requisition tidak memiliki item.");
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
      const gross = moneyNumber(item.qty || "1") * moneyNumber(item.unitPrice);
      if (moneyNumber(item.discountAmount) < 0) {
        setError("Diskon item tidak boleh negatif.");
        return;
      }
      if (moneyNumber(item.discountAmount) > gross) {
        setError("Diskon item tidak boleh melebihi jumlah bruto item.");
        return;
      }
    }

    const preview = previewTotals(form.items, null, form.headerDiscountAmount);
    if (moneyNumber(form.headerDiscountAmount) < 0) {
      setError("Header discount tidak boleh negatif.");
      return;
    }
    if (moneyNumber(form.headerDiscountAmount) > preview.subtotal) {
      setError("Header discount tidak boleh melebihi subtotal.");
      return;
    }

    if (!form.taxCode) {
      setError("Pilih tax pada header quotation.");
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        requestId: request!.id,
        source: form.source,
        validUntil: form.validUntil,
        taxCode: form.taxCode,
        headerDiscountAmount: moneyNumber(form.headerDiscountAmount),
        items: form.items.map((item) => ({
          requestItemId: item.requestItemId,
          description: item.description.trim(),
          qty: moneyNumber(item.qty),
          unitPrice: moneyNumber(item.unitPrice),
          discountAmount: moneyNumber(item.discountAmount),
        })),
      });
      router.push(`/quotations/${result.id}?created=1`);
    } catch (err) {
      const formatted = formatQuotationApiError(err, "Gagal membuat quotation.");
      setError(formatted.message);
      if (formatted.quotationId) setExistingQuotationId(formatted.quotationId);
    }
  }

  return (
    <div className={formPageClass}>
      <PageHeader
        title="New Quotation"
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/quotations", label: "Quotations" },
          { href: `/calibration-requests/${request.id}`, label: request.number },
          { label: "New" },
        ]}
      />

      <form noValidate onSubmit={submit}>
        <Surface className={formSurfaceClass}>
          {error ? (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              <p>{error}</p>
              {existingQuotationId ? (
                <Link
                  href={`/quotations/${existingQuotationId}`}
                  className="mt-2 inline-block font-medium text-red-800 underline"
                >
                  Buka quotation yang sudah ada
                </Link>
              ) : null}
            </div>
          ) : null}

          {!canQuote ? (
            <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Requisition ini tidak dalam status yang memungkinkan pembuatan quotation.
            </p>
          ) : null}

          <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Customer</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{request.customer.name}</dd>
              <dd className="text-xs text-slate-400">{request.customer.number}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Requisition</dt>
              <dd className="mt-0.5">
                <Link
                  href={`/calibration-requests/${request.id}`}
                  className="font-mono text-sm text-brand-700 hover:underline"
                >
                  {request.number}
                </Link>
              </dd>
            </div>
          </dl>

          <QuotationFormFields
            value={form}
            onChange={setForm}
            dateOpen={dateOpen}
            onDateOpenChange={setDateOpen}
            taxes={taxesQuery.data?.data ?? []}
            taxesLoading={taxesQuery.isLoading}
          />

          <div className={formActionsClass}>
            <Button type="button" variant="outline" asChild>
              <Link href={`/calibration-requests/${request.id}`}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !canQuote}>
              <Save className="h-4 w-4" />
              {createMutation.isPending ? "Creating…" : "Create Quotation"}
            </Button>
          </div>
        </Surface>
      </form>
    </div>
  );
}

export default function NewQuotationPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 lg:px-8">
          <p className="text-sm text-slate-400">Memuat…</p>
        </div>
      }
    >
      <NewQuotationPageInner />
    </Suspense>
  );
}
