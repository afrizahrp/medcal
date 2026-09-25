"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@medcal/auth/client";

/**
 * Shown for two states this app deliberately does not distinguish in the UI
 * (both mean "not yet authorized to see Customer data"): a freshly
 * self-registered account with no membership at all yet, and an ACTIVE
 * account whose CustomerUserLink hasn't been established. Mirrors
 * apps/portal's PendingAuthorization UX pattern; this app's own copy since
 * apps/customer-portal is isolated from apps/portal (no cross-app import).
 */
export function PendingApproval() {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-brand-800">Registrasi Berhasil</h1>
      <p className="mt-2 text-slate-600">
        Akun Anda telah berhasil dibuat dan saat ini menunggu otorisasi dari tim Kalibrasi
        Medika sebelum dapat mengakses data pelanggan.
      </p>
      <p className="mt-2 text-slate-600">
        Mohon tunggu hingga akun Anda dikaitkan dengan data Customer Anda.
      </p>
      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          // A full reload (not router.refresh()) is required: this
          // component's status derives from client-side query state, which
          // router.refresh() does not reset.
          onClick={() => window.location.reload()}
          className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Periksa status
        </button>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.push("/sign-in");
            router.refresh();
          }}
          className="h-11 rounded-lg bg-brand-800 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          Kembali ke Sign In
        </button>
      </div>
    </main>
  );
}
