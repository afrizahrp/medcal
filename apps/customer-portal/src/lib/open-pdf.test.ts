import { describe, expect, it, vi } from "vitest";
import { openPdfFromGesture, type PdfWindowLike } from "./open-pdf";

function fakeWindow(): PdfWindowLike & { closed: boolean } {
  return { location: { href: "about:blank" }, opener: "self", closed: false, close() { this.closed = true; } };
}

describe("openPdfFromGesture", () => {
  it("opens the window synchronously, BEFORE the PDF is fetched (inside the user gesture)", async () => {
    const order: string[] = [];
    const win = fakeWindow();
    let resolveBlob!: (b: Blob) => void;
    const blobPromise = new Promise<Blob>((r) => (resolveBlob = r));

    const pending = openPdfFromGesture({
      openWindow: () => {
        order.push("openWindow");
        return win;
      },
      fetchBlob: () => {
        order.push("fetchBlob");
        return blobPromise;
      },
      createObjectURL: () => "blob:pdf-1",
      navigateCurrent: () => order.push("navigateCurrent"),
    });

    // Nothing awaited yet: the window is already open and the fetch has started.
    expect(order).toEqual(["openWindow", "fetchBlob"]);
    expect(win.location.href).toBe("about:blank");

    resolveBlob(new Blob(["%PDF-"]));
    await pending;
    expect(win.location.href).toBe("blob:pdf-1");
    expect(win.opener).toBeNull();
    expect(order).not.toContain("navigateCurrent");
  });

  it("falls back to navigating the current tab when the popup is blocked", async () => {
    const navigate = vi.fn();
    await openPdfFromGesture({
      openWindow: () => null,
      fetchBlob: async () => new Blob(["%PDF-"]),
      createObjectURL: () => "blob:pdf-2",
      navigateCurrent: navigate,
    });
    expect(navigate).toHaveBeenCalledWith("blob:pdf-2");
  });

  it("closes the pre-opened window and rethrows when the PDF cannot be fetched", async () => {
    const win = fakeWindow();
    await expect(
      openPdfFromGesture({
        openWindow: () => win,
        fetchBlob: async () => {
          throw new Error("404");
        },
        createObjectURL: () => "blob:never",
        navigateCurrent: vi.fn(),
      }),
    ).rejects.toThrow("404");
    expect(win.closed).toBe(true);
    expect(win.location.href).toBe("about:blank");
  });

  it("reports the created URL so the page can release it", async () => {
    const onUrl = vi.fn();
    await openPdfFromGesture({
      openWindow: () => fakeWindow(),
      fetchBlob: async () => new Blob(["%PDF-"]),
      createObjectURL: () => "blob:pdf-3",
      navigateCurrent: vi.fn(),
      onUrl,
    });
    expect(onUrl).toHaveBeenCalledWith("blob:pdf-3");
  });
});
