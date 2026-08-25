import { Suspense } from "react";
import DeviceModelsPageClient from "./device-models-page-client";

export default function DeviceModelsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <DeviceModelsPageClient />
    </Suspense>
  );
}
