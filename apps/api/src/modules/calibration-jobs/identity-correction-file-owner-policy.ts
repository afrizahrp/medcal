import { prisma } from "@medcal/db";
import type { FileOwnerPolicy } from "../files/owner-policy";

/**
 * The IDENTITY_CORRECTION FileOwnerPolicy registered with the generic
 * FilesModule. A signature image attaches to one IdentityCorrectionSignature
 * row (ownerId = signature id, NOT the correction id — one image per signer).
 *
 * - Authorization reuses the `calibrationJob` permission: an Identity Correction
 *   BA is a sub-resource of the job, so no new RBAC resource is introduced.
 * - writeAction is `submitIdentityCorrection` (not the default `update`) so the
 *   TECHNICIAN who submits the BA can also upload its signature images — a
 *   TECHNICIAN has no `calibrationJob:update` grant.
 * - `locked` once the parent correction is decided (APPROVED / REJECTED): a
 *   decided BA and its signatures are frozen evidence.
 */
export const identityCorrectionFileOwnerPolicy: FileOwnerPolicy = {
  ownerType: "IDENTITY_CORRECTION",
  permissionResource: "calibrationJob",
  readAction: "read",
  writeAction: "submitIdentityCorrection",
  fileTypePolicy: {
    mimeTypes: ["image/png", "image/jpeg", "application/pdf"],
    extensions: [".png", ".jpg", ".jpeg", ".pdf"],
    maxBytes: 5 * 1024 * 1024,
  },
  async resolveOwner(companyId, ownerId) {
    // ownerId = IdentityCorrectionSignature.id
    const signature = await prisma.identityCorrectionSignature.findFirst({
      where: { id: ownerId, companyId },
      select: { identityCorrection: { select: { status: true } } },
    });
    return {
      exists: Boolean(signature),
      locked:
        signature?.identityCorrection.status === "APPROVED" ||
        signature?.identityCorrection.status === "REJECTED",
    };
  },
};
