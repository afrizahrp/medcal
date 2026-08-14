import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { EmailWhitelist } from "@medcal/db";
import { isAllowedRegistrationDomain, normalizeEmail } from "@medcal/shared";

@Injectable()
export class WhitelistService {
  async create(email: string, createdBy: string): Promise<EmailWhitelist> {
    // Same domain rule the F4 registration gate enforces at sign-up (see
    // registration-gate.ts) — reused here so an invalid-domain email can
    // never enter EmailWhitelist in the first place.
    if (!isAllowedRegistrationDomain(email)) {
      throw new BadRequestException({
        message: "Only @kalibrasimedika.co.id email addresses are allowed.",
        code: "INVALID_REGISTRATION_DOMAIN",
      });
    }
    const normalized = normalizeEmail(email);
    try {
      return await prisma.emailWhitelist.create({
        data: { email: normalized, createdBy },
      });
    } catch {
      throw new ConflictException("Email already on whitelist");
    }
  }

  async findAll(): Promise<EmailWhitelist[]> {
    return prisma.emailWhitelist.findMany({ orderBy: { createdAt: "desc" } });
  }

  async revoke(id: string, revokedBy: string): Promise<EmailWhitelist> {
    return prisma.emailWhitelist.update({
      where: { id },
      data: { status: "REVOKED", revokedBy, revokedAt: new Date() },
    });
  }
}
