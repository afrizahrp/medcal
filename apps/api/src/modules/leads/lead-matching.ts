import { prisma } from "@medcal/db";
import type { Lead } from "@medcal/db";
import { normalizeEmail, normalizeOrganizationName, normalizePhone } from "@medcal/shared";

/**
 * Shared identity-matching evidence (Lead Inbox design review, 2026-08-16,
 * §4, corrected 2026-08-16): used by both ContactMessagesService.create()
 * (to decide STRONG/POSSIBLE/NONE at write time) and LeadsService's Needs
 * Review query (to recompute the same candidates at read time, since
 * possible-match candidates are derived, never persisted).
 */
export interface LeadMatchIdentity {
  email: string;
  phone?: string | null;
  organizationName?: string | null;
}

export type LeadMatchTier = "STRONG" | "POSSIBLE";

export interface LeadMatchCandidate {
  lead: Lead;
  tier: LeadMatchTier;
}

/**
 * Finds every existing Lead in this company whose identity overlaps the
 * given inbound identity on at least one signal (phone, organization, or
 * email) — exact match on normalized fields only, no fuzzy matching.
 * STRONG = phone AND organization both match. POSSIBLE = any one signal
 * matches but not both phone+organization.
 */
export async function findLeadMatchCandidates(
  companyId: string,
  identity: LeadMatchIdentity,
): Promise<LeadMatchCandidate[]> {
  const normalizedPhone = identity.phone ? normalizePhone(identity.phone) : undefined;
  const normalizedOrg = identity.organizationName
    ? normalizeOrganizationName(identity.organizationName)
    : undefined;
  const normalizedEmail = normalizeEmail(identity.email);

  const leads = await prisma.lead.findMany({ where: { companyId } });

  const candidates: LeadMatchCandidate[] = [];
  for (const lead of leads) {
    const phoneMatch = Boolean(normalizedPhone && lead.phone && normalizePhone(lead.phone) === normalizedPhone);
    const orgMatch = Boolean(
      normalizedOrg && lead.organizationName && normalizeOrganizationName(lead.organizationName) === normalizedOrg,
    );
    const emailMatch = normalizeEmail(lead.email) === normalizedEmail;

    if (phoneMatch && orgMatch) {
      candidates.push({ lead, tier: "STRONG" });
    } else if (phoneMatch || orgMatch || emailMatch) {
      candidates.push({ lead, tier: "POSSIBLE" });
    }
  }
  return candidates;
}

export type LeadMatchOutcome =
  | { kind: "STRONG"; leadId: string }
  | { kind: "POSSIBLE"; candidates: LeadMatchCandidate[] }
  | { kind: "NONE" };

/**
 * Classifies the candidate set into the three locked outcomes. Exactly one
 * STRONG candidate auto-attaches; multiple STRONG candidates are ambiguous
 * and degrade to POSSIBLE (never auto-attach to an arbitrarily-chosen one);
 * any other non-empty candidate set is POSSIBLE; an empty set is NONE.
 */
export function classifyLeadMatch(candidates: LeadMatchCandidate[]): LeadMatchOutcome {
  const strong = candidates.filter((c) => c.tier === "STRONG");
  if (strong.length === 1) {
    return { kind: "STRONG", leadId: strong[0]!.lead.id };
  }
  if (candidates.length > 0) {
    return { kind: "POSSIBLE", candidates };
  }
  return { kind: "NONE" };
}
