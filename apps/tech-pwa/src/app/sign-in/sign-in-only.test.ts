import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tech-pwa is sign-in only (product decision): technician accounts are created
 * in the Management Portal, and the technician.* origin is deliberately not a
 * registration origin. Structural guards, since component rendering is not
 * available in this package's node test environment.
 */
const appRoot = path.resolve(__dirname, "../../..");
const read = (relative: string) => fs.readFileSync(path.join(appRoot, relative), "utf8");

describe("tech-pwa sign-in only", () => {
  it("keeps the sign-in page and its credentials form", () => {
    expect(fs.existsSync(path.join(appRoot, "src/app/sign-in/page.tsx"))).toBe(true);
    expect(read("src/app/sign-in/page.tsx")).toContain("signIn.email");
  });

  it("sign-in page offers no registration link or sign-up CTA", () => {
    const page = read("src/app/sign-in/page.tsx");
    expect(page).not.toContain("/sign-in/register");
    expect(page).not.toMatch(/sign up/i);
    expect(page).not.toContain("signUp");
  });

  it("has no registration page and no sign-up call anywhere under src", () => {
    expect(fs.existsSync(path.join(appRoot, "src/app/sign-in/register"))).toBe(false);

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && entry.name !== "sign-in-only.test.ts") {
          if (/signUp\b|signUpEmail/.test(fs.readFileSync(full, "utf8"))) offenders.push(full);
        }
      }
    };
    walk(path.join(appRoot, "src"));
    expect(offenders).toEqual([]);
  });

  it("redirects the obsolete registration route to sign-in", () => {
    // Read as text: requiring next.config.js would load the monorepo .env.
    const config = read("next.config.js");
    expect(config).toMatch(/source:\s*"\/sign-in\/register"/);
    expect(config).toMatch(/destination:\s*"\/sign-in"/);
  });
});
