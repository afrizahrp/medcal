import { Suspense } from "react";
import DeviceManufacturersPageClient from "./device-manufacturers-page-client";

export default function DeviceManufacturersPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <DeviceManufacturersPageClient />
    </Suspense>
  );
}
