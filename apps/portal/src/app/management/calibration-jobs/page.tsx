import { Suspense } from "react";
import CalibrationJobsPageClient from "./calibration-jobs-page-client";

export default function CalibrationJobsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <CalibrationJobsPageClient />
    </Suspense>
  );
}
