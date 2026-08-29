import { Suspense } from "react";
import EquipmentUnitsPageClient from "./equipment-units-page-client";

export default function EquipmentUnitsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <EquipmentUnitsPageClient />
    </Suspense>
  );
}
