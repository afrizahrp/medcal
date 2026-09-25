import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@medcal/db";
import { MeController } from "./me.controller";

// Only the Better Auth session boundary is mocked (no way to mint a real
// session cookie in a unit test); hasPermission stays real, backed by the
// RolePermission cache primed in vitest.setup.ts — consistent with this
// project's "mock as little as possible" testing convention.
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@medcal/auth", async () => {
  const actual = await vi.importActual<typeof import("@medcal/auth")>("@medcal/auth");
  return {
    ...actual,
    auth: { api: { getSession: getSessionMock } },
  };
});

const companyId = "PKM";
const createdUserIds: string[] = [];
const createdMembershipKeys: Array<{ userId: string; companyId: string }> = [];
const createdCustomerIds: string[] = [];

async function makeUser(status: "INVITED" | "ACTIVE" | "DISABLED") {
  const user = await prisma.user.create({
    data: {
      email: `me-test-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
      name: "Me Controller Test",
      status,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeMembership(userId: string) {
  await prisma.userMembership.create({
    data: { userId, companyId, role: "ADMIN", isDefault: false },
  });
  createdMembershipKeys.push({ userId, companyId });
}

async function makeCustomer() {
  const customer = await prisma.customer.create({
    data: {
      companyId,
      number: `ME-${randomUUID().slice(0, 8)}`,
      name: `Me Controller Test Customer ${randomUUID().slice(0, 8)}`,
      status: "ACTIVE",
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

afterAll(async () => {
  for (const key of createdMembershipKeys) {
    await prisma.userMembership.deleteMany({ where: key }).catch(() => {});
  }
  await prisma.customerUserLink.deleteMany({ where: { customerId: { in: createdCustomerIds } } }).catch(() => {});
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

const controller = new MeController();
const originalCompanyId = process.env.COMPANY_ID;

function request() {
  return { headers: {} } as unknown as Parameters<MeController["getMe"]>[0];
}

describe("MeController.getMe — account lifecycle codes", () => {
  process.env.COMPANY_ID = companyId;

  afterAll(() => {
    process.env.COMPANY_ID = originalCompanyId;
  });

  it("returns ACCOUNT_PENDING when the user has no membership", async () => {
    const user = await makeUser("INVITED");
    getSessionMock.mockResolvedValueOnce({ user: { id: user.id, email: user.email } });

    await expect(controller.getMe(request())).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: "ACCOUNT_PENDING" }),
    });
  });

  it("returns ACCOUNT_PENDING when membership exists but status is INVITED", async () => {
    const user = await makeUser("INVITED");
    await makeMembership(user.id);
    getSessionMock.mockResolvedValueOnce({ user: { id: user.id, email: user.email } });

    await expect(controller.getMe(request())).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: "ACCOUNT_PENDING" }),
    });
  });

  it("returns ACCOUNT_DISABLED when the user status is DISABLED", async () => {
    const user = await makeUser("DISABLED");
    await makeMembership(user.id);
    getSessionMock.mockResolvedValueOnce({ user: { id: user.id, email: user.email } });

    await expect(controller.getMe(request())).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: "ACCOUNT_DISABLED" }),
    });
  });

  it("returns the profile payload when ACTIVE with membership", async () => {
    const user = await makeUser("ACTIVE");
    await makeMembership(user.id);
    getSessionMock.mockResolvedValueOnce({ user: { id: user.id, email: user.email } });

    const result = await controller.getMe(request());
    expect(result.membership.role).toBe("ADMIN");
    expect(result.membership.companyId).toBe(companyId);
  });

  it("still throws a plain 403 (no code) when there is no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    await expect(controller.getMe(request())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("MeController.getCustomerLink", () => {
  process.env.COMPANY_ID = companyId;

  afterAll(() => {
    process.env.COMPANY_ID = originalCompanyId;
  });

  it("returns customerId: null when the session's user has no CustomerUserLink", async () => {
    const user = await makeUser("INVITED");
    getSessionMock.mockResolvedValueOnce({ user: { id: user.id, email: user.email } });

    const result = await controller.getCustomerLink(request());
    expect(result).toEqual({ customerId: null });
  });

  it("returns the linked customerId once a CustomerUserLink exists, without requiring ACTIVE membership", async () => {
    const user = await makeUser("INVITED");
    const customer = await makeCustomer();
    await prisma.customerUserLink.create({ data: { userId: user.id, customerId: customer.id } });
    getSessionMock.mockResolvedValueOnce({ user: { id: user.id, email: user.email } });

    const result = await controller.getCustomerLink(request());
    expect(result).toEqual({ customerId: customer.id });
  });

  it("does not use a CUSTOMER-role membership alone as proof of a link", async () => {
    const user = await makeUser("ACTIVE");
    await prisma.userMembership.create({
      data: { userId: user.id, companyId, role: "CUSTOMER", isDefault: false },
    });
    createdMembershipKeys.push({ userId: user.id, companyId });
    getSessionMock.mockResolvedValueOnce({ user: { id: user.id, email: user.email } });

    const result = await controller.getCustomerLink(request());
    expect(result).toEqual({ customerId: null });
  });

  it("throws a plain 403 when there is no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    await expect(controller.getCustomerLink(request())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
