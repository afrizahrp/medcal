import { Prisma } from "@prisma/client";
import { getActorUserId } from "./actor-context";

type AnyRecord = Record<string, unknown>;

interface ModelMeta {
  audited: boolean;
  /** relation field name -> target model name */
  relations: Map<string, string>;
}

/**
 * Derived from the Prisma datamodel, so the set of audited models is exactly
 * "models that declare updatedByUserId" — adding the column to a model is all
 * it takes to opt in; nothing here needs a second list.
 */
const META = new Map<string, ModelMeta>(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    {
      audited: model.fields.some((f) => f.name === "updatedByUserId"),
      relations: new Map(
        model.fields.filter((f) => f.kind === "object").map((f) => [f.name, f.type]),
      ),
    },
  ]),
);

export function isUpdateAudited(model: string): boolean {
  return META.get(model)?.audited ?? false;
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `{ where, data }` envelope vs. a bare data object (to-one nested update). */
function isWhereDataEnvelope(value: AnyRecord): boolean {
  return isRecord(value.data) && Object.keys(value).every((k) => k === "where" || k === "data");
}

function stampData(model: string, data: unknown, actorId: string): void {
  const meta = META.get(model);
  if (!meta || !isRecord(data)) return;

  if (meta.audited && !("updatedByUserId" in data) && !("updatedBy" in data)) {
    // Prisma rejects mixing scalar FKs with relation fields in one data object
    // (checked vs unchecked input), so use the relation form whenever the
    // caller already uses relation fields.
    const usesRelationInput = [...meta.relations.keys()].some((rel) => rel in data);
    if (usesRelationInput) data.updatedBy = { connect: { id: actorId } };
    else data.updatedByUserId = actorId;
  }

  // Nested update / updateMany / upsert on related audited models.
  for (const [relName, target] of meta.relations) {
    const nested = data[relName];
    if (!isRecord(nested)) continue;
    for (const op of ["update", "updateMany", "upsert"] as const) {
      const payload = nested[op];
      for (const entry of Array.isArray(payload) ? payload : payload === undefined ? [] : [payload]) {
        if (!isRecord(entry)) continue;
        if (op === "upsert") stampData(target, entry.update, actorId);
        else stampData(target, isWhereDataEnvelope(entry) ? entry.data : entry, actorId);
      }
    }
  }
}

interface QueryParams {
  model: string;
  args: AnyRecord;
  query: (args: never) => Promise<unknown>;
}

function stampingHandler(kind: "data" | "upsert") {
  return ({ model, args, query }: QueryParams) => {
    const actorId = getActorUserId();
    // Non-audited parents still need a pass: they may carry nested writes to audited children.
    if (actorId && META.has(model)) {
      stampData(model, kind === "upsert" ? args.update : args.data, actorId);
    }
    return query(args as never);
  };
}

/**
 * Single mechanism for `updatedByUserId`: stamps the authenticated actor (see
 * actor-context.ts) on update / updateMany / updateManyAndReturn / upsert(update
 * branch) and on nested update / updateMany / upsert writes. `updatedAt` is NOT
 * handled here — Prisma's own @updatedAt already covers every one of those
 * paths. Creates, reads and deletes are never touched. An explicit
 * `updatedByUserId` / `updatedBy` in the caller's data always wins.
 */
export const updatedByExtension = Prisma.defineExtension({
  name: "updated-by-audit",
  query: {
    $allModels: {
      update: stampingHandler("data") as never,
      updateMany: stampingHandler("data") as never,
      updateManyAndReturn: stampingHandler("data") as never,
      upsert: stampingHandler("upsert") as never,
    },
  },
});
