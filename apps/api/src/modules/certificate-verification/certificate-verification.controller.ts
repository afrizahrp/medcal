import { Controller, Get, Inject, Param, Req, StreamableFile, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@medcal/auth";
import {
  CertificateVerificationService,
  type CertificateVerificationDto,
} from "./certificate-verification.service";

/**
 * QR landing endpoints. Session-only (the global auth guard already rejects
 * anonymous callers); WHICH certificates the session may see is decided by
 * CertificateVerificationService (customer link or staff certificate:read).
 */
@Controller("certificate-verification")
export class CertificateVerificationController {
  constructor(
    @Inject(CertificateVerificationService) private readonly verification: CertificateVerificationService,
  ) {}

  private async sessionUserId(request: Request): Promise<string> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();
    return session.user.id;
  }

  @Get(":token")
  async resolve(@Param("token") token: string, @Req() request: Request): Promise<CertificateVerificationDto> {
    return this.verification.resolve(token, await this.sessionUserId(request));
  }

  @Get(":token/pdf")
  async pdf(@Param("token") token: string, @Req() request: Request): Promise<StreamableFile> {
    const { stream, mimeType, filename } = await this.verification.openPdf(
      token,
      await this.sessionUserId(request),
      { ipAddress: request.ip ?? null, userAgent: request.headers["user-agent"] ?? null },
    );
    return new StreamableFile(stream, { type: mimeType, disposition: `inline; filename="${filename}"` });
  }
}
