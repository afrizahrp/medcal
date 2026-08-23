"use client";

import { useQuery } from "@tanstack/react-query";
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

async function fetchNav(application: MenuApplication): Promise<NavItem[]> {
  const data = await apiFetch<NavApiNode[]>(`/menu/nav?application=${application}`);
  return data.map(toNavItem);
}

/**
 * Fetches the server-side, permission-filtered nav tree for one application
 * (GET /menu/nav) — cached via React Query. Only fetches once `ready` is
 * true (the caller already has a resolved session); the endpoint
 * re-validates session/membership/ACTIVE itself regardless.
 */
export function useNav(application: MenuApplication, ready: boolean): { nav: NavItem[]; loading: boolean } {
  const query = useQuery({
    queryKey: ["nav", application],
    queryFn: () => fetchNav(application),
    enabled: ready,
  });

  return {
    nav: query.data ?? [],
    loading: ready && query.isPending,
  };
}
