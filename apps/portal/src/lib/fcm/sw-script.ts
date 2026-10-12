/**
 * Source of the portal's firebase-messaging-sw.js, kept out of the route
 * handler so it can be unit-tested (route files may only export handlers).
 *
 * The script contains only public web config — never Firebase Admin credentials.
 *
 * Click routing (approved decision 3 + audit F-05): notifications carry no
 * business details, only `type` and an opaque `leadId`. On click this worker
 * opens a fixed, same-origin management path built from a whitelist — never a
 * URL taken from the payload. The destination page then loads the real data
 * from the authenticated API, which re-authorizes the user.
 */
export interface MessagingServiceWorkerOptions {
  firebaseConfig: Record<string, string>;
  defaultIcon: string;
  compatVersion: string;
}

export function buildMessagingServiceWorkerScript(options: MessagingServiceWorkerOptions): string {
  const { firebaseConfig, defaultIcon, compatVersion } = options;

  return `/* firebase-messaging-sw.js — Portal FCM background handler + notification click routing */
importScripts('https://www.gstatic.com/firebasejs/${compatVersion}/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/${compatVersion}/firebase-messaging-compat.js');

var NOTIFICATION_TYPES = { CONTACT_MESSAGE_NEW: true, LEAD_ASSIGNED: true };
var SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/* Whitelisted destination (host-relative; the portal proxy maps it to /management/...). */
function resolveNotificationPath(data) {
  var leadId = data && typeof data.leadId === 'string' && SAFE_ID.test(data.leadId) ? data.leadId : '';
  return leadId ? '/leads/' + leadId : '/leads';
}

/* Returns our routing data, or null when the notification is not one of ours. */
function extractRoutingData(notification) {
  var raw = notification && notification.data;
  if (!raw) return null;
  var data = raw.FCM_MSG && raw.FCM_MSG.data ? raw.FCM_MSG.data : raw;
  return data && NOTIFICATION_TYPES[data.type] === true ? data : null;
}

function openDestination(url) {
  var origin = self.location.origin;
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
    for (var i = 0; i < windows.length; i++) {
      var sameOrigin = false;
      try { sameOrigin = new URL(windows[i].url).origin === origin; } catch (e) {}
      if (sameOrigin) {
        return windows[i].focus().then(function (focused) {
          return focused && 'navigate' in focused ? focused.navigate(url) : self.clients.openWindow(url);
        }).catch(function () { return self.clients.openWindow(url); });
      }
    }
    return self.clients.openWindow(url);
  });
}

/* Registered BEFORE firebase.messaging() so it runs ahead of the SDK's own
   notificationclick listener and takes over for our two event types only. */
self.addEventListener('notificationclick', function (event) {
  var data = extractRoutingData(event.notification);
  if (!data) return;
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil(openDestination(new URL(resolveNotificationPath(data), self.location.origin).href));
});

firebase.initializeApp(${JSON.stringify(firebaseConfig)});
var messaging = firebase.messaging();
messaging.onBackgroundMessage(function (payload) {
  /* FCM auto-displays the notification payload on web — skip manual show to avoid duplicates. */
  if (payload.notification && payload.notification.title) {
    return Promise.resolve();
  }
  var data = payload.data || {};
  var icon = data.icon || ${JSON.stringify(defaultIcon)};
  return self.registration.showNotification(data.title || 'MedCal', {
    body: data.body || '',
    icon: icon,
    badge: icon,
    data: data
  });
});
`;
}
