import { PrismaClient } from "@prisma/client";
import { updatedByExtension } from "./audit/updated-by-extension";

function createPrismaClient(): PrismaClient {
  // The extension is query-only (it rewrites update args, adds no models,
  // fields or methods), so the extended client is deliberately typed as plain
  // PrismaClient: Prisma's extended-client type is not assignable to
  // PrismaClient / Prisma.TransactionClient, which every service helper uses.
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  }).$extends(updatedByExtension) as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export * from "./audit";
export * from "./document-number";
export * from "./master-code";
export * from "./revision";
export default prisma;
