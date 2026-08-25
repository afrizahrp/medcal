import type { MembershipRole } from "@medcal/shared";

/** Minimal capability signal from GET /me — not a general permission API. */
export type MeCapabilities = {
  leadRead: boolean;
  chatRead: boolean;
  emailRead: boolean;
  emailSend: boolean;
  emailDelete: boolean;
  emailManage: boolean;
  customerRead: boolean;
  customerCreate: boolean;
  customerUpdate: boolean;
  uomRead: boolean;
  uomCreate: boolean;
  uomUpdate: boolean;
};

export type MeUser = {
  id: string;
  email: string;
  name: string;
};

export type MeMembership = {
  role: MembershipRole;
  companyId: string;
};

export type Me = {
  user: MeUser;
  membership: MeMembership;
  capabilities: MeCapabilities;
};

export type AuthBootstrapStatus = "loading" | "ready" | "forbidden" | "pending";
