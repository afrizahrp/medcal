/** Shared ESLint baseline — refine per app later */
module.exports = {
  root: true,
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  env: { es2022: true, node: true },
  ignorePatterns: ["dist", ".next", "node_modules"],
};
