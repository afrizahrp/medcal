"use client";

import Link from "next/link";
import { useAuth } from "@medcal/auth/client";
import { buttonPrimary } from "../../lib/ui-classes";

/**
 * Authenticated landing. Operational data lives on the work-order pages;
 * this only confirms the session and points there.
 */
export default function CustomerPortalHome() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-slate-900">Selamat datang{user ? `, ${user.name}` : ""}</h1>
      <p className="mt-2 text-slate-600">
        Akun Anda ({user?.email}) telah terverifikasi untuk mengakses data pelanggan.
      </p>
      <Link href="/work-orders" className={`${buttonPrimary} mt-6`}>
        Lihat Work Order / SPK
      </Link>
    </div>
  );
}
