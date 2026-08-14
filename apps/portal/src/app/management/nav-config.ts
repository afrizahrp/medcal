import type { MembershipRole } from "@medcal/shared";

export interface NavItem {
  label: string;
  href: string;
  roles: MembershipRole[];
}

// UX only — apps/api's CompanyRoleGuard is the real enforcement boundary.
// Hiding an item here never substitutes for a server-side permission check.
export const managementNav: NavItem[] = [
  { label: "Dashboard", href: "/", roles: ["SUPERADMIN", "ADMIN", "SUPERVISOR", "TECHNICIAN", "FINANCE"] },
];
