/**
 * 403 UX: authenticated-but-unauthorized, distinct from the sign-in redirect
 * used for 401. A hidden menu item is not a security boundary — this state
 * only ever appears because the backend itself returned 403 (or because the
 * layout-level session check found no usable membership at all); it must
 * never be reached by inferring authorization client-side.
 */
export function AccessDenied({ message }: { message?: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Access Denied</h1>
      <p className="mt-2 text-slate-600">
        {message ?? "Your account does not have permission to view this."}
      </p>
    </main>
  );
}
