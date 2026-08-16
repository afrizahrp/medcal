import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { ContactMessage, ContactStatus, ContactTopic } from "@medcal/db";
import {
  contactMessageCreateSchema,
  emailDomain,
  isPublicEmailDomain,
  normalizePhone,
} from "@medcal/shared";
import type { ContactMessageLeadResolution } from "@medcal/shared";
import { classifyLeadMatch, findLeadMatchCandidates } from "../leads/lead-matching";

@Injectable()
export class ContactMessagesService {
  async create(companyId: string, rawInput: unknown) {
    // Authoritative server-side validation — this endpoint must not rely
    // solely on apps/web-api having already validated the same shape;
    // reuses the exact schema web-api uses, not a second parallel one.
    const parsed = contactMessageCreateSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid contact message payload",
        code: "INVALID_CONTACT_MESSAGE",
        issues: parsed.error.flatten(),
      });
    }
    const input = parsed.data;

    // companyId is guard-derived (see InternalServiceGuard), never client
    // input, so "unknown companyId" here means this deployment's own
    // COMPANY_ID env var doesn't match a real Company row — a deployment
    // misconfiguration, not a caller error.
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new InternalServerErrorException({
        message: "Server misconfiguration: COMPANY_ID does not match a known company",
        code: "COMPANY_NOT_CONFIGURED",
      });
    }

    if (input.topicId !== undefined) {
      const topic = await prisma.contactTopic.findUnique({ where: { id: input.topicId } });
      if (!topic || !topic.isActive) {
        throw new BadRequestException({
          message: "Invalid topic",
          code: "INVALID_CONTACT_TOPIC",
        });
      }
    }

    const domain = emailDomain(input.email);
    let matchStatus:
      | "NONE"
      | "EXACT_EMAIL"
      | "DOMAIN_CANDIDATE" = "NONE";
    let matchedCustomerId: string | undefined;

    const exact = await prisma.customerContact.findFirst({
      where: {
        companyId,
        email: { equals: input.email, mode: "insensitive" },
      },
    });
    if (exact) {
      matchStatus = "EXACT_EMAIL";
      matchedCustomerId = exact.customerId;
    } else if (domain && !isPublicEmailDomain(domain)) {
      const domainHit = await prisma.customerContact.findFirst({
        where: {
          companyId,
          email: { endsWith: `@${domain}`, mode: "insensitive" },
        },
      });
      if (domainHit) {
        matchStatus = "DOMAIN_CANDIDATE";
        matchedCustomerId = domainHit.customerId;
      }
    }

    // Lead identity matching (Lead Inbox design review, 2026-08-16, §4,
    // corrected 2026-08-16) — a separate concern from the
    // matchStatus/matchedCustomerId Customer dedup above. STRONG MATCH
    // auto-attaches; POSSIBLE MATCH leaves leadId null (surfaced in Needs
    // Review, never auto-created into a Lead — avoids duplicate Leads);
    // NO MATCH creates a new Lead.
    const phoneNormalized = input.phone ? normalizePhone(input.phone) : undefined;
    const candidates = await findLeadMatchCandidates(companyId, {
      email: input.email,
      phone: input.phone,
      organizationName: input.organizationName,
    });
    const match = classifyLeadMatch(candidates);

    let leadId: string | null;
    if (match.kind === "STRONG") {
      leadId = match.leadId;
    } else if (match.kind === "POSSIBLE") {
      leadId = null;
    } else {
      const newLead = await prisma.lead.create({
        data: {
          companyId,
          name: input.name,
          email: input.email,
          phone: input.phone,
          organizationName: input.organizationName,
        },
      });
      leadId = newLead.id;
    }

    const created = await prisma.contactMessage.create({
      data: {
        companyId,
        getFrom: input.getFrom,
        name: input.name,
        email: input.email,
        phone: input.phone,
        phoneNormalized,
        organizationName: input.organizationName,
        subject: input.subject,
        message: input.message,
        topicId: input.topicId,
        utmJson: input.utmJson,
        matchStatus,
        matchedCustomerId,
        leadId,
      },
    });

    return { id: created.id, matchStatus: created.matchStatus, leadId: created.leadId };
  }

  /**
   * Staff resolution of a Needs Review item (POSSIBLE MATCH, ContactMessage
   * still leadId=null). Two actions only: attach to an existing Lead the
   * staff member picked, or create a new Lead from this message's own
   * identity — exactly the same Lead-creation shape as the NO MATCH path in
   * create() above. Concurrency-safe: the update only succeeds if leadId is
   * still null at write time (atomic WHERE-guarded updateMany), so a second
   * staff member resolving the same item — or the message somehow already
   * being resolved — fails loudly instead of silently overwriting.
   */
  async resolveLeadMatch(
    companyId: string,
    messageId: string,
    resolution: ContactMessageLeadResolution,
  ): Promise<ContactMessage> {
    const message = await prisma.contactMessage.findFirst({ where: { id: messageId, companyId } });
    if (!message) {
      throw new NotFoundException({ message: "Contact message not found", code: "CONTACT_MESSAGE_NOT_FOUND" });
    }
    if (message.leadId !== null) {
      throw new BadRequestException({
        message: "Contact message is already linked to a Lead",
        code: "CONTACT_MESSAGE_ALREADY_LINKED",
      });
    }

    let targetLeadId: string;
    let createdLeadIdOnFailure: string | undefined;

    if (resolution.action === "ATTACH") {
      const targetLead = await prisma.lead.findFirst({ where: { id: resolution.leadId, companyId } });
      if (!targetLead) {
        throw new BadRequestException({ message: "Target lead not found", code: "LEAD_NOT_FOUND" });
      }
      targetLeadId = targetLead.id;
    } else {
      const newLead = await prisma.lead.create({
        data: {
          companyId,
          name: message.name,
          email: message.email,
          phone: message.phone,
          organizationName: message.organizationName,
        },
      });
      targetLeadId = newLead.id;
      createdLeadIdOnFailure = newLead.id;
    }

    const result = await prisma.contactMessage.updateMany({
      where: { id: messageId, companyId, leadId: null },
      data: { leadId: targetLeadId },
    });
    if (result.count === 0) {
      // Someone else resolved it between our read and this write — roll back
      // the Lead we just created (CREATE_NEW case) so it isn't orphaned.
      if (createdLeadIdOnFailure) {
        await prisma.lead.delete({ where: { id: createdLeadIdOnFailure } });
      }
      throw new BadRequestException({
        message: "Contact message was already resolved by another user",
        code: "CONTACT_MESSAGE_ALREADY_LINKED",
      });
    }

    return prisma.contactMessage.findUniqueOrThrow({ where: { id: messageId } });
  }

  async findAll(companyId: string): Promise<ContactMessage[]> {
    return prisma.contactMessage.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findActiveTopics(): Promise<ContactTopic[]> {
    return prisma.contactTopic.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async updateStatus(companyId: string, id: string, status: ContactStatus): Promise<ContactMessage> {
    const message = await prisma.contactMessage.findFirst({ where: { id, companyId } });
    if (!message) {
      throw new NotFoundException({ message: "Contact message not found", code: "CONTACT_MESSAGE_NOT_FOUND" });
    }
    return prisma.contactMessage.update({ where: { id }, data: { status } });
  }
}
