import { Suspense } from "react";
import { EmailFolderPageClient } from "../email-page-client";

export default function EmailDraftsPage() {
  return (
    <Suspense fallback={null}>
      <EmailFolderPageClient folder="DRAFTS" />
    </Suspense>
  );
}
