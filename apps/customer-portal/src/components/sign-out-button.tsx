"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@medcal/auth/client";
import { buttonSecondary } from "../lib/ui-classes";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        router.push("/sign-in");
        router.refresh();
      }}
      className={buttonSecondary}
    >
      Keluar
    </button>
  );
}
