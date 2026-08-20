import { Suspense } from "react";
import { EmailFolderPageClient } from "../email-page-client";

export default function EmailTrashPage() {
  return (
    <Suspense fallback={null}>
      <EmailFolderPageClient folder="TRASH" />
    </Suspense>
  );
}
