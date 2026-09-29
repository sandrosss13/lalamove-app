import { expect, test } from "@playwright/test";

import {
  DEFAULT_LOCALE,
  isAppLocale,
  LOCALES,
  splitLocalePrefix,
  toContentLocale,
  withLocalePrefix,
} from "@/i18n/routing";

/**
 * The locale prefix is load bearing for more than the URL bar: `src/middleware.ts`
 * strips it before handing the remainder to the host gate, and every one of that
 * gate's path lists (`CLIENT_ONLY_EXACT`, `MERCHANT_ONLY_PREFIXES`, …) is
 * written unprefixed. A bug in the split therefore does not look like a
 * language bug — it looks like the merchant host serving the customer app, or
 * `/ka/dashboard` 404ing.
 *
 * These are pure-function specs: `splitLocalePrefix` and `withLocalePrefix` have
 * no server-only imports precisely so they can be exercised without a browser or
 * a database. See the header of `playwright.config.ts` for why the suite has no
 * second runner.
 */
test.describe("splitLocalePrefix", () => {
  test("splits a prefixed path into locale and remainder", () => {
    expect(splitLocalePrefix("/ka/home")).toEqual({
      locale: "ka",
      pathname: "/home",
    });
    expect(splitLocalePrefix("/en/orders/42")).toEqual({
      locale: "en",
      pathname: "/orders/42",
    });
  });

  test("normalises a bare prefix to the root path", () => {
    // `/ka` is the landing page, and the host gate matches `"/"` exactly in
    // `CLIENT_ONLY_EXACT` — an empty-string remainder would miss it.
    expect(splitLocalePrefix("/ka")).toEqual({ locale: "ka", pathname: "/" });
    expect(splitLocalePrefix("/en")).toEqual({ locale: "en", pathname: "/" });
  });

  test("leaves an unprefixed path untouched", () => {
    // Nothing has negotiated a locale yet — an external link or an old
    // bookmark. The locale layer in the middleware is what redirects these.
    expect(splitLocalePrefix("/home")).toEqual({
      locale: null,
      pathname: "/home",
    });
    expect(splitLocalePrefix("/")).toEqual({ locale: null, pathname: "/" });
  });

  test("does not mistake a route segment for a locale", () => {
    // The guard is an exact match against `LOCALES`, so a path that merely
    // starts with those letters is not a prefix.
    expect(splitLocalePrefix("/kansas")).toEqual({
      locale: null,
      pathname: "/kansas",
    });
    expect(splitLocalePrefix("/enterprise/leads")).toEqual({
      locale: null,
      pathname: "/enterprise/leads",
    });
  });

  test("leaves an unknown locale unsplit so the route can 404", () => {
    expect(splitLocalePrefix("/fr/home")).toEqual({
      locale: null,
      pathname: "/fr/home",
    });
  });

  test("keeps the host gate's own path lists matching", () => {
    // The three shapes `src/middleware.ts` classifies, asserted as the gate
    // sees them after the split. If this breaks, the host split breaks.
    expect(splitLocalePrefix("/ka/dashboard/loads").pathname).toBe(
      "/dashboard/loads",
    );
    expect(splitLocalePrefix("/en/admin/analytics").pathname).toBe(
      "/admin/analytics",
    );
    expect(splitLocalePrefix("/ka/orders").pathname).toBe("/orders");
  });
});

test.describe("withLocalePrefix", () => {
  test("is the inverse of splitLocalePrefix", () => {
    for (const locale of LOCALES) {
      for (const pathname of ["/", "/home", "/orders/42", "/admin/analytics"]) {
        expect(splitLocalePrefix(withLocalePrefix(locale, pathname))).toEqual({
          locale,
          pathname,
        });
      }
    }
  });

  test("produces a bare prefix for the root, with no trailing slash", () => {
    // `/ka/` and `/ka` would be two URLs for one page.
    expect(withLocalePrefix("ka", "/")).toBe("/ka");
    expect(withLocalePrefix("en", "/")).toBe("/en");
  });
});

test.describe("locale identity", () => {
  test("Georgian is the default", () => {
    expect(DEFAULT_LOCALE).toBe("ka");
    expect(LOCALES[0]).toBe("ka");
  });

  test("isAppLocale rejects anything not in LOCALES", () => {
    expect(isAppLocale("ka")).toBe(true);
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("KA")).toBe(false);
    expect(isAppLocale("fr")).toBe(false);
    expect(isAppLocale(undefined)).toBe(false);
    expect(isAppLocale(null)).toBe(false);
  });

  test("maps to the ContentLocale enum the content tables are keyed by", () => {
    expect(toContentLocale("ka")).toBe("KA");
    expect(toContentLocale("en")).toBe("EN");
  });
});
