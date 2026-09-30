import { redirect } from "next/navigation";

/**
 * Legacy QR deep-link path. The verification flow lives at
 * /verify/certificate/<token>; this only forwards so any link already using
 * /certificate/<token> keeps working. The token is passed through untouched —
 * it is never looked up or validated here.
 */
export default async function LegacyCertificateRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/verify/certificate/${encodeURIComponent(token)}`);
}
