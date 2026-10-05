import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  looksLikeFileRequest,
  parseUnderConstructionFlag,
  underConstructionRewritePath,
} from "@/lib/under-construction";

/**
 * The pre-launch gate hides the entire customer site, so the failures worth
 * guarding against are the ones that hide *too much*: the merchant host's
 * sign-up, the admin back office, or `/api/**` on the client origin — which is
 * Better Auth's `baseURL` and the driver mobile app's API base. None of those
 * would show up as an error; they would show up as a "coming soon" page where a
 * JSON response or a sign-in form should be.
 *
 * No browser, no database, no server (see `playwright.config.ts` on why the
 * suite has no second runner).
 */

test.describe("parseUnderConstructionFlag", () => {
  test("is on only for an explicit true", () => {
    expect(parseUnderConstructionFlag("true")).toBe(true);
    expect(parseUnderConstructionFlag(" TRUE ")).toBe(true);
  });

  test("fails off for anything else", () => {
    // A switch that hides the public site must not be turned on by a typo.
    for (const raw of [undefined, "", " ", "false", "1", "yes", "on"]) {
      expect(parseUnderConstructionFlag(raw)).toBe(false);
    }
  });
});

test.describe("underConstructionRewritePath", () => {
  test("keeps the locale the request arrived with", () => {
    expect(underConstructionRewritePath("en", "ka")).toBe("/en/coming-soon");
    expect(underConstructionRewritePath("ka", undefined)).toBe(
      "/ka/coming-soon",
    );
  });

  test("uses the remembered cookie for an unprefixed path", () => {
    expect(underConstructionRewritePath(null, "en")).toBe("/en/coming-soon");
  });

  test("falls back to Georgian for a missing or unknown cookie", () => {
    expect(underConstructionRewritePath(null, undefined)).toBe(
      "/ka/coming-soon",
    );
    expect(underConstructionRewritePath(null, "fr")).toBe("/ka/coming-soon");
  });
});

test.describe("looksLikeFileRequest", () => {
  test("matches files and leaves page routes alone", () => {
    expect(looksLikeFileRequest("/robots.txt")).toBe(true);
    expect(looksLikeFileRequest("/.well-known/assetlinks.json")).toBe(true);
    expect(looksLikeFileRequest("/")).toBe(false);
    expect(looksLikeFileRequest("/orders/42/track")).toBe(false);
  });
});

/**
 * End to end through `src/middleware.ts` itself, in a child process per
 * configuration — see `tests/support/middleware-probe.ts` for why a direct
 * import cannot do this.
 */
interface ProbeResult {
  url: string;
  kind: "redirect" | "rewrite" | "next";
  location: string | null;
  rewrite: string | null;
  robots: string | null;
}

const PROBE = join(process.cwd(), "tests", "support", "middleware-probe.ts");

const PRODUCTION_HOSTS = {
  BETTER_AUTH_URL: "https://zomo.ge",
  NEXT_PUBLIC_MERCHANT_HOST: "merchant.zomo.ge",
  NEXT_PUBLIC_ADMIN_HOST: "admin.zomo.ge",
};

function probe(
  env: Record<string, string>,
  requests: { url: string; cookie?: string }[],
): ProbeResult[] {
  const result = spawnSync(process.execPath, ["--import", "tsx", PROBE], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      // Cleared first so a value in the developer's shell cannot leak in.
      CLIENT_UNDER_CONSTRUCTION: "",
      ...env,
      PROBE_REQUESTS: JSON.stringify(requests),
    },
  });

  if (result.status !== 0) {
    throw new Error(`middleware probe failed:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as ProbeResult[];
}

test.describe("middleware with CLIENT_UNDER_CONSTRUCTION on", () => {
  const env = { ...PRODUCTION_HOSTS, CLIENT_UNDER_CONSTRUCTION: "true" };

  test("rewrites client-host pages in place, with noindex", () => {
    const [root, english, deep, remembered] = probe(env, [
      { url: "https://zomo.ge/" },
      { url: "https://zomo.ge/en" },
      { url: "https://zomo.ge/ka/orders/42/track" },
      { url: "https://zomo.ge/home", cookie: "NEXT_LOCALE=en" },
    ]);

    expect(root).toMatchObject({
      kind: "rewrite",
      rewrite: "/ka/coming-soon",
      robots: "noindex, nofollow",
    });
    expect(english).toMatchObject({
      kind: "rewrite",
      rewrite: "/en/coming-soon",
    });
    expect(deep).toMatchObject({ kind: "rewrite", rewrite: "/ka/coming-soon" });
    expect(remembered).toMatchObject({
      kind: "rewrite",
      rewrite: "/en/coming-soon",
    });
  });

  test("leaves the API and files on the client host alone", () => {
    for (const result of probe(env, [
      { url: "https://zomo.ge/api/auth/get-session" },
      { url: "https://zomo.ge/api/mobile/v1/me" },
      { url: "https://zomo.ge/robots.txt" },
    ])) {
      expect(result.kind, result.url).not.toBe("rewrite");
      expect(result.robots, result.url).toBeNull();
    }
  });

  test("still bounces merchant and admin paths to their own hosts", () => {
    // Cross-host redirects run before the gate: those hosts are live, so a
    // stale link self-heals instead of dead-ending on the placeholder.
    const [dashboard, admin] = probe(env, [
      { url: "https://zomo.ge/en/dashboard" },
      { url: "https://zomo.ge/ka/admin" },
    ]);

    expect(dashboard).toMatchObject({
      kind: "redirect",
      location: "https://merchant.zomo.ge/en/dashboard",
    });
    expect(admin).toMatchObject({
      kind: "redirect",
      location: "https://admin.zomo.ge/ka/admin",
    });
  });

  test("does not touch the merchant or admin hosts", () => {
    for (const result of probe(env, [
      { url: "https://merchant.zomo.ge/ka/sign-in" },
      { url: "https://merchant.zomo.ge/ka/dashboard" },
      { url: "https://admin.zomo.ge/ka/admin" },
    ])) {
      expect(result.kind, result.url).toBe("next");
      expect(result.robots, result.url).toBeNull();
    }
  });

  test("is inert while the merchant split is off", () => {
    // No separate client host exists then, and gating the one shared host
    // would hide driver sign-up along with the customer site.
    const [root] = probe(
      { BETTER_AUTH_URL: "https://zomo.ge", CLIENT_UNDER_CONSTRUCTION: "true" },
      [{ url: "https://zomo.ge/ka" }],
    );

    expect(root).toMatchObject({ kind: "next", robots: null });
  });
});

test.describe("middleware with CLIENT_UNDER_CONSTRUCTION unset", () => {
  test("serves the client host normally", () => {
    const [home, bare] = probe(PRODUCTION_HOSTS, [
      { url: "https://zomo.ge/ka" },
      { url: "https://zomo.ge/" },
    ]);

    expect(home).toMatchObject({ kind: "next", robots: null });
    // The locale layer's usual redirect into Georgian, not the gate.
    expect(bare).toMatchObject({
      kind: "redirect",
      location: "https://zomo.ge/ka",
    });
  });
});
