import { ConflictException, Injectable } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { EmailWhitelist } from "@medcal/db";
import { normalizeEmail } from "@medcal/shared";

@Injectable()
export class WhitelistService {
  async create(email: string, createdBy: string): Promise<EmailWhitelist> {
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
