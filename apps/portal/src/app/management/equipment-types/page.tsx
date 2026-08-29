import { Suspense } from "react";
import EquipmentTypesPageClient from "./equipment-types-page-client";

export default function EquipmentTypesPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <EquipmentTypesPageClient />
    </Suspense>
  );
}
