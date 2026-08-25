import { Suspense } from "react";
import CalibrationRequestsPageClient from "./calibration-requests-page-client";

export default function CalibrationRequestsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <CalibrationRequestsPageClient />
    </Suspense>
  );
}
