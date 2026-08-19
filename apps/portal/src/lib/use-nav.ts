"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@medcal/shared";
import type { NavItem } from "../app/management/nav-config";

export type MenuApplication = "MANAGEMENT" | "TECHNICIAN" | "CUSTOMER";

interface NavApiNode {
  id: string;
  label: string;
  href: string | null;
  icon: string | null;
  children?: NavApiNode[];
}

function toNavItem(node: NavApiNode): NavItem {
  return {
    id: node.id,
    label: node.label,
    href: node.href ?? "",
    icon: (node.icon ?? undefined) as NavItem["icon"],
    children: node.children?.map(toNavItem),
  };
}

/**
 * Fetches the server-side, permission-filtered nav tree for one application
 * (GET /menu/nav) — the tree returned is already authoritative for
 * visibility; the client never re-derives it. Only fetches once `ready` is
 * true (the caller already has a resolved session); the endpoint
 * re-validates session/membership/ACTIVE itself regardless.
 */
export function useNav(application: MenuApplication, ready: boolean): { nav: NavItem[]; loading: boolean } {
  const [nav, setNav] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    setLoading(true);
    apiFetch<NavApiNode[]>(`/menu/nav?application=${application}`)
      .then((data) => {
        if (!cancelled) {
          setNav(data.map(toNavItem));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNav([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [application, ready]);

  return { nav, loading };
}
