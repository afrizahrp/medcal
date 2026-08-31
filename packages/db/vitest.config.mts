import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./vitest.globalSetup.ts"],
    // Interim: these suites share one test database with no per-test
    // transaction isolation. Serialising files keeps counter/FK state
    // deterministic until per-test isolation lands.
    fileParallelism: false,
  },
});
