import { describe, expect, it } from "vitest";
import {
  shouldObtainAndRegisterToken,
  shouldRequestPermission,
  shouldSkipBackendRegistration,
} from "./flow";

describe("FCM registration flow decisions", () => {
  it("does not request permission when already denied", () => {
    expect(shouldRequestPermission("denied")).toBe(false);
  });

  it("does not request permission when unsupported", () => {
    expect(shouldRequestPermission("unsupported")).toBe(false);
  });

  it("requests permission only from default state", () => {
    expect(shouldRequestPermission("default")).toBe(true);
    expect(shouldRequestPermission("granted")).toBe(false);
  });

  it("does not obtain/register token when unauthenticated", () => {
    expect(
      shouldObtainAndRegisterToken({ permission: "granted", authenticated: false }),
    ).toBe(false);
  });

  it("does not obtain/register token when permission denied", () => {
    expect(
      shouldObtainAndRegisterToken({ permission: "denied", authenticated: true }),
    ).toBe(false);
  });

  it("obtains/registers when authenticated and permission granted", () => {
    expect(
      shouldObtainAndRegisterToken({ permission: "granted", authenticated: true }),
    ).toBe(true);
  });

  it("skips backend registration for empty token", () => {
    expect(shouldSkipBackendRegistration({ token: null, lastRegisteredToken: null })).toBe(true);
  });

  it("skips backend registration when token already synced this session", () => {
    expect(
      shouldSkipBackendRegistration({ token: "abc", lastRegisteredToken: "abc" }),
    ).toBe(true);
  });

  it("does not skip backend registration for a new token", () => {
    expect(
      shouldSkipBackendRegistration({ token: "new", lastRegisteredToken: "old" }),
    ).toBe(false);
  });
});
