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

afterAll(async () => {
  for (const key of createdMembershipKeys) {
    await prisma.userMembership.deleteMany({ where: key }).catch(() => {});
  }
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
