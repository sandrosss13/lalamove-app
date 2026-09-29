/**
 * The English fallback layer under every non-English catalog.
 *
 * `next-intl` renders a missing key as the dotted key itself, silently — no
 * throw, no failed test, just `auth.signIn.heading` where a heading belongs.
 * Georgian is this platform's default locale and its catalogs are almost
 * entirely unauthored (11 of 1,519 strings at the time of writing), so
 * `loadMessages` layers the English catalog underneath and lets the requested
 * locale win key by key. The worst case becomes the English the screen already
 * showed rather than a key path.
 *
 * These specs pin that merge. They exercise `withFallback` directly rather than
 * `loadMessages`, because calling `loadMessages` would pull in the catalog
 * barrels and Playwright's ESM loader rejects their bare JSON imports without
 * an attribute the Next bundler does not want — the same constraint that makes
 * `tests/i18n-catalogs.spec.ts` read the catalogs off disk. No browser, no
 * server: `withFallback` is a pure function over two plain objects.
 */

import { expect, test } from "@playwright/test";

import { withFallback } from "@/i18n/messages";

test("a key the overlay does not have falls back to the base", () => {
  const merged = withFallback({ auth: { heading: "Sign in" } }, { auth: {} });

  expect(merged).toEqual({ auth: { heading: "Sign in" } });
});

test("a key the overlay does have wins over the base", () => {
  const merged = withFallback(
    { auth: { heading: "Sign in" } },
    { auth: { heading: "შესვლა" } },
  );

  expect(merged).toEqual({ auth: { heading: "შესვლა" } });
});

/**
 * The case the whole layer exists for: a namespace the translator has started
 * but not finished. The authored key must not drag the unauthored ones down
 * with it, which a shallow `{...base, ...overlay}` would do — the overlay's
 * `auth` object would replace the base's wholesale and `subheading` would
 * vanish.
 */
test("a partially translated namespace keeps the base's untranslated keys", () => {
  const merged = withFallback(
    { auth: { heading: "Sign in", subheading: "Welcome back" } },
    { auth: { heading: "შესვლა" } },
  );

  expect(merged).toEqual({
    auth: { heading: "შესვლა", subheading: "Welcome back" },
  });
});

test("nesting merges at every depth, not just the top", () => {
  const merged = withFallback(
    { auth: { signIn: { heading: "Sign in", cta: "Continue" } } },
    { auth: { signIn: { heading: "შესვლა" } } },
  );

  expect(merged).toEqual({
    auth: { signIn: { heading: "შესვლა", cta: "Continue" } },
  });
});

/**
 * A blank overlay string is treated as absent rather than as a translation.
 * `tests/i18n-catalogs.spec.ts` forbids blank messages so this should be
 * unreachable through the real catalogs, but an empty label renders as nothing
 * at all — a failure with no symptom to notice.
 */
test("a blank string in the overlay does not shadow the base", () => {
  const merged = withFallback(
    { auth: { heading: "Sign in" } },
    { auth: { heading: "   " } },
  );

  expect(merged).toEqual({ auth: { heading: "Sign in" } });
});

test("a namespace only the overlay has survives the merge", () => {
  const merged = withFallback({}, { auth: { heading: "შესვლა" } });

  expect(merged).toEqual({ auth: { heading: "შესვლა" } });
});

test("the base is not mutated", () => {
  const base = { auth: { heading: "Sign in" } };
  withFallback(base, { auth: { heading: "შესვლა" } });

  expect(base).toEqual({ auth: { heading: "Sign in" } });
});
