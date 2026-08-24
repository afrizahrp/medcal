import { describe, expect, it } from "vitest";
import { config } from "./proxy";

/**
 * Next.js matcher form: /((?!a|b|c).*)
 * A path is matched (and therefore rewritten by proxy) when the segment after
 * the leading slash is NOT excluded by the negative lookahead.
 */
function isMatchedByProxy(pathname: string): boolean {
  const matcher = config.matcher[0];
  const pattern = matcher.startsWith("/") ? matcher.slice(1) : matcher;
  const re = new RegExp(`^${pattern}$`);
  const path = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return re.test(path);
}

describe("portal proxy matcher", () => {
  it("excludes /firebase-messaging-sw.js from host-group rewrite", () => {
    expect(isMatchedByProxy("/firebase-messaging-sw.js")).toBe(false);
  });

  it("still matches management app routes", () => {
    expect(isMatchedByProxy("/leads")).toBe(true);
    expect(isMatchedByProxy("/customers")).toBe(true);
    expect(isMatchedByProxy("/")).toBe(true);
  });

  it("still excludes existing bypass paths", () => {
    expect(isMatchedByProxy("/_next/static/chunk.js")).toBe(false);
    expect(isMatchedByProxy("/favicon.ico")).toBe(false);
    expect(isMatchedByProxy("/manifest.webmanifest")).toBe(false);
    expect(isMatchedByProxy("/site.webmanifest")).toBe(false);
    expect(isMatchedByProxy("/sign-in")).toBe(false);
  });

  it("excludes public static assets from host-group rewrite", () => {
    expect(isMatchedByProxy("/short-logo.png")).toBe(false);
    expect(isMatchedByProxy("/android-chrome-192x192.png")).toBe(false);
    expect(isMatchedByProxy("/apple-touch-icon.png")).toBe(false);
  });
});
