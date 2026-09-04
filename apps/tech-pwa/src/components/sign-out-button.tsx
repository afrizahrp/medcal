"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@medcal/auth/client";
import { revokeRegisteredPushToken } from "../lib/fcm/register";

export function SignOutButton() {
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
      className="flex min-h-11 items-center px-1 text-sm font-medium text-slate-600 active:text-slate-900"
    >
      Keluar
    </button>
  );
}
