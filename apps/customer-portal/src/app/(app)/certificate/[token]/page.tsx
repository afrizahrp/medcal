/**
 * PLACEHOLDER ROUTE — exists only to prove the QR deep-link / returnTo
 * mechanism end-to-end (AuthGate -> sign-in?returnTo=/certificate/<token> ->
 * back here after authentication). It does NOT look up, fetch, or expose any
 * certificate data — that is certificate API / authorization work for a
 * future phase, explicitly out of scope here.
 */
export default async function CertificatePlaceholderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-slate-900">Certificate placeholder</h1>
      <p className="mt-2 text-slate-600">
        Reserved for a future phase — certificate lookup/authorization is not implemented yet.
      </p>
      <p className="mt-4 text-xs text-slate-400">Token (unvalidated, not looked up): {token}</p>
    </div>
  );
}
