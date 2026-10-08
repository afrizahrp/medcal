import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped actor used by the updated-by Prisma extension.
 *
 * `userId === null` means "no authenticated actor" (system / background /
 * public-endpoint mutation): the extension then leaves `updatedByUserId`
 * untouched, i.e. NULL on rows it has never stamped. That is the project's
 * system-actor convention — there is no sentinel "system" User row.
 */
interface ActorStore {
  userId: string | null;
}

const storage = new AsyncLocalStorage<ActorStore>();

/** Runs `fn` (and every async continuation of it, incl. $transaction callbacks) as `userId`. */
export function runWithActor<T>(userId: string | null | undefined, fn: () => T): T {
  return storage.run({ userId: userId ?? null }, fn);
}

export function getActorUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}
