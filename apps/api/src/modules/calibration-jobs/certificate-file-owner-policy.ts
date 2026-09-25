import { prisma } from "@medcal/db";
import type { FileOwnerPolicy } from "../files/owner-policy";

/**
 * The CERTIFICATE FileOwnerPolicy registered with the generic FilesModule.
 * A scanned certificate PDF attaches to a Certificate record (ownerId =
 * Certificate.id, not the CalibrationJob — Certificate is the 1:1 owner per
 * the existing schema). Authorization reuses the `certificate` permission:
 *
 * - writeAction "update" gates upload AND replace — both are the same
 *   generic FilesService.upload() call, one per certificate version.
 * - deleteAction "delete" is a SEPARATE, narrower action (see owner-policy.ts)
 *   so upload/replace can stay open to TECHNICIAN_MANAGER/SUPERVISOR/ADMIN/
 *   GENERAL_MANAGER while delete stays SUPERADMIN-only (no RolePermission
 *   row is seeded for "certificate:delete" to any role — SUPERADMIN's
 *   unconditional hasPermission bypass is the only way to satisfy it).
 *
 * `locked` is always false: certificate "issuance"/finalization is out of
 * scope for this feature (see certificate.service.ts) and no lock concept
 * has been defined for it — inventing one here would invent business rules
 * the task explicitly said not to invent.
 */
export const certificateFileOwnerPolicy: FileOwnerPolicy = {
  ownerType: "CERTIFICATE",
  permissionResource: "certificate",
  readAction: "read",
  writeAction: "update",
  deleteAction: "delete",
  fileTypePolicy: {
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
    maxBytes: 10 * 1024 * 1024,
  },
  async resolveOwner(companyId, ownerId) {
    // ownerId = Certificate.id
    const certificate = await prisma.certificate.findFirst({
      where: { id: ownerId, companyId },
      select: { id: true },
    });
    return { exists: Boolean(certificate), locked: false };
  },
};
