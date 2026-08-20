import { Suspense } from "react";
import { EmailFolderPageClient } from "../email-page-client";

export default function EmailInboxPage() {
  return (
    <Suspense fallback={null}>
      <EmailFolderPageClient folder="INBOX" />
    </Suspense>
  );
}
