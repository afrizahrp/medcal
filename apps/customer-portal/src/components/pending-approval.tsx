"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@medcal/auth/client";
import { buttonPrimary, buttonSecondary } from "../lib/ui-classes";

/**
 * Shown for two states this app deliberately does not distinguish in the UI
 * (both mean "not yet authorized to see Customer data"): a freshly
 * self-registered account with no membership at all yet, and an ACTIVE
 * account whose CustomerUserLink hasn't been established. Mirrors
 * apps/portal's PendingAuthorization UX pattern; this app's own copy since
 * apps/customer-portal is isolated from apps/portal (no cross-app import).
 *
 * Only reached when the server has actually answered "not linked" — a failed
 * lookup is an error state (AuthGate), never this screen. The wording is
 * neutral because a returning, not-yet-approved user also lands here.
 */
export function PendingApproval() {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-brand-800">Menunggu persetujuan akun</h1>
      <p className="mt-2 text-slate-600">
        Akun Anda sudah terdaftar, tetapi belum dihubungkan ke data pelanggan oleh tim Kalibrasi
        Medika. Anda dapat mengakses portal setelah akun disetujui.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          // A full reload (not router.refresh()) is required: this
          // component's status derives from client-side query state, which
          // router.refresh() does not reset.
          onClick={() => window.location.reload()}
          className={buttonSecondary}
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
          className={buttonPrimary}
        >
          Kembali ke halaman masuk
        </button>
      </div>
    </main>
  );
}
