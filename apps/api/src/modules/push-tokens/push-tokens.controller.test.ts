import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PushTokensController } from "./push-tokens.controller";
import type { PushTokensService } from "./push-tokens.service";

const PORTAL_ORIGIN = "https://apps.kalibrasimedika.co.id";
const TECH_ORIGIN = "https://technician.kalibrasimedika.co.id";

function makeController() {
  const registerToken = vi.fn().mockResolvedValue({ id: "row-1", created: true, reactivated: false });
  const controller = new PushTokensController({ registerToken } as unknown as PushTokensService);
  return { controller, registerToken };
}

const body = (app: string) => ({ token: "fcm-token", deviceType: "chrome/windows", app });

describe("PushTokensController.register — server-derived application identity", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.TRUSTED_ORIGINS = `${PORTAL_ORIGIN},${TECH_ORIGIN}`;
    process.env.PORTAL_ORIGINS = PORTAL_ORIGIN;
    process.env.TECH_PWA_ORIGINS = TECH_ORIGIN;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("registers a portal-origin request as PORTAL", async () => {
    const { controller, registerToken } = makeController();
    await controller.register("PKM", "user-1", body("PORTAL"), PORTAL_ORIGIN);
    expect(registerToken).toHaveBeenCalledWith("PKM", "user-1", expect.objectContaining({ app: "PORTAL" }));
  });

  it("registers a technician-origin request as TECH_PWA", async () => {
    const { controller, registerToken } = makeController();
    await controller.register("PKM", "user-1", body("TECH_PWA"), TECH_ORIGIN);
    expect(registerToken).toHaveBeenCalledWith("PKM", "user-1", expect.objectContaining({ app: "TECH_PWA" }));
  });

  it("rejects a tech-pwa origin claiming PORTAL (cannot opt a technician device into portal events)", async () => {
    const { controller, registerToken } = makeController();
    await expect(
      controller.register("PKM", "user-1", body("PORTAL"), TECH_ORIGIN),
    ).rejects.toMatchObject({ response: { code: "PUSH_APP_MISMATCH" } });
    expect(registerToken).not.toHaveBeenCalled();
  });

  it("rejects a portal origin claiming TECH_PWA", async () => {
    const { controller, registerToken } = makeController();
    await expect(
      controller.register("PKM", "user-1", body("TECH_PWA"), PORTAL_ORIGIN),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(registerToken).not.toHaveBeenCalled();
  });

  it("rejects a trusted origin that belongs to neither app", async () => {
    process.env.TRUSTED_ORIGINS = `${PORTAL_ORIGIN},${TECH_ORIGIN},https://customer.kalibrasimedika.co.id`;
    const { controller, registerToken } = makeController();
    await expect(
      controller.register("PKM", "user-1", body("PORTAL"), "https://customer.kalibrasimedika.co.id"),
    ).rejects.toMatchObject({ response: { code: "PUSH_APP_ORIGIN_UNRECOGNIZED" } });
    expect(registerToken).not.toHaveBeenCalled();
  });

  it("rejects the WEB value, which no deployed client may declare", async () => {
    const { controller, registerToken } = makeController();
    await expect(controller.register("PKM", "user-1", body("WEB"), PORTAL_ORIGIN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(registerToken).not.toHaveBeenCalled();
  });

  it("rejects a request without an Origin header", async () => {
    const { controller, registerToken } = makeController();
    await expect(controller.register("PKM", "user-1", body("PORTAL"), undefined)).rejects.toMatchObject({
      response: { code: "PUSH_APP_ORIGIN_UNRECOGNIZED" },
    });
    expect(registerToken).not.toHaveBeenCalled();
  });

  it("rejects an untrusted origin", async () => {
    const { controller } = makeController();
    await expect(
      controller.register("PKM", "user-1", body("PORTAL"), "https://evil.example.com"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("fails closed for tech-pwa when TECH_PWA_ORIGINS is unconfigured (never labelled PORTAL)", async () => {
    delete process.env.TECH_PWA_ORIGINS;
    const { controller, registerToken } = makeController();
    await expect(
      controller.register("PKM", "user-1", body("TECH_PWA"), TECH_ORIGIN),
    ).rejects.toMatchObject({ response: { code: "PUSH_APP_ORIGIN_UNRECOGNIZED" } });
    await expect(
      controller.register("PKM", "user-1", body("PORTAL"), TECH_ORIGIN),
    ).rejects.toMatchObject({ response: { code: "PUSH_APP_ORIGIN_UNRECOGNIZED" } });
    expect(registerToken).not.toHaveBeenCalled();
  });

  it("still takes userId/companyId from the session, never from the body", async () => {
    const { controller, registerToken } = makeController();
    await controller.register(
      "PKM",
      "session-user",
      { ...body("PORTAL"), userId: "attacker", companyId: "OTHER" },
      PORTAL_ORIGIN,
    );
    const [companyId, userId, input] = registerToken.mock.calls[0];
    expect(companyId).toBe("PKM");
    expect(userId).toBe("session-user");
    expect(input).not.toHaveProperty("userId");
    expect(input).not.toHaveProperty("companyId");
  });
});
