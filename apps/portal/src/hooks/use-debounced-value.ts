"use client";

import { useEffect, useState } from "react";

/**
 * Delays committing `value` until it has been stable for `delayMs`
 * (Management List canonical pattern, 2026-08-18 — matches easy-app's
 * `use-debounce`-based 500ms search debounce, reimplemented locally since no
 * debounce utility/dependency exists anywhere in this repo yet). Callers
 * keep raw keystrokes in their own local state and only feed the *returned*
 * value into a query key, so a fast typist never fires one request per
 * keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
