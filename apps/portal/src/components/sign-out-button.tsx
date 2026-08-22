"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@medcal/auth/client";
import { revokeRegisteredPushToken } from "../lib/fcm/register";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await revokeRegisteredPushToken();
        await signOut();
        router.push("/sign-in");
        router.refresh();
      }}
      className={className ?? "text-sm text-slate-600 hover:underline"}
    >
      Sign out
    </button>
  );
}
