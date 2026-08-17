import type { MembershipRole } from "@medcal/shared";

export type ManagementNavIcon = "dashboard" | "leads" | "messages" | "chat" | "email";

export interface NavItem {
  label: string;
  /** Target path when navigable. Unused for group parents. */
  href: string;
  roles: MembershipRole[];
  id?: string;
  icon?: ManagementNavIcon;
  disabled?: boolean;
  /** When set, this item is a group: click expands/collapses; does not navigate. */
  children?: NavItem[];
}

/**
 * Hard-coded Management navigation (presentation only).
 *
 * Dashboard
 * Leads
 *   ├── Messages
 *   ├── Chat
 *   └── Email (disabled)
 *
 * UX only — apps/api's CompanyRoleGuard is the real enforcement boundary.
 */
export const managementNav: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/",
    icon: "dashboard",
    roles: ["SUPERADMIN", "ADMIN", "SUPERVISOR", "TECHNICIAN", "FINANCE"],
  },
  {
    id: "leads",
    label: "Leads",
    href: "",
    icon: "leads",
    roles: ["SUPERADMIN", "ADMIN"],
    children: [
      {
        id: "messages",
        label: "Messages",
        href: "/leads",
        icon: "messages",
        roles: ["SUPERADMIN", "ADMIN"],
      },
      {
        id: "chat",
        label: "Web Chat",
        href: "/chat",
        icon: "chat",
        roles: ["SUPERADMIN", "ADMIN"],
      },
      {
        id: "email",
        label: "Email",
        href: "/email",
        icon: "email",
        roles: ["SUPERADMIN", "ADMIN"],
        disabled: true,
      },
    ],
  },
];

/** Active leaf matching from the current pathname (no hard-coded active id). */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.disabled || item.children?.length) return false;
  if (!item.href) return false;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function isNavGroupActive(pathname: string, item: NavItem): boolean {
  return Boolean(item.children?.some((child) => isNavItemActive(pathname, child)));
}

export function filterNavByRole(items: NavItem[], role: MembershipRole): NavItem[] {
  return items
    .map((item) => {
      const children = item.children ? filterNavByRole(item.children, role) : undefined;
      return { ...item, children };
    })
    .filter((item) => {
      if (!item.roles.includes(role)) return false;
      if (item.children) return item.children.length > 0;
      return true;
    });
}
