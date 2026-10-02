import { describe, expect, it } from "vitest";
import { customerPortalApiRewrites } from "../../customer-portal-api-rewrites.js";

describe("customerPortalApiRewrites", () => {
  it("maps auth, /me, and customer paths onto the API origin without changing them", () => {
    expect(customerPortalApiRewrites("http://localhost:3001")).toEqual([
      { source: "/api/:path*", destination: "http://localhost:3001/api/:path*" },
      { source: "/me", destination: "http://localhost:3001/me" },
      { source: "/me/:path*", destination: "http://localhost:3001/me/:path*" },
      { source: "/customer/:path*", destination: "http://localhost:3001/customer/:path*" },
      {
        source: "/certificate-verification/:path*",
        destination: "http://localhost:3001/certificate-verification/:path*",
      },
    ]);
  });

  it("covers every API path the portal calls, so none falls through to the dev server's 404", () => {
    const sources = customerPortalApiRewrites("http://localhost:3001").map((rewrite: { source: string }) => rewrite.source);
    const calledPaths = [
      "/api/auth/get-session",
      "/me",
      "/me/customer-link",
      "/customer/work-orders",
      "/customer/work-orders/abc/jobs",
      "/customer/calibration-jobs/abc/certificate/pdf",
      "/certificate-verification/token",
      "/certificate-verification/token/pdf",
    ];
    const matches = (source: string, path: string) =>
      new RegExp(`^${source.replace(":path*", ".*")}$`).test(path);
    for (const path of calledPaths) {
      expect(sources.some((source: string) => matches(source, path)), path).toBe(true);
    }
  });

  it("does not invent a destination when the API origin is missing or relative", () => {
    expect(customerPortalApiRewrites("")).toEqual([]);
    expect(customerPortalApiRewrites("/api")).toEqual([]);
    expect(customerPortalApiRewrites(undefined as unknown as string)).toEqual([]);
  });
});
