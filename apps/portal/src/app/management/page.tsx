"use client";

import Link from "next/link";
import { useAuth, useAuthz } from "@medcal/auth/client";
import { ChatIcon, EmailIcon, MessagesIcon } from "../../components/management/icons";

/**
 * Channel selector — Messages -> Lead Inbox, Chat -> Chat Inbox. Each
 * shortcut is gated by the same permission (lead:read / chat:read) that
 * actually protects its destination — via Me.capabilities, computed
 * server-side in MeController — not by role name and not by Menu Registry
 * structure (Menu is navigation config, not an authorization source).
 * Email shortcut is gated by email:read via Me.capabilities (same pattern as
 * Messages / Web Chat) — Menu Registry still owns sidebar navigation.
 */
export default function ManagementHome() {
  const { user } = useAuth();
  const { capabilities } = useAuthz();
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-6 md:px-8 md:py-8">
      <section className="mx-auto max-w-3xl px-2 py-2 md:px-4">
        <header>
          <h2 className="text-2xl font-semibold tracking-tight text-brand-900 md:text-3xl">
            {firstName ? `Selamat datang kembali, ${firstName}!` : "Selamat datang kembali"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Anda dapat melihat dan membalas semua pesan pelanggan.
          </p>
        </header>

        <div className="flex justify-center py-8">
          <div className="flex flex-wrap items-start justify-center gap-8 md:gap-12">
            {capabilities?.leadRead ? (
              <ChannelLink href="/leads" label="Messages">
                <MessagesIcon className="h-7 w-7" strokeWidth={1.6} />
              </ChannelLink>
            ) : null}
            {capabilities?.chatRead ? (
              <ChannelLink href="/chat" label="Web Chat">
                <ChatIcon className="h-7 w-7" strokeWidth={1.6} />
              </ChannelLink>
            ) : null}
            {capabilities?.emailRead ? (
              <ChannelLink href="/email/inbox" label="Email">
                <EmailIcon className="h-7 w-7" strokeWidth={1.6} />
              </ChannelLink>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function ChannelLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="group flex flex-col items-center gap-2">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-brand-800 transition-colors group-hover:bg-slate-50 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-brand-600 md:h-20 md:w-20">
        {children}
      </span>
      <span className="text-sm font-medium text-slate-800">{label}</span>
    </Link>
  );
}
