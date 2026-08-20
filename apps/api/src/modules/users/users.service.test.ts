import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { UsersService } from "./users.service";

const service = new UsersService();
const realCompanyId = "PKM";
const createdUserIds: string[] = [];
const createdMembershipKeys: Array<{ userId: string; companyId: string }> = [];
const createdCompanyIds: string[] = [];

async function makeUser(overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: {
      email: `user-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
      name: "Test User",
      status: "ACTIVE",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeMembership(userId: string, companyId: string, role: "ADMIN" | "SUPERVISOR" | "TECHNICIAN" | "FINANCE" | "CUSTOMER") {
  const membership = await prisma.userMembership.create({
    data: { userId, companyId, role, isDefault: false },
  });
  createdMembershipKeys.push({ userId, companyId });
  return membership;
}

afterAll(async () => {
  for (const key of createdMembershipKeys) {
    await prisma.userMembership.deleteMany({ where: key }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.company.deleteMany({ where: { id: { in: createdCompanyIds } } });
});

describe("UsersService.findAll", () => {
  it("scopes results to users with membership in the given companyId (tenant isolation)", async () => {
    const otherCompanyId = `Y${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other", status: "ACTIVE" } });
    createdCompanyIds.push(otherCompanyId);
    
    const otherUser = await makeUser();
    await makeMembership(otherUser.id, otherCompanyId, "ADMIN");

    const result = await service.findAll(realCompanyId, {});
    expect(result.data.some((u) => u.id === otherUser.id)).toBe(false);
  });

  it("filters by search across name/email", async () => {
    const needle = `Searchable-${randomUUID().slice(0, 8)}`;
    const user = await makeUser({ name: needle });
    await makeMembership(user.id, realCompanyId, "ADMIN");

    const result = await service.findAll(realCompanyId, { search: needle });
    expect(result.data.map((u) => u.id)).toContain(user.id);
  });

  it("filters by status", async () => {
    const user = await makeUser({ status: "DISABLED" });
    await makeMembership(user.id, realCompanyId, "ADMIN");

    const result = await service.findAll(realCompanyId, { status: "DISABLED" });
    expect(result.data.map((u) => u.id)).toContain(user.id);
    expect(result.data.every((u) => u.status === "DISABLED")).toBe(true);
  });

  it("filters by role", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, "TECHNICIAN");

    const result = await service.findAll(realCompanyId, { role: "TECHNICIAN" });
    expect(result.data.map((u) => u.id)).toContain(user.id);
    expect(result.data.every((u) => u.membership?.role === "TECHNICIAN")).toBe(true);
  });

  it("paginates and sorts newest-first by default", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, "ADMIN");

    const result = await service.findAll(realCompanyId, { page: 1, pageSize: 1 });
    expect(result.data.length).toBeLessThanOrEqual(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(1);
  });
});

describe("UsersService.findOne", () => {
  it("returns the User with membership for this company", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, "ADMIN");

    const result = await service.findOne(realCompanyId, user.id);
    expect(result.id).toBe(user.id);
    expect(result.membership?.role).toBe("ADMIN");
  });

  it("throws NotFoundException for a User without membership in this company", async () => {
    const user = await makeUser();

    await expect(service.findOne(realCompanyId, user.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("UsersService.updateStatus", () => {
  it("updates User status", async () => {
    const user = await makeUser({ status: "ACTIVE" });
    await makeMembership(user.id, realCompanyId, "ADMIN");

    const updated = await service.updateStatus(realCompanyId, user.id, "DISABLED");
    expect(updated.status).toBe("DISABLED");
  });

  it("throws NotFoundException for a User without membership in this company", async () => {
    const user = await makeUser();

    await expect(service.updateStatus(realCompanyId, user.id, "DISABLED")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects disabling the last ACTIVE SUPERADMIN (F2)", async () => {
    const companyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: companyId, name: "F2 Solo", status: "ACTIVE" } });
    createdCompanyIds.push(companyId);

    const user = await makeUser({ status: "ACTIVE" });
    await prisma.userMembership.create({
      data: { userId: user.id, companyId, role: "SUPERADMIN", isDefault: false },
    });
    createdMembershipKeys.push({ userId: user.id, companyId });

    await expect(service.updateStatus(companyId, user.id, "DISABLED")).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.status).toBe("ACTIVE");
  });

  it("allows disabling one SUPERADMIN when another ACTIVE SUPERADMIN remains (F2)", async () => {
    const companyId = `T${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: companyId, name: "F2 Pair", status: "ACTIVE" } });
    createdCompanyIds.push(companyId);

    const first = await makeUser({ status: "ACTIVE" });
    const second = await makeUser({ status: "ACTIVE" });
    await prisma.userMembership.create({
      data: { userId: first.id, companyId, role: "SUPERADMIN", isDefault: false },
    });
    await prisma.userMembership.create({
      data: { userId: second.id, companyId, role: "SUPERADMIN", isDefault: false },
    });
    createdMembershipKeys.push({ userId: first.id, companyId }, { userId: second.id, companyId });

    const updated = await service.updateStatus(companyId, first.id, "DISABLED");
    expect(updated.status).toBe("DISABLED");
  });
});

describe("UsersService.assignMembership", () => {
  it("creates a new membership for the user", async () => {
    const user = await makeUser();

    const membership = await service.assignMembership(realCompanyId, user.id, "SUPERVISOR");
    createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

    expect(membership.role).toBe("SUPERVISOR");
    expect(membership.companyId).toBe(realCompanyId);
  });

  it("activates an INVITED user when assigning membership (G5 provisioning)", async () => {
    const user = await makeUser({ status: "INVITED" });

    const membership = await service.assignMembership(realCompanyId, user.id, "CUSTOMER");
    createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

    expect(membership.role).toBe("CUSTOMER");
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.status).toBe("ACTIVE");
  });

  it("does not re-enable a DISABLED user when assigning membership", async () => {
    const user = await makeUser({ status: "DISABLED" });

    const membership = await service.assignMembership(realCompanyId, user.id, "CUSTOMER");
    createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

    expect(membership.role).toBe("CUSTOMER");
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.status).toBe("DISABLED");
  });

  it("throws ForbiddenException when trying to assign SUPERADMIN role (G2 lock)", async () => {
    const user = await makeUser();

    await expect(
      service.assignMembership(realCompanyId, user.id, "SUPERADMIN"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws BadRequestException when membership already exists", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, "ADMIN");

    await expect(
      service.assignMembership(realCompanyId, user.id, "SUPERVISOR"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws NotFoundException for non-existent user", async () => {
    await expect(
      service.assignMembership(realCompanyId, "non-existent-id", "ADMIN"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe("internal staff domain guard", () => {
    const internalStaffRoles = ["ADMIN", "SUPERVISOR", "TECHNICIAN", "FINANCE"] as const;

    for (const role of internalStaffRoles) {
      it(`allows assigning ${role} to a @kalibrasimedika.co.id user`, async () => {
        const user = await makeUser();
        const membership = await service.assignMembership(realCompanyId, user.id, role);
        createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });
        expect(membership.role).toBe(role);
      });

      it(`rejects assigning ${role} to an external-domain user (INTERNAL_STAFF_DOMAIN_REQUIRED)`, async () => {
        const user = await makeUser({ email: `deden-${randomUUID().slice(0, 8)}@bipmed.co.id` });
        await expect(service.assignMembership(realCompanyId, user.id, role)).rejects.toMatchObject({
          status: 403,
          response: expect.objectContaining({ code: "INTERNAL_STAFF_DOMAIN_REQUIRED" }),
        });
      });
    }

    it("still allows assigning CUSTOMER to an external-domain user (G4 preserved)", async () => {
      const user = await makeUser({ email: `customer-${randomUUID().slice(0, 8)}@gmail.com` });
      const membership = await service.assignMembership(realCompanyId, user.id, "CUSTOMER");
      createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });
      expect(membership.role).toBe("CUSTOMER");
    });
  });
});

describe("UsersService.updateMembershipRole", () => {
  it("updates the membership role", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, "ADMIN");

    const updated = await service.updateMembershipRole(realCompanyId, user.id, "SUPERVISOR");
    expect(updated.role).toBe("SUPERVISOR");
  });

  it("throws ForbiddenException when trying to change to SUPERADMIN role (G2 lock)", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, "ADMIN");

    await expect(
      service.updateMembershipRole(realCompanyId, user.id, "SUPERADMIN"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws ForbiddenException when trying to change SUPERADMIN role (G2 lock)", async () => {
    const user = await makeUser();
    const membership = await prisma.userMembership.create({
      data: { userId: user.id, companyId: realCompanyId, role: "SUPERADMIN", isDefault: false },
    });
    createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

    await expect(
      service.updateMembershipRole(realCompanyId, user.id, "ADMIN"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws NotFoundException for non-existent membership", async () => {
    const user = await makeUser();

    await expect(
      service.updateMembershipRole(realCompanyId, user.id, "ADMIN"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe("internal staff domain guard", () => {
    it("rejects changing an external-domain user's role into an internal staff role", async () => {
      const user = await makeUser({ email: `deden-${randomUUID().slice(0, 8)}@bipmed.co.id` });
      await makeMembership(user.id, realCompanyId, "CUSTOMER");

      await expect(
        service.updateMembershipRole(realCompanyId, user.id, "SUPERVISOR"),
      ).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({ code: "INTERNAL_STAFF_DOMAIN_REQUIRED" }),
      });
    });

    it("allows changing an internal-domain user's role between internal staff roles", async () => {
      const user = await makeUser();
      await makeMembership(user.id, realCompanyId, "SUPERVISOR");

      const updated = await service.updateMembershipRole(realCompanyId, user.id, "FINANCE");
      expect(updated.role).toBe("FINANCE");
    });

    it("still allows changing an external-domain user's role to CUSTOMER (G4 preserved)", async () => {
      const user = await makeUser({ email: `customer-${randomUUID().slice(0, 8)}@gmail.com` });
      await makeMembership(user.id, realCompanyId, "CUSTOMER");

      const updated = await service.updateMembershipRole(realCompanyId, user.id, "CUSTOMER");
      expect(updated.role).toBe("CUSTOMER");
    });
  });
});

describe("UsersService.removeMembership", () => {
  it("removes the membership", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, "ADMIN");

    await service.removeMembership(realCompanyId, user.id);

    const membership = await prisma.userMembership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId: realCompanyId } },
    });
    expect(membership).toBeNull();
  });

  it("throws ForbiddenException when trying to remove SUPERADMIN membership (G2 lock)", async () => {
    const user = await makeUser();
    await prisma.userMembership.create({
      data: { userId: user.id, companyId: realCompanyId, role: "SUPERADMIN", isDefault: false },
    });
    createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

    await expect(
      service.removeMembership(realCompanyId, user.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws NotFoundException for non-existent membership", async () => {
    const user = await makeUser();

    await expect(
      service.removeMembership(realCompanyId, user.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("UsersService.findUsersWithoutMembership", () => {
  it("returns users that have no membership in this company", async () => {
    const user = await makeUser();

    const result = await service.findUsersWithoutMembership(realCompanyId);
    expect(result.some((u) => u.id === user.id)).toBe(true);
  });

  it("excludes users that have membership in this company", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, "ADMIN");

    const result = await service.findUsersWithoutMembership(realCompanyId);
    expect(result.some((u) => u.id === user.id)).toBe(false);
  });
});
