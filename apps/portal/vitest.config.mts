import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Portal tests are pure-logic and server-rendered-markup tests (no jsdom/browser
// runner): `@/` mirrors the tsconfig path alias and JSX uses the automatic runtime
// so components can be rendered with react-dom/server.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
