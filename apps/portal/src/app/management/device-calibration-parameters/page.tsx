import { Suspense } from "react";
import DeviceCalibrationParametersPageClient from "./device-calibration-parameters-page-client";

export default function DeviceCalibrationParametersPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <DeviceCalibrationParametersPageClient />
    </Suspense>
  );
}
