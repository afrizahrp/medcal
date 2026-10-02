const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { customerPortalApiRewrites } = require("./customer-portal-api-rewrites");

const rootEnvPath = path.resolve(__dirname, "../../.env");
const rootEnv = fs.existsSync(rootEnvPath)
  ? dotenv.parse(fs.readFileSync(rootEnvPath))
  : {};
dotenv.config({ path: rootEnvPath });

const apiOrigin = (rootEnv.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(
  /\/$/,
  "",
);
const sameOriginBrowserApi = process.env.NODE_ENV !== "production";

if (sameOriginBrowserApi) {
  process.env.NEXT_PUBLIC_API_URL = "";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@medcal/ui", "@medcal/shared", "@medcal/auth"],
  async rewrites() {
    return sameOriginBrowserApi ? customerPortalApiRewrites(apiOrigin) : [];
  },
};
module.exports = nextConfig;
