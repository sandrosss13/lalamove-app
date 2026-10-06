import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  isUnderConstructionExempt,
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

test.describe("isUnderConstructionExempt", () => {
  test("exempts exactly the known city landing pages", () => {
    for (const path of ["/gadazidva/tbilisi", "/gadazidva/zugdidi"]) {
      expect(isUnderConstructionExempt(path), path).toBe(true);
    }
    for (const path of [
      "/",
      "/gadazidva",
      "/gadazidva/",
      "/gadazidva/atlantis",
      "/gadazidva/tbilisi/",
      "/gadazidva/tbilisi/extra",
      "/gadazidva/Tbilisi",
      "/ka/gadazidva/tbilisi",
    ]) {
      expect(isUnderConstructionExempt(path), path).toBe(false);
    }
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
      VERCEL_ENV: "",
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

  test("rewrites client-host pages in place", () => {
    const [root, english, deep, remembered] = probe(env, [
      { url: "https://zomo.ge/" },
      { url: "https://zomo.ge/en" },
      { url: "https://zomo.ge/ka/orders/42/track" },
      { url: "https://zomo.ge/home", cookie: "NEXT_LOCALE=en" },
    ]);

    expect(root).toMatchObject({ kind: "rewrite", rewrite: "/ka/coming-soon" });
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

  test("leaves only the root indexable", () => {
    // The root is how the brand is found before launch; every other gated URL
    // renders the same page and would be a duplicate of it.
    const results = probe(env, [
      { url: "https://zomo.ge/" },
      { url: "https://zomo.ge/ka" },
      { url: "https://zomo.ge/en" },
      { url: "https://zomo.ge/ka/orders/42/track" },
      { url: "https://zomo.ge/en/coming-soon" },
    ]);

    for (const result of results.slice(0, 3)) {
      expect(result.robots, result.url).toBeNull();
    }
    for (const result of results.slice(3)) {
      expect(result.robots, result.url).toBe("noindex, nofollow");
    }
  });

  test("lets metadata images through instead of rewriting them", () => {
    // Rewritten to the HTML page, every link preview would break.
    for (const result of probe(env, [
      { url: "https://zomo.ge/ka/opengraph-image" },
      { url: "https://zomo.ge/en/twitter-image" },
      { url: "https://zomo.ge/sitemap.xml" },
    ])) {
      expect(result, result.url).toMatchObject({ kind: "next", robots: null });
    }
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

  test("does not gate the merchant or admin hosts", () => {
    // Served, not rewritten — but noindexed, since none of these is a page
    // search engines should list (see `isIndexablePath`).
    for (const result of probe(env, [
      { url: "https://merchant.zomo.ge/ka/sign-in" },
      { url: "https://merchant.zomo.ge/ka/dashboard" },
      { url: "https://admin.zomo.ge/ka/admin" },
    ])) {
      expect(result.kind, result.url).toBe("next");
      expect(result.robots, result.url).toBe("noindex, nofollow");
    }
  });

  test("leaves driver sign-up indexable on the merchant host", () => {
    for (const result of probe(env, [
      { url: "https://merchant.zomo.ge/ka/sign-up" },
      { url: "https://merchant.zomo.ge/en/sign-up" },
    ])) {
      expect(result, result.url).toMatchObject({ kind: "next", robots: null });
    }
  });

  test("sends a signed-out visitor at the merchant root to sign-up", () => {
    // Regression: the root used to bounce to the client host like any other
    // client path, which with the gate on landed drivers on "coming soon".
    // A signed-out visitor is most likely a prospective driver, so the root
    // opens recruitment rather than dashboard -> sign-in.
    const results = probe(env, [
      { url: "https://merchant.zomo.ge/" },
      { url: "https://merchant.zomo.ge/ka" },
      { url: "https://merchant.zomo.ge/en" },
      { url: "https://merchant.zomo.ge/en?ref=sms" },
    ]);
    const [bare, georgian, english, query] = results;

    // Unprefixed: stays unprefixed, and the locale layer negotiates it on the
    // next hop like any other bare path.
    expect(bare).toMatchObject({
      kind: "redirect",
      location: "https://merchant.zomo.ge/sign-up",
    });
    expect(georgian).toMatchObject({
      kind: "redirect",
      location: "https://merchant.zomo.ge/ka/sign-up",
    });
    expect(english).toMatchObject({
      kind: "redirect",
      location: "https://merchant.zomo.ge/en/sign-up",
    });
    expect(query).toMatchObject({
      kind: "redirect",
      location: "https://merchant.zomo.ge/en/sign-up?ref=sms",
    });

    for (const result of results) {
      expect(result.robots, result.url).toBeNull();
    }
  });

  test("sends a signed-in visitor at the merchant root to the dashboard", () => {
    // Plain and `__Secure-` (HTTPS) cookie names, as Better Auth writes them.
    const [plain, secure, bare] = probe(env, [
      {
        url: "https://merchant.zomo.ge/ka",
        cookie: "better-auth.session_token=abc",
      },
      {
        url: "https://merchant.zomo.ge/en?ref=sms",
        cookie: "__Secure-better-auth.session_token=abc",
      },
      {
        url: "https://merchant.zomo.ge/",
        cookie: "__Secure-better-auth.session_token=abc",
      },
    ]);

    expect(plain).toMatchObject({
      kind: "redirect",
      location: "https://merchant.zomo.ge/ka/dashboard",
    });
    expect(secure).toMatchObject({
      kind: "redirect",
      location: "https://merchant.zomo.ge/en/dashboard?ref=sms",
    });
    expect(bare).toMatchObject({
      kind: "redirect",
      location: "https://merchant.zomo.ge/dashboard",
    });
  });

  test("still bounces other client paths off the merchant host", () => {
    const [home, account, orders] = probe(env, [
      { url: "https://merchant.zomo.ge/home" },
      { url: "https://merchant.zomo.ge/en/account/profile" },
      { url: "https://merchant.zomo.ge/ka/orders" },
    ]);

    expect(home).toMatchObject({
      kind: "redirect",
      location: "https://zomo.ge/home",
    });
    expect(account).toMatchObject({
      kind: "redirect",
      location: "https://zomo.ge/en/account/profile",
    });
    expect(orders).toMatchObject({
      kind: "redirect",
      location: "https://zomo.ge/ka/orders",
    });
  });

  test("serves the city landing pages live and indexable", () => {
    const [georgian, english, bare, unknown, image] = probe(env, [
      { url: "https://zomo.ge/ka/gadazidva/tbilisi" },
      { url: "https://zomo.ge/en/gadazidva/zugdidi" },
      { url: "https://zomo.ge/gadazidva/batumi" },
      { url: "https://zomo.ge/en/gadazidva/atlantis" },
      { url: "https://zomo.ge/ka/gadazidva/tbilisi/opengraph-image" },
    ]);

    // Exempt from the gate: served as themselves, with no noindex header.
    expect(georgian).toMatchObject({ kind: "next", robots: null });
    expect(english).toMatchObject({ kind: "next", robots: null });
    // Unprefixed: the locale layer's usual redirect, not the gate.
    expect(bare).toMatchObject({
      kind: "redirect",
      location: "https://zomo.ge/ka/gadazidva/batumi",
    });
    // Only known slugs are exempt; anything else is gated like any path.
    expect(unknown).toMatchObject({
      kind: "rewrite",
      rewrite: "/en/coming-soon",
      robots: "noindex, nofollow",
    });
    expect(image).toMatchObject({ kind: "next", robots: null });
  });

  test("bounces city landing pages off the merchant host", () => {
    const [city] = probe(env, [
      { url: "https://merchant.zomo.ge/en/gadazidva/kutaisi?ref=x" },
    ]);

    expect(city).toMatchObject({
      kind: "redirect",
      location: "https://zomo.ge/en/gadazidva/kutaisi?ref=x",
    });
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
  test("indexes the landing and static pages, nothing signed-in", () => {
    const [english, terms, account, signIn] = probe(PRODUCTION_HOSTS, [
      { url: "https://zomo.ge/en" },
      { url: "https://zomo.ge/ka/pages/terms" },
      { url: "https://zomo.ge/ka/account" },
      { url: "https://zomo.ge/en/sign-in" },
    ]);

    expect(english).toMatchObject({ kind: "next", robots: null });
    expect(terms).toMatchObject({ kind: "next", robots: null });
    expect(account).toMatchObject({
      kind: "next",
      robots: "noindex, nofollow",
    });
    expect(signIn).toMatchObject({ kind: "next", robots: "noindex, nofollow" });
  });

  test("indexes the city landing pages", () => {
    for (const result of probe(PRODUCTION_HOSTS, [
      { url: "https://zomo.ge/ka/gadazidva/gori" },
      { url: "https://zomo.ge/en/gadazidva/rustavi" },
    ])) {
      expect(result, result.url).toMatchObject({ kind: "next", robots: null });
    }
  });

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

test.describe("middleware on a non-public deployment", () => {
  test("noindexes every page on preview deployments", () => {
    // Staging (`test.zomo.ge`) and per-branch previews must never compete
    // with production in search results.
    for (const result of probe({ ...PRODUCTION_HOSTS, VERCEL_ENV: "preview" }, [
      { url: "https://zomo.ge/ka" },
      { url: "https://merchant.zomo.ge/ka/sign-up" },
    ])) {
      expect(result, result.url).toMatchObject({
        kind: "next",
        robots: "noindex, nofollow",
      });
    }
  });

  test("noindexes the vercel.app hostname even in production", () => {
    const [root] = probe({ ...PRODUCTION_HOSTS, VERCEL_ENV: "production" }, [
      { url: "https://lalamove-app.vercel.app/ka" },
    ]);

    expect(root).toMatchObject({ kind: "next", robots: "noindex, nofollow" });
  });
});
