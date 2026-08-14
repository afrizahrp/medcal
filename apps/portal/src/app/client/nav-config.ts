import type { MembershipRole } from "@medcal/shared";
import type { NavItem } from "../management/nav-config";

// UX only — apps/api's CompanyRoleGuard is the real enforcement boundary.
// Hiding an item here never substitutes for a server-side permission check.
export const clientNav: NavItem[] = [
  { label: "Dashboard", href: "/", roles: ["CUSTOMER", "SUPERADMIN", "ADMIN"] satisfies MembershipRole[] },
];
