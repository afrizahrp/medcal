import { Suspense } from "react";
import DeviceCapabilitiesPageClient from "./device-capabilities-page-client";

export default function DeviceCapabilitiesPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <DeviceCapabilitiesPageClient />
    </Suspense>
  );
}
