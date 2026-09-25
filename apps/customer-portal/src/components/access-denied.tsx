export function AccessDenied({ message }: { message?: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-red-700">Akses Ditolak</h1>
      <p className="mt-2 text-slate-600">
        {message ?? "Akun Anda tidak memiliki akses ke Customer Portal."}
      </p>
    </main>
  );
}
