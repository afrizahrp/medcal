"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Thin typed read/write layer over the browser's own URL query string
 * (Management List canonical pattern, 2026-08-18) — the first URL-state
 * pattern in this app (none existed before; every prior list page kept
 * filters in local useState only, per the forensic report). Deliberately
 * NOT a generic filter-state library: it just serializes/deserializes a
 * fixed set of string keys, leaving all typing/coercion (enums, numbers) to
 * the caller. `router.replace(..., { scroll: false })` keeps this shallow —
 * no extra history entries per keystroke/filter change, no scroll jump.
 *
 * The URL is the single source of truth for these keys — callers should not
 * also hold them in useState (that would create a second source of truth).
 */
export function useUrlQueryState<K extends string>(
  keys: readonly K[],
): {
  params: Record<K, string | undefined>;
  setParams: (updates: Partial<Record<K, string | undefined>>) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(() => {
    const result = {} as Record<K, string | undefined>;
    for (const key of keys) {
      result[key] = searchParams.get(key) ?? undefined;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, ...keys]);

  const setParams = useCallback(
    (updates: Partial<Record<K, string | undefined>>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { params, setParams };
}
