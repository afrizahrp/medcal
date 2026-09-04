"use client";

import { useRequireSession } from "@medcal/auth/client";

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  const { me, status } = useRequireSession();

  if (status === "loading") {
    return <main className="flex min-h-[100dvh] items-center justify-center text-slate-500">Memuat…</main>;
  }

  if (status === "pending") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-semibold">Menunggu otorisasi</h1>
        <p className="mt-2 text-slate-600">Akun Anda sudah terdaftar tapi belum diaktifkan.</p>
      </main>
    );
  }

  if (status === "forbidden" || !me) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-semibold">Akses ditolak</h1>
        <p className="mt-2 text-slate-600">Akun Anda tidak memiliki akses ke aplikasi ini.</p>
      </main>
    );
  }

  return <>{children}</>;
}
