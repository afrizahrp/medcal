"use client";

import { useEffect, useState } from "react";

/**
 * Delays committing `value` until it has been stable for `delayMs`. Same
 * implementation as apps/portal's hooks/use-debounced-value.ts (the repo's only
 * debounce pattern — no debounce dependency exists). apps/customer-portal is
 * isolated from apps/portal (no cross-app imports), so it keeps its own copy.
 * Keep raw keystrokes in local state and feed only the *returned* value into a
 * query key, so a fast typist never fires one request per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/** Search debounce used across the portal — matches the management lists. */
export const SEARCH_DEBOUNCE_MS = 500;
