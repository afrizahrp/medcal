"use client";

import Link from "next/link";
import { useSession } from "@medcal/auth/client";
import { ChatIcon, EmailIcon, MessagesIcon } from "../../components/management/icons";

/**
 * Channel selector — Messages -> Lead Inbox, Chat -> Chat Inbox.
 * Email remains a disabled coming-soon affordance. Order is locked:
 * Messages, Chat, Email.
 */
export default function ManagementHome() {
  const { data: session } = useSession();
  const firstName = session?.user.name?.trim().split(/\s+/)[0];

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
            <ChannelLink href="/leads" label="Messages">
              <MessagesIcon className="h-7 w-7" strokeWidth={1.6} />
            </ChannelLink>
            <ChannelLink href="/chat" label="Web Chat">
              <ChatIcon className="h-7 w-7" strokeWidth={1.6} />
            </ChannelLink>
            <div className="flex flex-col items-center gap-2 opacity-40" aria-disabled="true">
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-slate-400 md:h-20 md:w-20"
                title="Segera hadir"
              >
                <EmailIcon className="h-7 w-7" strokeWidth={1.6} />
              </span>
              <span className="text-sm font-medium text-slate-400">Email</span>
            </div>
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
