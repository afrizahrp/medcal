const path = require("node:path");
// Next.js only auto-loads .env files from its own app directory, not the
// monorepo root — load the shared root .env explicitly for dev. Production
// sets real env vars directly (docker-compose/.env.production), so this is a
// no-op there if the file isn't present.
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@medcal/ui", "@medcal/shared", "@medcal/auth"],
};
module.exports = nextConfig;
