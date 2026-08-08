import { Injectable } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { ContactMessageCreateInput } from "@medcal/shared";
import { emailDomain, isPublicEmailDomain } from "@medcal/shared";

@Injectable()
export class ContactMessagesService {
  async create(companyId: string, input: ContactMessageCreateInput) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return { error: "Unknown companyId", statusCode: 400 };
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
}
