import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { ContactMessage, ContactTopic } from "@medcal/db";
import { contactMessageCreateSchema, emailDomain, isPublicEmailDomain } from "@medcal/shared";

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

    const created = await prisma.contactMessage.create({
      data: {
        companyId,
        getFrom: input.getFrom,
        name: input.name,
        email: input.email,
        phone: input.phone,
        organizationName: input.organizationName,
        subject: input.subject,
        message: input.message,
        topicId: input.topicId,
        utmJson: input.utmJson,
        matchStatus,
        matchedCustomerId,
      },
    });

    return { id: created.id, matchStatus: created.matchStatus };
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
}
