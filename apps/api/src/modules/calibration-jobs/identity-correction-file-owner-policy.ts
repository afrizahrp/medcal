import { prisma } from "@medcal/db";
import type { FileOwnerPolicy } from "../files/owner-policy";

/**
 * The IDENTITY_CORRECTION FileOwnerPolicy registered with the generic
 * FilesModule. Both signatures (TECHNICIAN and CUSTOMER) are physically on one
 * sheet of paper — the BA is photographed once. The photo attaches to the
 * IdentityCorrection itself (ownerId = correction id), not to either signature
 * row.
 *
 * - Authorization reuses the `calibrationJob` permission: an Identity Correction
 *   BA is a sub-resource of the job, so no new RBAC resource is introduced.
 * - writeAction is `submitIdentityCorrection` (not the default `update`) so the
 *   TECHNICIAN who submits the BA can also upload its photo — a TECHNICIAN has
 *   no `calibrationJob:update` grant.
 * - `locked` once the correction is decided (APPROVED / REJECTED): a decided
 *   BA and its evidence are frozen.
 */
export const identityCorrectionFileOwnerPolicy: FileOwnerPolicy = {
  ownerType: "IDENTITY_CORRECTION",
  permissionResource: "calibrationJob",
  readAction: "read",
  writeAction: "submitIdentityCorrection",
  fileTypePolicy: {
    mimeTypes: ["image/png", "image/jpeg", "application/pdf"],
    extensions: [".png", ".jpg", ".jpeg", ".pdf"],
    maxBytes: 10 * 1024 * 1024,
  },
  async resolveOwner(companyId, ownerId) {
    // ownerId = IdentityCorrection.id (the BA record itself)
    const correction = await prisma.identityCorrection.findFirst({
      where: { id: ownerId, companyId },
      select: { status: true },
    });
    return {
      exists: Boolean(correction),
      locked: correction?.status === "APPROVED" || correction?.status === "REJECTED",
    };
  },
};
