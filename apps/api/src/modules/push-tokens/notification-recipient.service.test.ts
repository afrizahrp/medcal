import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { NotificationRecipientService } from "./notification-recipient.service";

const service = new NotificationRecipientService();
const realCompanyId = "PKM";
const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdMembershipKeys: Array<{ userId: string; companyId: string }> = [];

async function makeUser(overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: {
      email: `notif-elig-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
      name: "Notif Eligibility Test",
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
  options: { role?: "ADMIN" | "SUPERVISOR"; receiveNotifications?: boolean } = {},
) {
  const membership = await prisma.userMembership.create({
    data: {
      userId,
      companyId,
      role: options.role ?? "ADMIN",
      isDefault: false,
      receiveNotifications: options.receiveNotifications ?? false,
    },
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

describe("NotificationRecipientService.resolveEligibleUserIds", () => {
  it("A — includes user when receiveNotifications=true and ACTIVE", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, { receiveNotifications: true });

    const eligible = await service.resolveEligibleUserIds(realCompanyId, [user.id]);
    expect(eligible).toEqual([user.id]);
  });

  it("B — excludes user when receiveNotifications=false", async () => {
    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, { receiveNotifications: false });

    const eligible = await service.resolveEligibleUserIds(realCompanyId, [user.id]);
    expect(eligible).toEqual([]);
  });

  it("C — same role, only enabled user is eligible", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await makeMembership(userA.id, realCompanyId, { role: "SUPERVISOR", receiveNotifications: true });
    await makeMembership(userB.id, realCompanyId, { role: "SUPERVISOR", receiveNotifications: false });

    const eligible = await service.resolveEligibleUserIds(realCompanyId, [userA.id, userB.id]);
    expect(eligible).toEqual([userA.id]);
  });

  it("D — permission/role does not affect eligibility (only receiveNotifications)", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await makeMembership(userA.id, realCompanyId, { role: "ADMIN", receiveNotifications: true });
    await makeMembership(userB.id, realCompanyId, { role: "ADMIN", receiveNotifications: false });

    const eligible = await service.resolveEligibleUserIds(realCompanyId, [userA.id, userB.id]);
    expect(eligible).toEqual([userA.id]);
  });

  it("F — company isolation: eligibility is per UserMembership row", async () => {
    const otherCompanyId = `N${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other Co", status: "ACTIVE" } });
    createdCompanyIds.push(otherCompanyId);

    const user = await makeUser();
    await makeMembership(user.id, realCompanyId, { receiveNotifications: true });
    await makeMembership(user.id, otherCompanyId, { receiveNotifications: false });

    const eligibleReal = await service.resolveEligibleUserIds(realCompanyId, [user.id]);
    const eligibleOther = await service.resolveEligibleUserIds(otherCompanyId, [user.id]);

    expect(eligibleReal).toEqual([user.id]);
    expect(eligibleOther).toEqual([]);
  });

  it("excludes DISABLED users even when receiveNotifications=true", async () => {
    const user = await makeUser({ status: "DISABLED" });
    await makeMembership(user.id, realCompanyId, { receiveNotifications: true });

    const eligible = await service.resolveEligibleUserIds(realCompanyId, [user.id]);
    expect(eligible).toEqual([]);
  });
});
