import { Suspense } from "react";
import DeviceTypeAliasesPageClient from "./device-type-aliases-page-client";

export default function DeviceTypeAliasesPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <DeviceTypeAliasesPageClient />
    </Suspense>
  );
}
