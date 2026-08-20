import { Suspense } from "react";
import EmailComposePageClient from "./compose-page-client";

export default function EmailComposePage() {
  return (
    <Suspense fallback={null}>
      <EmailComposePageClient />
    </Suspense>
  );
}
