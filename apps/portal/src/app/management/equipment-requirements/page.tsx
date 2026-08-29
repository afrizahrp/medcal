import { Suspense } from "react";
import EquipmentRequirementsPageClient from "./equipment-requirements-page-client";

export default function EquipmentRequirementsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <EquipmentRequirementsPageClient />
    </Suspense>
  );
}
