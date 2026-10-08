import { randomUUID } from "node:crypto";
import { CallHandler, ExecutionContext } from "@nestjs/common";
import { prisma } from "@medcal/db";
import { defer, lastValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import { ActorContextInterceptor } from "./actor-context.interceptor";

const suffix = randomUUID().slice(0, 8);

function contextFor(request: Record<string, unknown>, type = "http"): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

async function makeUser(tag: string) {
  return prisma.user.create({ data: { email: `int-${tag}-${suffix}@test.local`, name: tag } });
}

async function makeUom(tag: string) {
  return prisma.uom.create({
    data: { code: `INT-${tag}-${suffix}`, name: tag, symbol: "x", category: "PRESSURE" },
  });
}

describe("ActorContextInterceptor", () => {
  const interceptor = new ActorContextInterceptor();

  it("binds request.userId so a handler's lazy Prisma update is stamped with that actor", async () => {
    const actor = await makeUser("a");
    const uom = await makeUom("u1");
    // defer() mirrors Nest: the handler's (lazy) promise is subscribed inside next.handle().
    const handler: CallHandler = {
      handle: () => defer(() => prisma.uom.update({ where: { id: uom.id }, data: { name: "x" } })),
    };
    const result = (await lastValueFrom(
      interceptor.intercept(contextFor({ userId: actor.id }), handler),
    )) as { updatedByUserId: string | null };
    expect(result.updatedByUserId).toBe(actor.id);
  });

  it("attributes concurrent requests to their own actors", async () => {
    const [a, b] = [await makeUser("ca"), await makeUser("cb")];
    const [u1, u2] = [await makeUom("c1"), await makeUom("c2")];
    const run = (userId: string, id: string, delay: number) =>
      lastValueFrom(
        interceptor.intercept(contextFor({ userId }), {
          handle: () =>
            defer(async () => {
              await new Promise((r) => setTimeout(r, delay));
              return prisma.uom.update({ where: { id }, data: { name: userId } });
            }),
        }),
      );
    await Promise.all([run(a.id, u1.id, 30), run(b.id, u2.id, 0)]);
    expect((await prisma.uom.findUniqueOrThrow({ where: { id: u1.id } })).updatedByUserId).toBe(a.id);
    expect((await prisma.uom.findUniqueOrThrow({ where: { id: u2.id } })).updatedByUserId).toBe(b.id);
  });

  it("runs without an actor for unauthenticated routes (no stamping)", async () => {
    const uom = await makeUom("anon");
    const handler: CallHandler = {
      handle: () => defer(() => prisma.uom.update({ where: { id: uom.id }, data: { name: "x" } })),
    };
    const result = (await lastValueFrom(interceptor.intercept(contextFor({}), handler))) as {
      updatedByUserId: string | null;
    };
    expect(result.updatedByUserId).toBeNull();
  });

  it("passes non-http contexts straight through", async () => {
    const handler: CallHandler = { handle: () => of("ok") };
    expect(await lastValueFrom(interceptor.intercept(contextFor({ userId: "u" }, "ws"), handler))).toBe("ok");
  });
});
