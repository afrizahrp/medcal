import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { UsersService, isCustomerPortalEligible } from "./users.service";

const service = new UsersService();
const realCompanyId = "PKM";
const createdUserIds: string[] = [];
const createdMembershipKeys: Array<{ userId: string; companyId: string }> = [];
const createdCompanyIds: string[] = [];
const createdCustomerIds: string[] = [];

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

async function makeMembership(
  userId: string,
  companyId: string,
  role: "ADMIN" | "SUPERVISOR" | "TECHNICIAN" | "FINANCE" | "CUSTOMER",
) {
  const membership = await prisma.userMembership.create({
    data: { userId, companyId, role, isDefault: false },
  });
  createdMembershipKeys.push({ userId, companyId });
  return membership;
}

async function makeCustomer(companyId: string, email?: string) {
  const customer = await prisma.customer.create({
    data: {
      companyId,
      number: `CUL-${randomUUID().slice(0, 8)}`,
      name: `Test Customer ${randomUUID().slice(0, 8)}`,
      status: "ACTIVE",
      ...(email ? { email } : {}),
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

/** A CUSTOMER-eligible pair: the user's email equals Customer.email (the PIC Email). */
async function makeEligiblePair(companyId = realCompanyId, userOverrides: Record<string, unknown> = {}) {
  const email = `pic-${randomUUID().slice(0, 8)}@gmail.com`;
  const user = await makeUser({ email, ...userOverrides });
  const customer = await makeCustomer(companyId, email);
  return { user, customer, email };
}

afterAll(async () => {
  for (const key of createdMembershipKeys) {
    await prisma.userMembership.deleteMany({ where: key }).catch(() => {});
  }
  await prisma.customerUserLink.deleteMany({ where: { customerId: { in: createdCustomerIds } } }).catch(() => {});
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } }).catch(() => {});
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

  describe("sortBy / sortDir (Management List canonical pattern)", () => {
    const tag = `Sort-${randomUUID().slice(0, 8)}`;

    it("sorts by name ascending when requested", async () => {
      const zebra = await makeUser({ name: `${tag}-ZZZ` });
      const alpha = await makeUser({ name: `${tag}-AAA` });
      await makeMembership(zebra.id, realCompanyId, "ADMIN");
      await makeMembership(alpha.id, realCompanyId, "ADMIN");

      const result = await service.findAll(realCompanyId, {
        search: tag,
        sortBy: "name",
        sortDir: "asc",
        pageSize: 100,
      });
      const names = result.data.map((u) => u.name);
      expect(names).toEqual([`${tag}-AAA`, `${tag}-ZZZ`]);
    });

    it("sorts by name descending when requested", async () => {
      const result = await service.findAll(realCompanyId, {
        search: tag,
        sortBy: "name",
        sortDir: "desc",
        pageSize: 100,
      });
      expect(result.data.map((u) => u.name)).toEqual([`${tag}-ZZZ`, `${tag}-AAA`]);
    });

    it("falls back to the createdAt-desc default for an unwhitelisted sortBy", async () => {
      const fresh = await makeUser({ name: `${tag}-fallback` });
      await makeMembership(fresh.id, realCompanyId, "ADMIN");

      const result = await service.findAll(realCompanyId, {
        search: tag,
        sortBy: "passwordHash",
        pageSize: 1,
      });
      expect(result.data[0]?.id).toBe(fresh.id);
    });

    it("keeps a deterministic order (id tie-breaker) across pages when sort values tie", async () => {
      const query = { search: tag, sortBy: "status", sortDir: "asc" as const };
      const pageOne = await service.findAll(realCompanyId, { ...query, page: 1, pageSize: 2 });
      const pageTwo = await service.findAll(realCompanyId, { ...query, page: 2, pageSize: 2 });
      const ids = [...pageOne.data, ...pageTwo.data].map((u) => u.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
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

    await expect(service.updateStatus(realCompanyId, user.id, "DISABLED")).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
    const { user, customer } = await makeEligiblePair(realCompanyId, { status: "INVITED" });

    const membership = await service.assignMembership(realCompanyId, user.id, "CUSTOMER", customer.id);
    createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

    expect(membership.role).toBe("CUSTOMER");
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.status).toBe("ACTIVE");
  });

  it("does not re-enable a DISABLED user when assigning membership", async () => {
    const { user, customer } = await makeEligiblePair(realCompanyId, { status: "DISABLED" });

    const membership = await service.assignMembership(realCompanyId, user.id, "CUSTOMER", customer.id);
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
      const { user, customer } = await makeEligiblePair();
      const membership = await service.assignMembership(
        realCompanyId,
        user.id,
        "CUSTOMER",
        customer.id,
      );
      createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });
      expect(membership.role).toBe("CUSTOMER");
    });
  });

  describe("CustomerUserLink (Customer Portal authorization foundation)", () => {
    it("creates a CustomerUserLink when approving a CUSTOMER membership with a valid customerId", async () => {
      const { user, customer } = await makeEligiblePair();

      const membership = await service.assignMembership(
        realCompanyId,
        user.id,
        "CUSTOMER",
        customer.id,
      );
      createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

      expect(membership.role).toBe("CUSTOMER");
      const link = await prisma.customerUserLink.findUnique({
        where: { userId_customerId: { userId: user.id, customerId: customer.id } },
      });
      expect(link).not.toBeNull();
    });

    it("resolves the relationship in both directions (User -> Customer and Customer -> User)", async () => {
      const { user, customer } = await makeEligiblePair();
      await service.assignMembership(realCompanyId, user.id, "CUSTOMER", customer.id);
      createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

      const viaUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: { customerLinks: { include: { customer: true } } },
      });
      expect(viaUser?.customerLinks.some((l) => l.customerId === customer.id)).toBe(true);

      const viaCustomer = await prisma.customer.findUnique({
        where: { id: customer.id },
        include: { userLinks: { include: { user: true } } },
      });
      expect(viaCustomer?.userLinks.some((l) => l.userId === user.id)).toBe(true);
    });

    it("throws BadRequestException when role is CUSTOMER and customerId is missing", async () => {
      const user = await makeUser({ email: `customer-${randomUUID().slice(0, 8)}@gmail.com` });

      await expect(
        service.assignMembership(realCompanyId, user.id, "CUSTOMER"),
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: "CUSTOMER_ID_REQUIRED" }),
      });

      const membership = await prisma.userMembership.findUnique({
        where: { userId_companyId: { userId: user.id, companyId: realCompanyId } },
      });
      expect(membership).toBeNull();
    });

    it("rejects an invalid/non-existent customerId and creates neither membership nor link", async () => {
      const user = await makeUser({ email: `customer-${randomUUID().slice(0, 8)}@gmail.com` });

      await expect(
        service.assignMembership(realCompanyId, user.id, "CUSTOMER", "non-existent-customer-id"),
      ).rejects.toMatchObject({
        status: 404,
        response: expect.objectContaining({ code: "CUSTOMER_NOT_FOUND" }),
      });

      const membership = await prisma.userMembership.findUnique({
        where: { userId_companyId: { userId: user.id, companyId: realCompanyId } },
      });
      expect(membership).toBeNull();
    });

    it("rejects a customerId belonging to a different company (tenant isolation)", async () => {
      const otherCompanyId = `Z${randomUUID().slice(0, 2).toUpperCase()}`;
      await prisma.company.create({ data: { id: otherCompanyId, name: "Other CUL", status: "ACTIVE" } });
      createdCompanyIds.push(otherCompanyId);
      const otherCustomer = await makeCustomer(otherCompanyId);

      const user = await makeUser({ email: `customer-${randomUUID().slice(0, 8)}@gmail.com` });

      await expect(
        service.assignMembership(realCompanyId, user.id, "CUSTOMER", otherCustomer.id),
      ).rejects.toMatchObject({
        status: 404,
        response: expect.objectContaining({ code: "CUSTOMER_NOT_FOUND" }),
      });
    });

    it("is idempotent when re-approving the same User/Customer pair after membership removal", async () => {
      const { user, customer } = await makeEligiblePair();

      await service.assignMembership(realCompanyId, user.id, "CUSTOMER", customer.id);
      createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

      await service.removeMembership(realCompanyId, user.id);

      await expect(
        service.assignMembership(realCompanyId, user.id, "CUSTOMER", customer.id),
      ).resolves.toMatchObject({ role: "CUSTOMER" });

      const links = await prisma.customerUserLink.findMany({
        where: { userId: user.id, customerId: customer.id },
      });
      expect(links).toHaveLength(1);
    });
  });

  describe("PIC Email eligibility (Customer.email) and one portal user per Customer", () => {
    it("isCustomerPortalEligible compares normalized emails and never matches a missing Customer.email", () => {
      expect(isCustomerPortalEligible("  Pic@Example.COM ", "pic@example.com")).toBe(true);
      expect(isCustomerPortalEligible("pic@example.com", "other@example.com")).toBe(false);
      expect(isCustomerPortalEligible("pic@example.com", null)).toBe(false);
      expect(isCustomerPortalEligible("pic@example.com", "  ")).toBe(false);
    });

    it("approves when the user's email matches Customer.email (case-insensitive)", async () => {
      const { user, customer } = await makeEligiblePair();
      await prisma.customer.update({ where: { id: customer.id }, data: { email: customer.email!.toUpperCase() } });

      await service.assignMembership(realCompanyId, user.id, "CUSTOMER", customer.id);
      createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

      expect(
        await prisma.customerUserLink.findUnique({
          where: { userId_customerId: { userId: user.id, customerId: customer.id } },
        }),
      ).not.toBeNull();
    });

    it("rejects a non-matching email and creates neither membership nor link", async () => {
      const user = await makeUser({ email: `other-${randomUUID().slice(0, 8)}@gmail.com` });
      const customer = await makeCustomer(realCompanyId, `pic-${randomUUID().slice(0, 8)}@gmail.com`);

      await expect(
        service.assignMembership(realCompanyId, user.id, "CUSTOMER", customer.id),
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: "CUSTOMER_EMAIL_MISMATCH" }),
      });

      expect(
        await prisma.userMembership.findUnique({
          where: { userId_companyId: { userId: user.id, companyId: realCompanyId } },
        }),
      ).toBeNull();
      expect(await prisma.customerUserLink.findFirst({ where: { userId: user.id } })).toBeNull();
    });

    it("rejects a Customer that has no Customer.email at all", async () => {
      const user = await makeUser({ email: `noemail-${randomUUID().slice(0, 8)}@gmail.com` });
      const customer = await makeCustomer(realCompanyId);

      await expect(
        service.assignMembership(realCompanyId, user.id, "CUSTOMER", customer.id),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "CUSTOMER_EMAIL_MISMATCH" }) });
    });

    it("does NOT treat a CustomerContact.email match as eligible", async () => {
      const email = `contact-${randomUUID().slice(0, 8)}@gmail.com`;
      const user = await makeUser({ email });
      const customer = await makeCustomer(realCompanyId, `pic-${randomUUID().slice(0, 8)}@gmail.com`);
      await prisma.customerContact.create({
        data: { companyId: realCompanyId, customerId: customer.id, name: "Contact", email, isPrimary: true },
      });

      await expect(
        service.assignMembership(realCompanyId, user.id, "CUSTOMER", customer.id),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "CUSTOMER_EMAIL_MISMATCH" }) });
      expect(await service.findEligibleCustomers(realCompanyId, user.id)).toEqual([]);
    });

    it("refuses a second portal user for a Customer that already has one, without side effects", async () => {
      const email = `pic-${randomUUID().slice(0, 8)}@gmail.com`;
      const customer = await makeCustomer(realCompanyId, email);
      const first = await makeUser({ email });
      await service.assignMembership(realCompanyId, first.id, "CUSTOMER", customer.id);
      createdMembershipKeys.push({ userId: first.id, companyId: realCompanyId });

      // A different account whose email normalizes to the same PIC Email
      // (User.email is unique only as an exact string).
      const second = await makeUser({ email: email.toUpperCase() });
      await expect(
        service.assignMembership(realCompanyId, second.id, "CUSTOMER", customer.id),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: "CUSTOMER_ALREADY_HAS_PORTAL_USER" }),
      });

      expect(
        await prisma.userMembership.findUnique({
          where: { userId_companyId: { userId: second.id, companyId: realCompanyId } },
        }),
      ).toBeNull();
      expect(await prisma.customerUserLink.count({ where: { customerId: customer.id } })).toBe(1);
    });

    it("the database itself rejects a second CustomerUserLink for the same Customer", async () => {
      const { user, customer } = await makeEligiblePair();
      const other = await makeUser();
      await prisma.customerUserLink.create({ data: { userId: user.id, customerId: customer.id } });
      await expect(
        prisma.customerUserLink.create({ data: { userId: other.id, customerId: customer.id } }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("lets the same PIC email belong to several Customers; staff choose which one to approve", async () => {
      const email = `shared-${randomUUID().slice(0, 8)}@gmail.com`;
      const a = await makeCustomer(realCompanyId, email);
      const b = await makeCustomer(realCompanyId, email);
      const user = await makeUser({ email });

      const eligible = await service.findEligibleCustomers(realCompanyId, user.id);
      expect(eligible.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
      expect(eligible.every((c) => c.hasPortalUser === false)).toBe(true);

      await service.assignMembership(realCompanyId, user.id, "CUSTOMER", b.id);
      createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

      const links = await prisma.customerUserLink.findMany({ where: { userId: user.id } });
      expect(links.map((l) => l.customerId)).toEqual([b.id]);
    });

    it("scopes eligible Customers to the company", async () => {
      const otherCompanyId = `Z${randomUUID().slice(0, 2).toUpperCase()}`;
      await prisma.company.create({ data: { id: otherCompanyId, name: "Other PIC", status: "ACTIVE" } });
      createdCompanyIds.push(otherCompanyId);
      const email = `pic-${randomUUID().slice(0, 8)}@gmail.com`;
      await makeCustomer(otherCompanyId, email);
      const user = await makeUser({ email });

      expect(await service.findEligibleCustomers(realCompanyId, user.id)).toEqual([]);
    });
  });

  describe("CustomerUserLink lifecycle", () => {
    it("removing the membership removes the link and frees the Customer for another user", async () => {
      const { user: first, customer } = await makeEligiblePair();
      await service.assignMembership(realCompanyId, first.id, "CUSTOMER", customer.id);

      await service.removeMembership(realCompanyId, first.id);
      expect(await prisma.customerUserLink.count({ where: { userId: first.id } })).toBe(0);

      const second = await makeUser({ email: `second-${randomUUID().slice(0, 8)}@gmail.com` });
      await prisma.customer.update({ where: { id: customer.id }, data: { email: second.email } });
      await service.assignMembership(realCompanyId, second.id, "CUSTOMER", customer.id);
      createdMembershipKeys.push({ userId: second.id, companyId: realCompanyId });
      expect(await prisma.customerUserLink.count({ where: { customerId: customer.id } })).toBe(1);
    });

    it("changing the role away from CUSTOMER removes the link", async () => {
      const { user, customer } = await makeEligiblePair();
      await service.assignMembership(realCompanyId, user.id, "CUSTOMER", customer.id);
      createdMembershipKeys.push({ userId: user.id, companyId: realCompanyId });

      await service.updateMembershipRole(realCompanyId, user.id, "CUSTOMER");
      expect(await prisma.customerUserLink.count({ where: { userId: user.id } })).toBe(1);

      await prisma.user.update({
        where: { id: user.id },
        data: { email: `staff-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id` },
      });
      await service.updateMembershipRole(realCompanyId, user.id, "FINANCE");
      expect(await prisma.customerUserLink.count({ where: { userId: user.id } })).toBe(0);
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

describe("UsersService.updateMembershipNotificationSettings", () => {
  it("updates receiveNotifications for an existing membership", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, "ADMIN");

    const updated = await service.updateMembershipNotificationSettings(
      realCompanyId,
      user.id,
      true,
    );
    expect(updated.receiveNotifications).toBe(true);

    const detail = await service.findOne(realCompanyId, user.id);
    expect(detail.membership?.receiveNotifications).toBe(true);
  });

  it("throws NotFoundException when membership does not exist", async () => {
    const user = await makeUser();

    await expect(
      service.updateMembershipNotificationSettings(realCompanyId, user.id, true),
    ).rejects.toBeInstanceOf(NotFoundException);
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

    await expect(service.removeMembership(realCompanyId, user.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("throws NotFoundException for non-existent membership", async () => {
    const user = await makeUser();

    await expect(service.removeMembership(realCompanyId, user.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
