import { Suspense } from "react";
import { EmailFolderPageClient } from "../email-page-client";

export default function EmailSentPage() {
  return (
    <Suspense fallback={null}>
      <EmailFolderPageClient folder="SENT" />
    </Suspense>
  );
}
