// Side-effect entry point: `import "@medcal/db/.../register"` (or the relative
// path) as the FIRST import of a Vitest setup file. ESM evaluates imported
// modules in source order, so this redirects DATABASE_URL at the test database
// before any later import can construct the Prisma client.
import { useTestDatabase } from "./use-test-database";

useTestDatabase();
