import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./vitest.globalSetup.ts"],
    // Interim: the API service tests share one test database with no per-test
    // transaction isolation. Serialising test files keeps counter/FK state
    // deterministic (and makes exact-sequence assertions reliable) until
    // per-test isolation lands.
    fileParallelism: false,
  },
});
