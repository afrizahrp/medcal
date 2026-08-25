import { Suspense } from "react";
import DeviceTypesPageClient from "./device-types-page-client";

export default function DeviceTypesPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <DeviceTypesPageClient />
    </Suspense>
  );
}
