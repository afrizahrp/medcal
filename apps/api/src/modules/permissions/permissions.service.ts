import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { permissionCatalog, refreshRolePermissionCache } from "@medcal/auth";

export interface GrantInput {
  resource: string;
  action: string;
}

export interface RoleGrantSummary {
  role: MembershipRole;
  grants: GrantInput[];
  readOnly: boolean;
}

function fullCatalogGrants(): GrantInput[] {
  return Object.entries(permissionCatalog).flatMap(([resource, actions]) =>
    actions.map((action) => ({ resource, action })),
  );
}

function dedupe(grants: GrantInput[]): GrantInput[] {
  const seen = new Map<string, GrantInput>();
  for (const grant of grants) {
    seen.set(`${grant.resource}:${grant.action}`, grant);
  }
  return [...seen.values()];
}

function assertKnownGrants(grants: GrantInput[]): void {
  const unknown = grants.filter((grant) => {
    const actions = permissionCatalog[grant.resource];
    return !actions || !actions.includes(grant.action);
  });
  if (unknown.length > 0) {
    throw new BadRequestException({
      message: "Unknown permission(s)",
      code: "UNKNOWN_PERMISSION",
      unknown,
    });
  }
}

// RolePermission is the sole DB-driven source for role -> permission grants.
// The set of valid (resource, action) pairs stays code-defined in
// packages/auth/src/access-control.ts's permissionCatalog — this service
// only ever assigns roles to pairs already known to that catalog.
@Injectable()
export class PermissionsService {
  async listRoles(): Promise<RoleGrantSummary[]> {
    const roles: MembershipRole[] = [
      "SUPERADMIN",
      "ADMIN",
      "SUPERVISOR",
      "TECHNICIAN",
      "TECHNICIAN_MANAGER",
      "FINANCE",
      "CUSTOMER",
      "CUSTOMER_SERVICE",
    ];
    return Promise.all(roles.map((role) => this.getRole(role)));
  }

  async getRole(role: MembershipRole): Promise<RoleGrantSummary> {
    if (role === "SUPERADMIN") {
      // SUPERADMIN has no RolePermission rows — hasPermission() hardcodes an
      // unconditional bypass instead. Synthesize the full catalog here so the
      // UI can show "everything, read-only" without a stale seeded copy.
      return { role, grants: fullCatalogGrants(), readOnly: true };
    }
    const rows = await prisma.rolePermission.findMany({ where: { role } });
    return {
      role,
      grants: rows.map((row) => ({ resource: row.resource, action: row.action })),
      readOnly: false,
    };
  }

  async replaceRole(
    role: MembershipRole,
    grants: GrantInput[],
    actorUserId: string,
  ): Promise<RoleGrantSummary> {
    if (role === "SUPERADMIN") {
      throw new BadRequestException({
        message: "SUPERADMIN is fixed and not editable",
        code: "SUPERADMIN_NOT_EDITABLE",
      });
    }

    const deduped = dedupe(grants);
    assertKnownGrants(deduped);

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { role } }),
      prisma.rolePermission.createMany({
        data: deduped.map((grant) => ({
          role,
          resource: grant.resource,
          action: grant.action,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        })),
        skipDuplicates: true,
      }),
    ]);

    // Read-your-writes: the admin's own save must be reflected immediately,
    // in this same request, before the response is returned.
    await refreshRolePermissionCache();

    return this.getRole(role);
  }
}
