/**
 * Better Auth React client — browser-safe only. Never import "@medcal/auth"
 * (the root export) from a client component: it pulls in @medcal/db/Prisma.
 * Import "@medcal/auth/client" instead.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

export const { signIn, signOut, useSession } = authClient;
