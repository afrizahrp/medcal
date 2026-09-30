import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { hasPermission } from "@medcal/auth";
import { prisma } from "@medcal/db";
import { FilesService } from "../files/files.service";
import { recordAuditLog } from "../calibration-jobs/audit-log";
import { isWellFormedVerificationToken } from "../calibration-jobs/certificate-verification-token";

export type CertificateVerificationStatus = "VALID" | "EXPIRED" | "REVOKED" | "SUPERSEDED";

/**
 * Minimal, safe view of a certificate for someone who scanned its QR code.
 * No internal identifiers (certificate/job/customer/device ids), no token, no
 * user data — only what a person needs to judge the certificate.
 */
export interface CertificateVerificationDto {
  number: string;
  status: CertificateVerificationStatus;
  issuedAt: Date | null;
  validUntil: Date | null;
  customerName: string;
  device: { name: string; brand: string | null; model: string | null };
  /** True only when the stored PDF can be opened through this verification. */
  pdfAvailable: boolean;
}

export interface VerificationRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

// One shared, constant response for every "you cannot see this" case: a
// malformed token, an unknown token, a DRAFT row, and a certificate that
// belongs to somebody else are indistinguishable to the caller.
const NOT_FOUND = () =>
  new NotFoundException({ code: "CERTIFICATE_NOT_FOUND", message: "Certificate not found" });

const CERTIFICATE_OWNER_TYPE = "CERTIFICATE" as const;

@Injectable()
export class CertificateVerificationService {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  /**
   * Resolves `token` to a certificate only if `userId` may see it:
   * - an ACTIVE user linked (CustomerUserLink) to the certificate's customer, or
   * - an ACTIVE company member whose role holds certificate:read (staff).
   * Possession of the token alone is never sufficient: the token is a locator,
   * not a credential.
   */
  private async findAuthorized(token: string, userId: string) {
    if (!isWellFormedVerificationToken(token)) return null;

    const certificate = await prisma.certificate.findUnique({
      where: { verificationToken: token },
      include: {
        customer: { select: { name: true } },
        device: { select: { brand: true, model: true, deviceType: { select: { name: true } } } },
      },
    });
    // A DRAFT row has no public identity yet.
    if (!certificate || certificate.status === "DRAFT") return null;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== "ACTIVE") return null;

    const link = await prisma.customerUserLink.findUnique({
      where: { userId_customerId: { userId, customerId: certificate.customerId } },
      select: { id: true },
    });
    if (link) return certificate;

    const membership = await prisma.userMembership.findUnique({
      where: { userId_companyId: { userId, companyId: certificate.companyId } },
      select: { role: true },
    });
    if (membership && hasPermission(membership.role, "certificate" as never, "read")) return certificate;

    return null;
  }

  private statusOf(
    certificate: { status: string; validUntil: Date | null },
    now: Date,
  ): CertificateVerificationStatus {
    if (certificate.status === "REVOKED") return "REVOKED";
    if (certificate.status === "SUPERSEDED") return "SUPERSEDED";
    if (certificate.validUntil && certificate.validUntil.getTime() < now.getTime()) return "EXPIRED";
    return "VALID";
  }

  async resolve(token: string, userId: string, now: Date = new Date()): Promise<CertificateVerificationDto> {
    const certificate = await this.findAuthorized(token, userId);
    if (!certificate) throw NOT_FOUND();
    return {
      number: certificate.number,
      status: this.statusOf(certificate, now),
      issuedAt: certificate.issuedAt,
      validUntil: certificate.validUntil,
      customerName: certificate.customer.name,
      device: {
        name: certificate.device.deviceType.name,
        brand: certificate.device.brand,
        model: certificate.device.model,
      },
      pdfAvailable: certificate.status === "ISSUED" && certificate.pdfFileObjectId !== null,
    };
  }

  /** The stored PDF — same file for UPLOADED and GENERATED certificates. Only ISSUED certificates expose it. */
  async openPdf(token: string, userId: string, ctx: VerificationRequestContext) {
    const certificate = await this.findAuthorized(token, userId);
    if (!certificate) throw NOT_FOUND();
    if (certificate.status !== "ISSUED" || !certificate.pdfFileObjectId) {
      throw new NotFoundException({
        code: "CERTIFICATE_PDF_UNAVAILABLE",
        message: "No PDF is available for this certificate",
      });
    }
    const { stream, fileObject } = await this.files.getForAuthorizedRead(
      certificate.companyId,
      certificate.pdfFileObjectId,
      CERTIFICATE_OWNER_TYPE,
      certificate.id,
    );
    await recordAuditLog({
      companyId: certificate.companyId,
      userId,
      action: "CERTIFICATE_PDF_VIEWED_VIA_VERIFICATION",
      outcome: "SUCCESS",
      targetType: "Certificate",
      targetId: certificate.id,
      metadata: {
        certificateId: certificate.id,
        certificateNumber: certificate.number,
        source: certificate.source,
        fileObjectId: fileObject.id,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return {
      stream,
      mimeType: fileObject.mimeType ?? "application/pdf",
      filename: `${certificate.number.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`,
    };
  }
}
