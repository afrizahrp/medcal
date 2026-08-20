import path from "node:path";

// access-control.test.ts hits the real Postgres configured for local dev,
// same DATABASE_URL apps/api's dev script uses — consistent with this
// project's existing no-mocking testing convention.
process.loadEnvFile(path.resolve(__dirname, "../../.env"));
