import { Suspense } from "react";
import ImportCalibrationRequestPageClient from "./import-page-client";

export default function ImportCalibrationRequestPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <ImportCalibrationRequestPageClient />
    </Suspense>
  );
}
