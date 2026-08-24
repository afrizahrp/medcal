"use client";

import { ApiError } from "@medcal/shared";
import type { CustomerCreateInput, CustomerUpdateInput } from "@medcal/shared";

export function formatCustomerApiError(err: unknown, fallback = "Terjadi kesalahan."): string {
  if (err instanceof ApiError) {
    const code = err.data?.code;
    if (code === "DUPLICATE_CUSTOMER_EMAIL") {
      return "Email kontak sudah terdaftar untuk customer lain di perusahaan ini.";
    }
    if (code === "DUPLICATE_CUSTOMER_TAX_ID") {
      return "Tax ID / NPWP sudah terdaftar untuk customer lain di perusahaan ini.";
    }
    if (code === "LEAD_ALREADY_CONVERTED") {
      return "Lead sudah dikonversi ke customer.";
    }
    if (typeof err.data?.message === "string") return err.data.message;
    return err.message;
  }
  return fallback;
}

export function buildCreatePayload(form: {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactTitle: string;
}): CustomerCreateInput {
  const payload: CustomerCreateInput = {
    name: form.name.trim(),
  };
  if (form.legalName.trim()) payload.legalName = form.legalName.trim();
  if (form.taxId.trim()) payload.taxId = form.taxId.trim();
  if (form.address.trim()) payload.address = form.address.trim();

  const contact = buildContactPayload(form);
  if (contact) payload.contact = contact;

  return payload;
}

export function buildUpdatePayload(form: {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  status: "ACTIVE" | "INACTIVE";
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactTitle: string;
}): CustomerUpdateInput {
  const payload: CustomerUpdateInput = {
    name: form.name.trim(),
    legalName: form.legalName.trim() || null,
    taxId: form.taxId.trim() || null,
    address: form.address.trim() || null,
    status: form.status,
  };

  const contact = buildContactPayload(form);
  if (contact) payload.contact = contact;

  return payload;
}

function buildContactPayload(form: {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactTitle: string;
}) {
  const hasContact =
    form.contactName.trim() ||
    form.contactEmail.trim() ||
    form.contactPhone.trim() ||
    form.contactTitle.trim();

  if (!hasContact || !form.contactName.trim()) return undefined;

  return {
    name: form.contactName.trim(),
    email: form.contactEmail.trim() || null,
    phone: form.contactPhone.trim() || null,
    title: form.contactTitle.trim() || null,
  };
}
