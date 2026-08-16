import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { ContactMessage, Lead, LeadStatus, Prisma } from "@medcal/db";
import type { LeadListQuery } from "@medcal/shared";
import { findLeadMatchCandidates } from "./lead-matching";

const DEFAULT_PAGE_SIZE = 20;

// A Lead can have MANY ContactMessages (Lead Inbox design review §1) — Topic/
// Source/interaction-date are not permanent Lead attributes, so the list view
// carries the single latest ContactMessage (with its topic) per Lead rather
// than assuming any one channel/topic represents the Lead going forward.
export type LeadListRow = Prisma.LeadGetPayload<{
  include: {
    contactMessages: {
      take: 1;
      orderBy: { createdAt: "desc" };
      include: { topic: true };
    };
  };
}>;

export interface LeadListResult {
  data: LeadListRow[];
  page: number;
  pageSize: number;
  total: number;
}

export type LeadWithTimeline = Prisma.LeadGetPayload<{
  include: { contactMessages: { include: { topic: true } } };
}>;

export interface NeedsReviewItem {
  message: ContactMessage;
  candidates: Lead[];
}

@Injectable()
export class LeadsService {
  async findAll(companyId: string, query: LeadListQuery): Promise<LeadListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.LeadWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              { organizationName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.getFrom || query.topicId !== undefined
        ? {
            contactMessages: {
              some: {
                ...(query.getFrom ? { getFrom: query.getFrom } : {}),
                ...(query.topicId !== undefined ? { topicId: query.topicId } : {}),
              },
            },
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contactMessages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: { topic: true },
          },
        },
      }),
    ]);

    return { data, page, pageSize, total };
  }

  async findOne(companyId: string, id: string): Promise<LeadWithTimeline> {
    const lead = await prisma.lead.findFirst({
      where: { id, companyId },
      include: {
        // Reverse-chronological interaction timeline (Lead Inbox design
        // review §5) — Lead is the aggregate, ContactMessage rows are its
        // per-channel interactions. `topic` included so the Lead Detail UI
        // can show each interaction's topic name without a second endpoint.
        contactMessages: { orderBy: { createdAt: "desc" }, include: { topic: true } },
      },
    });
    if (!lead) {
      throw new NotFoundException({ message: "Lead not found", code: "LEAD_NOT_FOUND" });
    }
    return lead;
  }

  /**
   * Needs Review = unresolved inbound ContactMessages (leadId IS NULL) that
   * have a possible existing Lead candidate — POSSIBLE MATCH from
   * ContactMessagesService.create() (Lead Inbox corrective patch, locked
   * 2026-08-16). No persisted "possible match" model: candidates are
   * recomputed here at read time using the same matching logic as create(),
   * per the locked "derived, not a business entity" instruction. A message
   * with leadId=null but zero candidates right now (shouldn't occur given
   * create()'s own invariant, but defensive) is excluded — a genuinely
   * unmatched message always gets a Lead created automatically instead.
   */
  async findNeedsReview(companyId: string): Promise<NeedsReviewItem[]> {
    const unresolved = await prisma.contactMessage.findMany({
      where: { companyId, leadId: null },
      orderBy: { createdAt: "desc" },
    });

    const items: NeedsReviewItem[] = [];
    for (const message of unresolved) {
      const candidates = await findLeadMatchCandidates(companyId, {
        email: message.email,
        phone: message.phone,
        organizationName: message.organizationName,
      });
      if (candidates.length > 0) {
        items.push({ message, candidates: candidates.map((c) => c.lead) });
      }
    }
    return items;
  }

  async updateStatus(companyId: string, id: string, status: LeadStatus): Promise<Lead> {
    const lead = await prisma.lead.findFirst({ where: { id, companyId } });
    if (!lead) {
      throw new NotFoundException({ message: "Lead not found", code: "LEAD_NOT_FOUND" });
    }
    return prisma.lead.update({ where: { id }, data: { status } });
  }
}
