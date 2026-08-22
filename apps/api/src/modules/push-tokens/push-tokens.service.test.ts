import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { PushTokensService } from "./push-tokens.service";

/**
 * PushTokensService tests — ownership and security boundary verification.
 *
 * Uses real Postgres (same DATABASE_URL as dev), consistent with
 * existing test patterns in the repository.
 */

const service = new PushTokensService();
const realCompanyId = "PKM";
const shortId = randomUUID().slice(0, 8);

// Track created resources for cleanup
const createdUserIds: string[] = [];
const createdTokenIds: string[] = [];

async function makeUser(overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: {
      email: `push-test-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
      name: "Push Test User",
      status: "ACTIVE",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeMembership(userId: string, companyId: string = realCompanyId) {
  const membership = await prisma.userMembership.create({
    data: { userId, companyId, role: "TECHNICIAN", isDefault: false },
  });
  return membership;
}

function generateFCMToken(): string {
  return `fcm_test_token_${randomUUID()}`;
}

afterAll(async () => {
  // Clean up tokens first (FK constraint)
  await prisma.fCMToken.deleteMany({ where: { id: { in: createdTokenIds } } });
  // Clean up memberships
  await prisma.userMembership.deleteMany({ where: { userId: { in: createdUserIds } } });
  // Clean up users
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("PushTokensService.registerToken", () => {
  it("creates a new token for an authenticated user", async () => {
    const user = await makeUser();
    await makeMembership(user.id);
    const fcmToken = generateFCMToken();

    const result = await service.registerToken(realCompanyId, user.id, {
      token: fcmToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });

    expect(result.created).toBe(true);
    expect(result.reactivated).toBe(false);
    expect(result.id).toBeDefined();
    createdTokenIds.push(result.id);

    // Verify in database
    const dbToken = await prisma.fCMToken.findUnique({ where: { id: result.id } });
    expect(dbToken).not.toBeNull();
    expect(dbToken!.userId).toBe(user.id);
    expect(dbToken!.companyId).toBe(realCompanyId);
    expect(dbToken!.token).toBe(fcmToken);
    expect(dbToken!.isActive).toBe(true);
    expect(dbToken!.app).toBe("PORTAL");
    expect(dbToken!.deviceType).toBe("chrome/windows");

    const membership = await prisma.userMembership.findFirst({
      where: { userId: user.id, companyId: realCompanyId },
    });
    expect(membership?.receiveNotifications).toBe(true);
  });

  it("userId in database comes from server-side, not client input", async () => {
    const user = await makeUser();
    await makeMembership(user.id);
    const fcmToken = generateFCMToken();

    const result = await service.registerToken(realCompanyId, user.id, {
      token: fcmToken,
      deviceType: "firefox/linux",
      app: "TECH_PWA",
    });
    createdTokenIds.push(result.id);

    const dbToken = await prisma.fCMToken.findUnique({ where: { id: result.id } });
    expect(dbToken!.userId).toBe(user.id);
  });

  it("companyId in database comes from server-side, not client input", async () => {
    const user = await makeUser();
    await makeMembership(user.id);
    const fcmToken = generateFCMToken();

    const result = await service.registerToken(realCompanyId, user.id, {
      token: fcmToken,
      deviceType: "safari/macos",
      app: "WEB",
    });
    createdTokenIds.push(result.id);

    const dbToken = await prisma.fCMToken.findUnique({ where: { id: result.id } });
    expect(dbToken!.companyId).toBe(realCompanyId);
  });

  it("does not create duplicate when same user registers same token", async () => {
    const user = await makeUser();
    await makeMembership(user.id);
    const fcmToken = generateFCMToken();

    // First registration
    const first = await service.registerToken(realCompanyId, user.id, {
      token: fcmToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    createdTokenIds.push(first.id);
    expect(first.created).toBe(true);

    // Second registration with same token
    const second = await service.registerToken(realCompanyId, user.id, {
      token: fcmToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    expect(second.id).toBe(first.id);
    expect(second.created).toBe(false);
    expect(second.reactivated).toBe(false);

    // Verify only one record exists
    const count = await prisma.fCMToken.count({ where: { token: fcmToken } });
    expect(count).toBe(1);
  });

  it("reactivates an inactive token when same user registers again", async () => {
    const user = await makeUser();
    await makeMembership(user.id);
    const fcmToken = generateFCMToken();

    // Register token
    const first = await service.registerToken(realCompanyId, user.id, {
      token: fcmToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    createdTokenIds.push(first.id);

    // Deactivate it
    await service.revokeToken(user.id, first.id);
    const deactivated = await prisma.fCMToken.findUnique({ where: { id: first.id } });
    expect(deactivated!.isActive).toBe(false);

    // Re-register the same token
    const second = await service.registerToken(realCompanyId, user.id, {
      token: fcmToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    expect(second.id).toBe(first.id);
    expect(second.created).toBe(false);
    expect(second.reactivated).toBe(true);

    // Verify it's active again
    const reactivated = await prisma.fCMToken.findUnique({ where: { id: first.id } });
    expect(reactivated!.isActive).toBe(true);
  });

  it("rejects registration when token belongs to another user (CRITICAL SECURITY)", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await makeMembership(userA.id);
    await makeMembership(userB.id);
    const sharedToken = generateFCMToken();

    // User A registers the token first
    const first = await service.registerToken(realCompanyId, userA.id, {
      token: sharedToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    createdTokenIds.push(first.id);

    // User B tries to register the same token — MUST FAIL
    await expect(
      service.registerToken(realCompanyId, userB.id, {
        token: sharedToken,
        deviceType: "firefox/linux",
        app: "PORTAL",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Verify token still belongs to User A
    const dbToken = await prisma.fCMToken.findUnique({ where: { token: sharedToken } });
    expect(dbToken!.userId).toBe(userA.id);
  });

  it("does NOT silently reassign token from User A to User B (CRITICAL SECURITY)", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await makeMembership(userA.id);
    await makeMembership(userB.id);
    const sharedToken = generateFCMToken();

    // User A registers the token
    const first = await service.registerToken(realCompanyId, userA.id, {
      token: sharedToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    createdTokenIds.push(first.id);

    // Capture User A's token state before attempted hijack
    const beforeHijack = await prisma.fCMToken.findUnique({ where: { token: sharedToken } });

    // User B tries to hijack — should fail
    await expect(
      service.registerToken(realCompanyId, userB.id, {
        token: sharedToken,
        deviceType: "firefox/linux",
        app: "PORTAL",
      }),
    ).rejects.toThrow();

    // Verify token ownership did NOT change
    const afterHijack = await prisma.fCMToken.findUnique({ where: { token: sharedToken } });
    expect(afterHijack!.userId).toBe(beforeHijack!.userId);
    expect(afterHijack!.userId).toBe(userA.id);
  });

  it("supports multiple devices/browsers for the same user", async () => {
    const user = await makeUser();
    await makeMembership(user.id);

    const token1 = generateFCMToken();
    const token2 = generateFCMToken();
    const token3 = generateFCMToken();

    // Register multiple tokens for the same user
    const r1 = await service.registerToken(realCompanyId, user.id, {
      token: token1,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    const r2 = await service.registerToken(realCompanyId, user.id, {
      token: token2,
      deviceType: "firefox/linux",
      app: "PORTAL",
    });
    const r3 = await service.registerToken(realCompanyId, user.id, {
      token: token3,
      deviceType: "safari/ios",
      app: "TECH_PWA",
    });

    createdTokenIds.push(r1.id, r2.id, r3.id);

    expect(r1.created).toBe(true);
    expect(r2.created).toBe(true);
    expect(r3.created).toBe(true);

    // Verify all exist
    const tokens = await service.listUserTokens(realCompanyId, user.id);
    expect(tokens.length).toBe(3);
  });
});

describe("PushTokensService.revokeToken", () => {
  it("allows user to revoke their own token", async () => {
    const user = await makeUser();
    await makeMembership(user.id);
    const fcmToken = generateFCMToken();

    const registered = await service.registerToken(realCompanyId, user.id, {
      token: fcmToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    createdTokenIds.push(registered.id);

    // Revoke should succeed
    await service.revokeToken(user.id, registered.id);

    // Verify it's deactivated
    const dbToken = await prisma.fCMToken.findUnique({ where: { id: registered.id } });
    expect(dbToken!.isActive).toBe(false);
  });

  it("rejects when user tries to revoke another user's token (CRITICAL SECURITY)", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await makeMembership(userA.id);
    await makeMembership(userB.id);
    const fcmToken = generateFCMToken();

    // User A registers a token
    const registered = await service.registerToken(realCompanyId, userA.id, {
      token: fcmToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    createdTokenIds.push(registered.id);

    // User B tries to revoke User A's token — MUST FAIL
    await expect(service.revokeToken(userB.id, registered.id)).rejects.toBeInstanceOf(NotFoundException);

    // Verify token is still active
    const dbToken = await prisma.fCMToken.findUnique({ where: { id: registered.id } });
    expect(dbToken!.isActive).toBe(true);
  });

  it("returns 404 for non-existent token", async () => {
    const user = await makeUser();
    await makeMembership(user.id);

    await expect(
      service.revokeToken(user.id, "non-existent-token-id"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("does not leak information about other users' tokens", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await makeMembership(userA.id);
    await makeMembership(userB.id);
    const fcmToken = generateFCMToken();

    // User A registers a token
    const registered = await service.registerToken(realCompanyId, userA.id, {
      token: fcmToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    createdTokenIds.push(registered.id);

    // User B tries to revoke — should get same "not found" error as nonexistent token
    // (This prevents user enumeration attacks)
    await expect(service.revokeToken(userB.id, registered.id)).rejects.toMatchObject({
      response: { code: "TOKEN_NOT_FOUND" },
    });
  });
});

describe("PushTokensService.listUserTokens", () => {
  it("returns only the user's active tokens in the company", async () => {
    const user = await makeUser();
    await makeMembership(user.id);
    const token1 = generateFCMToken();
    const token2 = generateFCMToken();

    const r1 = await service.registerToken(realCompanyId, user.id, {
      token: token1,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    const r2 = await service.registerToken(realCompanyId, user.id, {
      token: token2,
      deviceType: "firefox/linux",
      app: "PORTAL",
    });
    createdTokenIds.push(r1.id, r2.id);

    // Deactivate one
    await service.revokeToken(user.id, r1.id);

    // Should only return the active one
    const tokens = await service.listUserTokens(realCompanyId, user.id);
    expect(tokens.length).toBe(1);
    expect(tokens[0].id).toBe(r2.id);
  });

  it("does not return another user's tokens", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await makeMembership(userA.id);
    await makeMembership(userB.id);
    const tokenA = generateFCMToken();
    const tokenB = generateFCMToken();

    const rA = await service.registerToken(realCompanyId, userA.id, {
      token: tokenA,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    const rB = await service.registerToken(realCompanyId, userB.id, {
      token: tokenB,
      deviceType: "firefox/linux",
      app: "PORTAL",
    });
    createdTokenIds.push(rA.id, rB.id);

    // User A should only see their own token
    const tokensA = await service.listUserTokens(realCompanyId, userA.id);
    expect(tokensA.length).toBe(1);
    expect(tokensA[0].userId).toBe(userA.id);
    expect(tokensA.some((t) => t.userId === userB.id)).toBe(false);
  });
});

describe("PushTokensService.getActiveTokensForUserIds", () => {
  it("returns active tokens for the requested users only", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await makeMembership(userA.id);
    await makeMembership(userB.id);
    const tokenA = generateFCMToken();
    const tokenB = generateFCMToken();

    const rA = await service.registerToken(realCompanyId, userA.id, {
      token: tokenA,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    const rB = await service.registerToken(realCompanyId, userB.id, {
      token: tokenB,
      deviceType: "firefox/linux",
      app: "PORTAL",
    });
    createdTokenIds.push(rA.id, rB.id);

    const tokens = await service.getActiveTokensForUserIds(realCompanyId, [userA.id]);
    expect(tokens.length).toBe(1);
    expect(tokens[0].userId).toBe(userA.id);
  });

  it("returns an empty array when no user ids are provided", async () => {
    const tokens = await service.getActiveTokensForUserIds(realCompanyId, []);
    expect(tokens).toEqual([]);
  });
});

describe("PushTokensService.deactivateByToken", () => {
  it("deactivates a token by its FCM token string", async () => {
    const user = await makeUser();
    await makeMembership(user.id);
    const fcmToken = generateFCMToken();

    const registered = await service.registerToken(realCompanyId, user.id, {
      token: fcmToken,
      deviceType: "chrome/windows",
      app: "PORTAL",
    });
    createdTokenIds.push(registered.id);

    // Deactivate by token string
    const deactivated = await service.deactivateByToken(fcmToken);
    expect(deactivated).toBe(true);

    // Verify it's inactive
    const dbToken = await prisma.fCMToken.findUnique({ where: { id: registered.id } });
    expect(dbToken!.isActive).toBe(false);
  });

  it("returns false for non-existent token", async () => {
    const result = await service.deactivateByToken("non-existent-fcm-token-string");
    expect(result).toBe(false);
  });
});
