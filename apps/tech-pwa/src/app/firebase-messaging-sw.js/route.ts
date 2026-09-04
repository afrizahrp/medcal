/**
 * Firebase Messaging service worker for Tech-PWA.
 * Served dynamically so NEXT_PUBLIC_FIREBASE_* values are injected at runtime.
 * Contains only public web config — never Firebase Admin credentials.
 */
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

  const body = `/* firebase-messaging-sw.js — Tech-PWA FCM background handler + app-shell */
importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_COMPAT_VERSION}/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_COMPAT_VERSION}/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(firebaseConfig)});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  // FCM auto-displays notification payload on web — skip manual show to avoid duplicates.
  if (payload.notification?.title) {
    return Promise.resolve();
  }
  const data = payload.data || {};
  const title = data.title || "MedCal";
  const icon = data.icon || "/short-logo.png";
  const options = {
    body: data.body || "",
    icon,
    badge: icon,
    data,
  };
  return self.registration.showNotification(title, options);
});

/* App-shell: offline fallback only — no data/JS/RSC caching (never serve a stale bundle). */
const SHELL_CACHE = "tech-pwa-shell-v1";
const SHELL_URLS = ["/offline.html", "/icons/icon-192.png", "/short-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match("/offline.html")),
  );
});
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Service-Worker-Allowed": "/",
    },
  });
}
