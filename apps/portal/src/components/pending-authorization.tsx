"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@medcal/auth/client";

/**
 * Account-lifecycle state distinct from AccessDenied (see access-denied.tsx):
 * this fires when /me returns code "ACCOUNT_PENDING" — the account was
 * created successfully but has no ACTIVE membership yet (G1/G5). It must
 * never imply the signup failed or that the user did anything wrong.
 */
export function PendingAuthorization() {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-brand-800">Registrasi Berhasil</h1>
      <p className="mt-2 text-slate-600">
        Selamat datang di Kalibrasi Medika. Akun Anda telah berhasil dibuat dan saat ini
        menunggu otorisasi dari administrator.
      </p>
      <p className="mt-2 text-slate-600">
        Mohon tunggu hingga akun Anda diaktifkan. Anda akan dapat mengakses aplikasi setelah
        proses otorisasi selesai.
      </p>
      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          // A full reload (not router.refresh()) is required here: this
          // component's own session/status state lives in useRequireSession's
          // client state, which router.refresh() does not reset.
          onClick={() => window.location.reload()}
          className="h-11 rounded-shell border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
          className="h-11 rounded-shell bg-brand-800 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          Kembali ke Sign In
        </button>
      </div>
    </main>
  );
}
