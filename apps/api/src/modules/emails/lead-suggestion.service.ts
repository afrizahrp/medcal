import { Injectable } from "@nestjs/common";
import { prisma } from "@medcal/db";
import { normalizeEmailAddress } from "./email-normalize.util";

export type LeadSuggestionResult = {
  suggestedLeadId: string | null;
  candidates: Array<{ id: string; name: string; email: string }>;
};

@Injectable()
export class LeadSuggestionService {
  /**
   * Exact normalized email match only. Never sets leadId.
   * Exactly one match → suggestedLeadId; multiple or none → suggestedLeadId null.
   */
  async findSuggestion(companyId: string, fromEmail: string): Promise<LeadSuggestionResult> {
    const normalized = normalizeEmailAddress(fromEmail);
    if (!normalized) {
      return { suggestedLeadId: null, candidates: [] };
    }

    const leads = await prisma.lead.findMany({
      where: { companyId },
      select: { id: true, name: true, email: true },
    });

    const candidates = leads.filter(
      (lead) => normalizeEmailAddress(lead.email) === normalized,
    );

    if (candidates.length === 1) {
      return { suggestedLeadId: candidates[0].id, candidates };
    }

    return { suggestedLeadId: null, candidates };
  }
}
