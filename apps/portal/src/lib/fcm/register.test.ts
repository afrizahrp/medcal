import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@medcal/shared";

vi.mock("@medcal/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@medcal/shared")>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("./messaging", () => ({
  clearFcmRegistrationState: vi.fn(),
  clearPendingBrowserTokenDelete: vi.fn(),
  deleteBrowserFcmToken: vi.fn(),
  detectDeviceType: vi.fn(() => "chrome/windows"),
  getLastRegisteredToken: vi.fn(),
  getLastRegisteredTokenId: vi.fn(),
  getLastRegisteredUserId: vi.fn(),
  markPendingBrowserTokenDelete: vi.fn(),
  obtainFcmToken: vi.fn(),
  setLastRegisteredToken: vi.fn(),
  setLastRegisteredTokenId: vi.fn(),
  setLastRegisteredUserId: vi.fn(),
}));

import * as messaging from "./messaging";
import { revokeRegisteredPushToken, syncPushTokenIfNeeded } from "./register";

const conflict = () =>
  new ApiError(409, "Token is already registered to another user", {
    code: "TOKEN_OWNERSHIP_CONFLICT",
  });

describe("revokeRegisteredPushToken (sign-out cleanup)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    globalThis.fetch = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("revokes the server record, deletes the browser token and clears local state", async () => {
    vi.mocked(messaging.getLastRegisteredTokenId).mockReturnValue("tok-1");
    vi.mocked(messaging.deleteBrowserFcmToken).mockResolvedValue(true);
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, status: 204 } as Response);

    await revokeRegisteredPushToken();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(globalThis.fetch).mock.calls[0][1]).toMatchObject({ method: "DELETE" });
    expect(messaging.deleteBrowserFcmToken).toHaveBeenCalledTimes(1);
    expect(messaging.markPendingBrowserTokenDelete).not.toHaveBeenCalled();
    expect(messaging.clearFcmRegistrationState).toHaveBeenCalledTimes(1);
  });

  it("still deletes the browser token when no server token id is known", async () => {
    vi.mocked(messaging.getLastRegisteredTokenId).mockReturnValue(null);
    vi.mocked(messaging.deleteBrowserFcmToken).mockResolvedValue(true);

    await revokeRegisteredPushToken();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(messaging.deleteBrowserFcmToken).toHaveBeenCalledTimes(1);
  });

  it("never throws and still deletes the browser token when the server revoke fails (offline)", async () => {
    vi.mocked(messaging.getLastRegisteredTokenId).mockReturnValue("tok-1");
    vi.mocked(messaging.deleteBrowserFcmToken).mockResolvedValue(true);
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(revokeRegisteredPushToken()).resolves.toBeUndefined();

    expect(messaging.deleteBrowserFcmToken).toHaveBeenCalledTimes(1);
    expect(messaging.markPendingBrowserTokenDelete).not.toHaveBeenCalled();
    expect(messaging.clearFcmRegistrationState).toHaveBeenCalledTimes(1);
  });

  it("never throws on a non-OK server response", async () => {
    vi.mocked(messaging.getLastRegisteredTokenId).mockReturnValue("tok-1");
    vi.mocked(messaging.deleteBrowserFcmToken).mockResolvedValue(true);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
    } as Response);

    await expect(revokeRegisteredPushToken()).resolves.toBeUndefined();
    expect(messaging.clearFcmRegistrationState).toHaveBeenCalledTimes(1);
  });

  it("marks the browser-token deletion as pending when it fails, without throwing", async () => {
    vi.mocked(messaging.getLastRegisteredTokenId).mockReturnValue("tok-1");
    vi.mocked(messaging.deleteBrowserFcmToken).mockResolvedValue(false);
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, status: 204 } as Response);

    await expect(revokeRegisteredPushToken()).resolves.toBeUndefined();

    expect(messaging.markPendingBrowserTokenDelete).toHaveBeenCalledTimes(1);
    expect(messaging.clearFcmRegistrationState).toHaveBeenCalledTimes(1);
  });

  it("marks the deletion as pending when the browser-token deletion rejects unexpectedly", async () => {
    vi.mocked(messaging.getLastRegisteredTokenId).mockReturnValue(null);
    vi.mocked(messaging.deleteBrowserFcmToken).mockRejectedValue(new Error("boom"));

    await expect(revokeRegisteredPushToken()).resolves.toBeUndefined();

    expect(messaging.markPendingBrowserTokenDelete).toHaveBeenCalledTimes(1);
    expect(messaging.clearFcmRegistrationState).toHaveBeenCalledTimes(1);
  });
});

describe("syncPushTokenIfNeeded — ownership conflict recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(messaging.detectDeviceType).mockReturnValue("chrome/windows");
    vi.mocked(messaging.getLastRegisteredToken).mockReturnValue(null);
    vi.mocked(messaging.getLastRegisteredUserId).mockReturnValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("registers normally without touching the browser token", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "row-1", created: true, reactivated: false });

    await expect(syncPushTokenIfNeeded("tok-A", "user-B")).resolves.toBe("synced");

    expect(messaging.deleteBrowserFcmToken).not.toHaveBeenCalled();
    expect(messaging.setLastRegisteredTokenId).toHaveBeenCalledWith("row-1");
  });

  it("on TOKEN_OWNERSHIP_CONFLICT deletes the browser token, mints a fresh one and retries once", async () => {
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({ id: "row-2", created: true, reactivated: false });
    vi.mocked(messaging.deleteBrowserFcmToken).mockResolvedValue(true);
    vi.mocked(messaging.obtainFcmToken).mockResolvedValue("tok-fresh");

    await expect(syncPushTokenIfNeeded("tok-stale", "user-B")).resolves.toBe("synced");

    expect(messaging.deleteBrowserFcmToken).toHaveBeenCalledTimes(1);
    expect(messaging.clearPendingBrowserTokenDelete).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String(vi.mocked(apiFetch).mock.calls[1][1]?.body));
    expect(retryBody.token).toBe("tok-fresh");
    expect(messaging.setLastRegisteredToken).toHaveBeenCalledWith("tok-fresh");
    expect(messaging.setLastRegisteredUserId).toHaveBeenCalledWith("user-B");
  });

  it("fails (no retry loop) when the fresh token is the same as the stale one", async () => {
    vi.mocked(apiFetch).mockRejectedValue(conflict());
    vi.mocked(messaging.deleteBrowserFcmToken).mockResolvedValue(true);
    vi.mocked(messaging.obtainFcmToken).mockResolvedValue("tok-stale");

    await expect(syncPushTokenIfNeeded("tok-stale", "user-B")).resolves.toBe("failed");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("fails when the browser token cannot be deleted", async () => {
    vi.mocked(apiFetch).mockRejectedValue(conflict());
    vi.mocked(messaging.deleteBrowserFcmToken).mockResolvedValue(false);

    await expect(syncPushTokenIfNeeded("tok-stale", "user-B")).resolves.toBe("failed");
    expect(messaging.obtainFcmToken).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("fails when the single retry is also rejected (still no takeover)", async () => {
    vi.mocked(apiFetch).mockRejectedValue(conflict());
    vi.mocked(messaging.deleteBrowserFcmToken).mockResolvedValue(true);
    vi.mocked(messaging.obtainFcmToken).mockResolvedValue("tok-fresh");

    await expect(syncPushTokenIfNeeded("tok-stale", "user-B")).resolves.toBe("failed");
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("does not delete the browser token for non-conflict errors", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "Internal Server Error"));

    await expect(syncPushTokenIfNeeded("tok-A", "user-B")).resolves.toBe("failed");
    expect(messaging.deleteBrowserFcmToken).not.toHaveBeenCalled();
  });

  it("does not treat a 409 with a different code as an ownership conflict", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "other", { code: "SOMETHING_ELSE" }));

    await expect(syncPushTokenIfNeeded("tok-A", "user-B")).resolves.toBe("failed");
    expect(messaging.deleteBrowserFcmToken).not.toHaveBeenCalled();
  });
});
