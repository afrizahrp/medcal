import { Suspense } from "react";
import CustomersPageClient from "./customers-page-client";

export default function CustomersPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400 md:px-8">Memuat…</p>}>
      <CustomersPageClient />
    </Suspense>
  );
}
