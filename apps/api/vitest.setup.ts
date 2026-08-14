import path from "node:path";

// Integration tests (registration-gate.integration.test.ts) hit the real
// Postgres configured for local dev, same DATABASE_URL apps/api's dev script uses.
process.loadEnvFile(path.resolve(__dirname, "../../.env"));
