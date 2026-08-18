import { Suspense } from "react";
import LeadsPageClient from "./leads-page-client";

// Server wrapper — LeadsPageClient uses next/navigation's useSearchParams
// (via useUrlQueryState) for URL-synced filter/search/sort/page state, which
// Next.js requires to be wrapped in a Suspense boundary.
export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsPageClient />
    </Suspense>
  );
}
