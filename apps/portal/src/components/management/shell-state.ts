const STORAGE_KEY = "medcal.management.sidebarCollapsed";

/** Read persisted desktop sidebar collapse preference (client-only). */
export function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist desktop sidebar collapse preference (UI only — not auth state). */
export function writeSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works.
  }
}
