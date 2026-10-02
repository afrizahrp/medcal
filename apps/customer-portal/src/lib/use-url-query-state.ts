"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Typed read/write layer over the URL query string — same behavior as
 * apps/portal's hooks/use-url-query-state.ts (kept as a local copy because
 * apps/customer-portal does not import from apps/portal). The URL is the single
 * source of truth for these keys, so a filtered list survives a refresh and
 * the back button. `router.replace` keeps it from adding history entries per
 * keystroke. Callers using this must render inside a <Suspense> boundary.
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
