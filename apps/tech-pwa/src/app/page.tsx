"use client";

import { useRequireSession } from "../lib/use-require-session";
import { SignOutButton } from "../components/sign-out-button";
import { usePushNotifications } from "../lib/fcm/use-push-notifications";

function PushNotificationsControl({ authenticated }: { authenticated: boolean }) {
  const { status, errorMessage, enable } = usePushNotifications({ authenticated });

  if (status === "unconfigured" || status === "unsupported" || status === "idle") {
    return null;
  }

  if (status === "enabled") {
    return <span className="text-xs text-slate-500">Notifications on</span>;
  }

  if (status === "denied") {
    return <span className="text-xs text-slate-500">Notifications blocked</span>;
  }

  if (status === "enabling") {
    return <span className="text-xs text-slate-500">Enabling…</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        onClick={() => void enable()}
      >
        Enable notifications
      </button>
      {status === "error" && errorMessage ? (
        <span className="text-xs text-red-600">{errorMessage}</span>
      ) : null}
    </div>
  );
}

export default function TechHome() {
  const { me, status } = useRequireSession();

  if (status === "loading") {
    return <main className="p-8 text-slate-500">Loading…</main>;
  }

  if (status === "forbidden" || !me) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Forbidden</h1>
        <p className="mt-2 text-slate-600">Your account does not have access to this application.</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span className="font-semibold">Technician PWA</span>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <PushNotificationsControl authenticated />
          <span>
            {me.user.email} · {me.membership.role}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-semibold">Technician PWA</h1>
        <p className="mt-2 text-slate-600">
          Skeleton — F6 foundation only, field checklist and business modules land later.
        </p>
      </main>
    </div>
  );
}
