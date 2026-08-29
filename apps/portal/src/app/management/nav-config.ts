export type ManagementNavIcon =
  | "dashboard"
  | "leads"
  | "messages"
  | "chat"
  | "email"
  | "users"
  | "whitelist"
  | "menu"
  | "permission"
  | "calibration"
  | "customer"
  | "settings"
  | "device"
  | "folderTree"
  | "tags"
  | "boxes"
  | "activity"
  | "slidersHorizontal"
  | "cpu"
  | "fileText"
  | "gauge"
  | "clipboardList"
  | "messageSquareQuote"
  | "wrench"
  | "square-scissors";

export interface NavItem {
  label: string;
  /** Target path when navigable. Unused for group parents. */
  href: string;
  id?: string;
  icon?: ManagementNavIcon;
  disabled?: boolean;
  /** When set, this item is a group: click expands/collapses; does not navigate. */
  children?: NavItem[];
}

/** Active leaf matching from the current pathname (no hard-coded active id). */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.disabled || item.children?.length) return false;
  if (!item.href) return false;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** A group is active when ANY descendant leaf matches the pathname (recursive). */
export function isNavGroupActive(pathname: string, item: NavItem): boolean {
  return Boolean(
    item.children?.some((child) =>
      child.children?.length
        ? isNavGroupActive(pathname, child)
        : isNavItemActive(pathname, child),
    ),
  );
}
