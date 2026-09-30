/**
 * Phone-safe "open this PDF" flow.
 *
 * Mobile browsers only allow window.open() while the user's tap is still
 * being handled. Opening the window AFTER an async fetch (the PDF must be
 * downloaded first) is routinely blocked. So the window is opened
 * SYNCHRONOUSLY, first thing inside the click handler, and pointed at the PDF
 * once the blob is ready. If even that is blocked (openWindow returns null),
 * the current tab navigates to the PDF instead, so the customer always gets
 * to the document.
 */
export interface PdfWindowLike {
  location: { href: string };
  opener: unknown;
  close(): void;
}

export interface OpenPdfDeps {
  /** Must open a blank window immediately (synchronously) - or return null when blocked. */
  openWindow: () => PdfWindowLike | null;
  fetchBlob: () => Promise<Blob>;
  createObjectURL: (blob: Blob) => string;
  /** Fallback when no window could be opened: navigate the current tab. */
  navigateCurrent: (url: string) => void;
  /** Called with the created URL so the caller can release it later. */
  onUrl?: (url: string) => void;
}

export async function openPdfFromGesture(deps: OpenPdfDeps): Promise<void> {
  // Synchronous: this line runs before any await, i.e. inside the tap.
  const win = deps.openWindow();
  if (win) {
    // The new tab must not be able to reach back into this page.
    win.opener = null;
  }

  let url: string;
  try {
    const blob = await deps.fetchBlob();
    url = deps.createObjectURL(blob);
  } catch (err) {
    win?.close();
    throw err;
  }

  deps.onUrl?.(url);
  if (win) {
    win.location.href = url;
  } else {
    deps.navigateCurrent(url);
  }
}
