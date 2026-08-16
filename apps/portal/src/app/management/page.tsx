import Link from "next/link";

/**
 * Channel selector — the primary entry point into staff work. Each tile
 * routes into its own domain (Messages -> Lead Inbox, Chat -> Chat Inbox);
 * Chat never routes through Lead Inbox, and Lead Inbox never shows the Chat
 * conversation UI (Web Chat correction, locked).
 */
export default function ManagementHome() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Selamat datang kembali</h1>
      <p className="mt-2 text-slate-600">
        Anda dapat melihat dan membalas semua pesan pelanggan.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/leads"
          className="rounded border border-slate-200 p-5 transition hover:bg-slate-50"
        >
          <h2 className="font-medium">Messages</h2>
          <p className="mt-1 text-sm text-slate-500">
            Contact form dan WhatsApp
          </p>
        </Link>

        <Link
          href="/chat"
          className="rounded border border-slate-200 p-5 transition hover:bg-slate-50"
        >
          <h2 className="font-medium">Chat</h2>
          <p className="mt-1 text-sm text-slate-500">Real Time Chat</p>
        </Link>
        <div
          className="rounded border border-slate-200 p-5 opacity-50"
          aria-disabled="true"
        >
          <h2 className="font-medium">Email</h2>
          <p className="mt-1 text-sm text-slate-500">Segera hadir.</p>
        </div>
      </div>
    </main>
  );
}
