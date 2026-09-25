"use client";

import { useAuth } from "@medcal/auth/client";
import { useCustomerLink } from "../../lib/use-customer-link";

/**
 * Minimal authenticated landing — intentionally not a dashboard. Confirms
 * the customer is authenticated and authorized; business features (certificate
 * list, history, etc.) belong to a later phase.
 */
export default function CustomerPortalHome() {
  const { user } = useAuth();
  const customerLinkQuery = useCustomerLink(true);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-slate-900">Selamat datang{user ? `, ${user.name}` : ""}</h1>
      <p className="mt-2 text-slate-600">
        Akun Anda ({user?.email}) telah terverifikasi untuk mengakses data Customer.
      </p>
      {customerLinkQuery.data?.customerId && (
        <p className="mt-1 text-xs text-slate-400">Customer ID: {customerLinkQuery.data.customerId}</p>
      )}
      <p className="mt-6 text-sm text-slate-500">
        Fitur sertifikat kalibrasi akan tersedia di sini pada tahap berikutnya.
      </p>
    </div>
  );
}
