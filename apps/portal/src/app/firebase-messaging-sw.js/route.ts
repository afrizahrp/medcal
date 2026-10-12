/**
 * Firebase Messaging service worker for Portal.
 * Served dynamically so NEXT_PUBLIC_FIREBASE_* values are injected at runtime.
 * Contains only public web config — never Firebase Admin credentials.
 * The script itself (incl. notification click routing) lives in lib/fcm/sw-script.ts.
 */
import { buildMessagingServiceWorkerScript } from "../../lib/fcm/sw-script";

export const dynamic = "force-dynamic";

const FIREBASE_COMPAT_VERSION = "12.18.0";

export function GET() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };

  const defaultIcon =
    process.env.PUSH_NOTIFICATION_ICON_URL?.trim() ||
    process.env.NEXT_PUBLIC_PUSH_ICON_URL?.trim() ||
    "/short-logo.png";

  const body = buildMessagingServiceWorkerScript({
    firebaseConfig,
    defaultIcon,
    compatVersion: FIREBASE_COMPAT_VERSION,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Service-Worker-Allowed": "/",
    },
  });
}
