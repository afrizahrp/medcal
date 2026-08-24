import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for the 2A/2C registration-origin design: every call site
 * that creates a Better Auth user via email/password sign-up must supply (or
 * rely on) an Origin signal, or it silently hits registration-origin.hook.ts's
 * fail-closed REGISTRATION_ORIGIN_NOT_ALLOWED — see registration-gate.ts's
 * getRegistrationRejectionReasonForContext and registration-origin.hook.ts.
 *
 * A plain grep/manual review catches today's call sites but not one someone
 * adds six months from now without the header. This scans the actual source
 * tree structurally on every test run, so a new violating call site fails CI
 * the same day it's added, not the next time someone remembers to check.
 *
 * Heuristic, deliberately: this greps for the call and checks whether a
 * `headers:`/`origin:` token appears within the same call expression's
 * argument list, rather than fully parsing an AST. False positives (a real
 * header present but written unusually far from the call) are acceptable —
 * update ALLOWLISTED_FILES below with a one-line reason if that happens.
 * False negatives (a call that looks like it has a header but doesn't) are
 * the failure mode this guard cannot fully rule out; it is a floor, not a
 * substitute for review.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../..");

// Directories that legitimately never need scanning, or would produce noise
// (build output, dependencies, and a stale/abandoned worktree checkout under
// .claude/worktrees that is not part of the deployed app).
const EXCLUDED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  "dist",
  "build",
  ".claude",
]);

// Files where a bare signUpEmail/authClient.signUp.email call is correct and
// does NOT need an explicit Origin argument in code, with the reason why.
const ALLOWLISTED_FILES: Record<string, string> = {
  "apps/portal/src/app/sign-in/register/page.tsx":
    "Real browser call via authClient.signUp.email() — Origin is a forbidden " +
    "header the browser sets automatically from the page's real origin and no " +
    "application JS (including this file) can read or override it, so there is " +
    "nothing to add here. This is the actual production path the whole " +
    "Origin-aware design exists for.",
};

const SIGNUP_CALL_PATTERN = /\b(?:auth\.api\.signUpEmail|authClient\.signUp\.email)\s*\(/g;

/**
 * Replaces every comment (`//...`, `/* ... *`+`/`) and string/template
 * literal with spaces of the same length (newlines preserved), so the call
 * pattern only matches real call sites — not a JSDoc line mentioning
 * `signUpEmail()` in prose, or a test's `describe("...signUpEmail...")`
 * title. Deliberately simple (no template-literal `${}` re-entry handling,
 * no regex-literal-vs-division disambiguation) — good enough for this
 * repo's actual source, not a general-purpose JS tokenizer.
 */
function maskCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) {
        if (source[j] === "\\") j++;
        j++;
      }
      const stop = Math.min(j + 1, source.length);
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      listSourceFiles(path.join(dir, entry.name), out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** Extracts the balanced-paren argument list starting at `openParenIndex`. */
function extractCallArgs(source: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") {
      depth--;
      if (depth === 0) return source.slice(openParenIndex, i + 1);
    }
  }
  return source.slice(openParenIndex);
}

interface CallSite {
  relativePath: string;
  line: number;
  hasOriginSignal: boolean;
}

/**
 * Core scan, factored out so both the real repo scan (findSignUpCallSites)
 * and this file's own multi-line-fixture self-test (below) exercise the
 * exact same detection logic against in-memory source, not just real files.
 */
function scanSourceForCallSites(source: string, relativePath: string): CallSite[] {
  const sites: CallSite[] = [];
  const masked = maskCommentsAndStrings(source);
  SIGNUP_CALL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SIGNUP_CALL_PATTERN.exec(masked))) {
    const openParenIndex = match.index + match[0].length - 1;
    // Args are extracted from the REAL source (not masked) so header/origin
    // detection sees actual code — masking is only used to find genuine
    // call sites, not to hide real argument content from the check below.
    const args = extractCallArgs(source, openParenIndex);
    const line = source.slice(0, match.index).split("\n").length;
    sites.push({
      relativePath,
      line,
      hasOriginSignal: /headers\s*:|origin\s*:/i.test(args),
    });
  }
  return sites;
}

function findSignUpCallSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const absPath of listSourceFiles(REPO_ROOT)) {
    if (absPath.endsWith(".test.ts") && path.basename(absPath) === "registration-origin-callers.test.ts") continue;
    const source = fs.readFileSync(absPath, "utf8");
    const relativePath = path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
    sites.push(...scanSourceForCallSites(source, relativePath));
  }
  return sites;
}

describe("signUpEmail/authClient.signUp.email call sites carry an Origin signal", () => {
  const sites = findSignUpCallSites();

  it("finds at least the known call sites (sanity check the scanner itself works)", () => {
    expect(sites.length).toBeGreaterThanOrEqual(5);
  });

  it.each(sites)(
    "$relativePath:$line has an Origin signal or is allowlisted",
    ({ relativePath, line, hasOriginSignal }) => {
      const allowlistReason = ALLOWLISTED_FILES[relativePath];
      if (allowlistReason) {
        expect(allowlistReason.length).toBeGreaterThan(0);
        return;
      }
      expect(
        hasOriginSignal,
        `${relativePath}:${line} calls signUpEmail/authClient.signUp.email without a ` +
          `headers/origin argument in the same call. Under registration-origin.hook.ts's ` +
          `fail-closed policy this will be rejected with REGISTRATION_ORIGIN_NOT_ALLOWED. ` +
          `Add an explicit Origin header (see bootstrap-superadmin.ts or ` +
          `registration-gate.integration.test.ts for the pattern), or add this file to ` +
          `ALLOWLISTED_FILES in this test with a one-line reason if it's a real browser call.`,
      ).toBe(true);
    },
  );
});

describe("scanSourceForCallSites — multi-line detection (explicit fixtures)", () => {
  // Asserted directly against hardcoded multi-line source, so multi-line
  // coverage doesn't have to be inferred from the shape of real call sites
  // elsewhere in the repo — it's a first-class case here.

  it("detects a compliant multi-line call (headers on its own line)", () => {
    const source = `
async function example() {
  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Multi Line Fixture" },
    headers: new Headers({ origin: "http://apps.localhost:3003" }),
  });
  return result;
}
`;
    const [site] = scanSourceForCallSites(source, "fixture.ts");
    expect(site?.hasOriginSignal).toBe(true);
  });

  it("detects a violating multi-line call (no headers line at all)", () => {
    const source = `
async function example() {
  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Multi Line Fixture" },
  });
  return result;
}
`;
    const [site] = scanSourceForCallSites(source, "fixture.ts");
    expect(site?.hasOriginSignal).toBe(false);
  });

  it("detects a compliant multi-line call with a nested multi-line body and an inline comment between properties", () => {
    const source = `
async function example() {
  await auth.api.signUpEmail({
    body: {
      email,
      password: "Password123!",
      name: "Spoofed Context",
      // @ts-expect-error — deliberately sending an unsupported field.
      registrationContext: "CUSTOMER_PORTAL",
    },
    headers: new Headers({ origin: APPS_ORIGIN }),
  });
}
`;
    const [site] = scanSourceForCallSites(source, "fixture.ts");
    expect(site?.hasOriginSignal).toBe(true);
  });

  it("does not false-positive on a JSDoc comment mentioning signUpEmail() in prose", () => {
    const source = `
/**
 * Created through auth.api.signUpEmail() and validated by the gate.
 */
function helper() {}
`;
    const sites = scanSourceForCallSites(source, "fixture.ts");
    expect(sites).toHaveLength(0);
  });

  it("does not false-positive on a describe() title string mentioning the call name", () => {
    const source = `
describe("real sign-up via auth.api.signUpEmail (some detail)", () => {});
`;
    const sites = scanSourceForCallSites(source, "fixture.ts");
    expect(sites).toHaveLength(0);
  });
});
