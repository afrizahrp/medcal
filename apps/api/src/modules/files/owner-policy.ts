import { BadRequestException, Injectable } from "@nestjs/common";
import type { FileTypePolicy } from "./file-validation";

export interface ResolvedOwner {
  /** Whether the owning business record exists and is visible to this company. */
  exists: boolean;
  /**
   * True once the owner record is CONFIRMED / locked. Attached evidence then
   * becomes immutable: no upload, no replace, no delete through the API.
   * The generic FilesModule never decides this itself — the owning module's
   * policy does, so calibration lifecycle rules never leak into this layer.
   */
  locked: boolean;
}

/**
 * The smallest explicit owner-policy mechanism (audit §11/§14). Each business
 * module that wants to attach files registers ONE policy for its FileOwnerType.
 * The FilesModule ships with the registry EMPTY — Phase 2B registers
 * EQUIPMENT_CALIBRATION when EquipmentCalibrationRecord is built.
 */
export interface FileOwnerPolicy {
  ownerType: string;
  /** RBAC resource of the owning record. File access reuses this — no `file:*` grant. */
  permissionResource: string;
  /** Owner action that reading its files maps to (default "read"). */
  readAction?: string;
  /** Owner action that uploading (create/replace) its files maps to (default "update"). */
  writeAction?: string;
  /**
   * Owner action that deleting its files maps to (default: same as writeAction).
   * Separate from writeAction so an owner type can allow a broad set of roles
   * to upload/replace while restricting delete to a narrower set (e.g.
   * Certificate: TECHNICIAN_MANAGER/SUPERVISOR/ADMIN/GENERAL_MANAGER can
   * upload/replace, but only SUPERADMIN can delete).
   */
  deleteAction?: string;
  fileTypePolicy: FileTypePolicy;
  resolveOwner(companyId: string, ownerId: string): Promise<ResolvedOwner>;
}

@Injectable()
export class FileOwnerPolicyRegistry {
  private readonly policies = new Map<string, FileOwnerPolicy>();

  register(policy: FileOwnerPolicy): void {
    if (this.policies.has(policy.ownerType)) {
      throw new Error(`A file owner policy for "${policy.ownerType}" is already registered`);
    }
    this.policies.set(policy.ownerType, policy);
  }

  has(ownerType: string): boolean {
    return this.policies.has(ownerType);
  }

  get(ownerType: string): FileOwnerPolicy {
    const policy = this.policies.get(ownerType);
    if (!policy) {
      throw new BadRequestException({
        code: "FILE_OWNER_TYPE_UNSUPPORTED",
        message: `No file owner policy is registered for ownerType "${ownerType}"`,
      });
    }
    return policy;
  }
}
