import type { MembershipRole } from "@medcal/shared";

export type ManagementNavIcon = "messages" | "chat" | "email";

export interface NavItem {
  label: string;
  /** Target path when navigable; unused when disabled. */
  href: string;
  roles: MembershipRole[];
  /** Stable id for Management shell items; optional for legacy client nav. */
  id?: string;
  /** Sidebar icon key; Management v1 items always set this. */
  icon?: ManagementNavIcon;
  /**
   * Presentation-only. When true, the item is visible but not a link.
   * Server RBAC remains the real enforcement boundary.
   */
  disabled?: boolean;
  /** Reserved for future nested menus — unused in Management shell v1. */
  children?: NavItem[];
}

/**
 * Hard-coded Management v1 navigation (presentation only).
 * Order is intentional and matches the shell specification:
 * Messages → Chat → Email.
 *
 * UX only — apps/api's CompanyRoleGuard is the real enforcement boundary.
 * Hiding an item here never substitutes for a server-side permission check.
 */
export const managementNav: NavItem[] = [
  // Matches apps/api's lead:read grant (SUPERADMIN/ADMIN only).
  {
    id: "messages",
    label: "Messages",
    href: "/leads",
    icon: "messages",
    roles: ["SUPERADMIN", "ADMIN"],
  },
  // Matches apps/api's chat:read grant (SUPERADMIN/ADMIN only).
  {
    id: "chat",
    label: "Chat",
    href: "/chat",
    icon: "chat",
    roles: ["SUPERADMIN", "ADMIN"],
  },
  // Channel not shipped yet — visible affordance, not navigable (dashboard parity).
  {
    id: "email",
    label: "Email",
    href: "/email",
    icon: "email",
    roles: ["SUPERADMIN", "ADMIN"],
    disabled: true,
  },
];

/** Active nav matching from the current pathname (no hard-coded active id). */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.disabled) return false;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
