import { describe, expect, it, vi } from "vitest";
import { buildMessagingServiceWorkerScript } from "./sw-script";

type Listener = (event: unknown) => void;

interface FakeWindowClient {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate?: ReturnType<typeof vi.fn>;
}

/** Evaluate the generated worker against a minimal fake ServiceWorkerGlobalScope. */
function loadWorker(windows: FakeWindowClient[] = []) {
  const listeners = new Map<string, Listener[]>();
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const backgroundHandlers: Array<(payload: unknown) => unknown> = [];
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const order: string[] = [];

  const self = {
    location: { origin: "https://apps.example.com" },
    clients: { matchAll: vi.fn().mockResolvedValue(windows), openWindow },
    registration: { showNotification },
    addEventListener: (name: string, listener: Listener) => {
      order.push(`listener:${name}`);
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
    },
  };
  const firebase = {
    initializeApp: vi.fn(),
    messaging: () => {
      order.push("firebase.messaging");
      return { onBackgroundMessage: (handler: (payload: unknown) => unknown) => backgroundHandlers.push(handler) };
    },
  };
  const importScripts = vi.fn();

  const script = buildMessagingServiceWorkerScript({
    firebaseConfig: { apiKey: "public-key", projectId: "demo" },
    defaultIcon: "/short-logo.png",
    compatVersion: "12.18.0",
  });
  new Function("self", "importScripts", "firebase", "URL", "Promise", script)(
    self,
    importScripts,
    firebase,
    URL,
    Promise,
  );

  function click(data: unknown, wrapInFcmMsg = true) {
    const waitUntil = vi.fn();
    const event = {
      notification: {
        data: wrapInFcmMsg ? { FCM_MSG: { data } } : data,
        close: vi.fn(),
      },
      stopImmediatePropagation: vi.fn(),
      waitUntil,
    };
    for (const listener of listeners.get("notificationclick") ?? []) listener(event);
    return { event, settled: Promise.all(waitUntil.mock.calls.map((call) => call[0])) };
  }

  return { click, openWindow, importScripts, firebase, backgroundHandlers, showNotification, order };
}

describe("portal messaging service worker — notification click routing", () => {
  it("opens the lead page for a lead-assigned notification (absolute same-origin URL)", async () => {
    const worker = loadWorker();
    const { event, settled } = worker.click({ type: "LEAD_ASSIGNED", leadId: "clead123" });
    await settled;

    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(event.notification.close).toHaveBeenCalledTimes(1);
    expect(worker.openWindow).toHaveBeenCalledWith("https://apps.example.com/leads/clead123");
  });

  it("routes a contact message to its lead when matched, else to the list", async () => {
    const matched = loadWorker();
    await matched.click({ type: "CONTACT_MESSAGE_NEW", leadId: "lead-7" }).settled;
    expect(matched.openWindow).toHaveBeenCalledWith("https://apps.example.com/leads/lead-7");

    const unmatched = loadWorker();
    await unmatched.click({ type: "CONTACT_MESSAGE_NEW", leadId: "" }).settled;
    expect(unmatched.openWindow).toHaveBeenCalledWith("https://apps.example.com/leads");
  });

  it("also handles notifications shown directly (data not wrapped in FCM_MSG), e.g. foreground", async () => {
    const worker = loadWorker();
    await worker.click({ type: "LEAD_ASSIGNED", leadId: "abc" }, false).settled;
    expect(worker.openWindow).toHaveBeenCalledWith("https://apps.example.com/leads/abc");
  });

  it("never builds a destination from an unsafe id (path traversal / absolute URL / scheme)", async () => {
    for (const leadId of ["../../admin", "/management/users", "https://evil.example.com", "a b", "x".repeat(65), "<script>"]) {
      const worker = loadWorker();
      await worker.click({ type: "LEAD_ASSIGNED", leadId }).settled;
      expect(worker.openWindow).toHaveBeenCalledWith("https://apps.example.com/leads");
    }
  });

  it("ignores any url/link/route field in the payload", async () => {
    const worker = loadWorker();
    await worker.click({
      type: "LEAD_ASSIGNED",
      leadId: "abc",
      url: "https://evil.example.com",
      link: "https://evil.example.com",
      route: "/management/users",
    }).settled;
    expect(worker.openWindow).toHaveBeenCalledWith("https://apps.example.com/leads/abc");
  });

  it("leaves unknown notification types to the Firebase SDK (no takeover, no close)", () => {
    const worker = loadWorker();
    const { event } = worker.click({ type: "SOMETHING_ELSE", leadId: "abc" });
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(event.notification.close).not.toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("ignores prototype-chain type values", () => {
    const worker = loadWorker();
    const { event } = worker.click({ type: "constructor", leadId: "abc" });
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it("focuses and navigates an existing same-origin window instead of opening a new one", async () => {
    const existing: FakeWindowClient = {
      url: "https://apps.example.com/chat",
      focus: vi.fn(),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    existing.focus.mockResolvedValue(existing);
    const worker = loadWorker([existing]);

    await worker.click({ type: "LEAD_ASSIGNED", leadId: "abc" }).settled;

    expect(existing.focus).toHaveBeenCalledTimes(1);
    expect(existing.navigate).toHaveBeenCalledWith("https://apps.example.com/leads/abc");
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("ignores windows of other origins and opens a new window", async () => {
    const foreign: FakeWindowClient = { url: "https://evil.example.com/", focus: vi.fn() };
    const worker = loadWorker([foreign]);

    await worker.click({ type: "LEAD_ASSIGNED", leadId: "abc" }).settled;

    expect(foreign.focus).not.toHaveBeenCalled();
    expect(worker.openWindow).toHaveBeenCalledWith("https://apps.example.com/leads/abc");
  });

  it("falls back to opening a window when navigate is unavailable or fails", async () => {
    const noNavigate: FakeWindowClient = { url: "https://apps.example.com/", focus: vi.fn() };
    noNavigate.focus.mockResolvedValue(noNavigate);
    const first = loadWorker([noNavigate]);
    await first.click({ type: "LEAD_ASSIGNED", leadId: "abc" }).settled;
    expect(first.openWindow).toHaveBeenCalledWith("https://apps.example.com/leads/abc");

    const failing: FakeWindowClient = {
      url: "https://apps.example.com/",
      focus: vi.fn(),
      navigate: vi.fn().mockRejectedValue(new Error("not controlled")),
    };
    failing.focus.mockResolvedValue(failing);
    const second = loadWorker([failing]);
    await second.click({ type: "LEAD_ASSIGNED", leadId: "abc" }).settled;
    expect(second.openWindow).toHaveBeenCalledWith("https://apps.example.com/leads/abc");
  });
});

describe("portal messaging service worker — setup", () => {
  it("registers its click handler before firebase.messaging() so it runs ahead of the SDK's", () => {
    const { order } = loadWorker();
    expect(order.indexOf("listener:notificationclick")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("listener:notificationclick")).toBeLessThan(order.indexOf("firebase.messaging"));
  });

  it("imports the pinned Firebase compat scripts and initialises with the public config only", () => {
    const worker = loadWorker();
    expect(worker.importScripts).toHaveBeenCalledWith(
      "https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js",
    );
    expect(worker.firebase.initializeApp).toHaveBeenCalledWith({ apiKey: "public-key", projectId: "demo" });
  });

  it("does not manually show a notification when the payload already carries one (no duplicates)", async () => {
    const worker = loadWorker();
    await worker.backgroundHandlers[0]({ notification: { title: "Pesan baru" }, data: {} });
    expect(worker.showNotification).not.toHaveBeenCalled();
  });
});
