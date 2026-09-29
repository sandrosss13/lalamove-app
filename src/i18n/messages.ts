import type { AppLocale } from "@/i18n/routing";

/**
 * Loads one locale's message catalogs, with the English catalog underneath as
 * a fallback layer.
 *
 * The map is keyed by locale with a literal `import()` per entry rather than
 * one `import(\`@/messages/${locale}\`)`: a template literal makes the bundler
 * emit a context module covering every directory that could match, so every
 * locale that ever exists would ship in every bundle. Two explicit imports keep
 * them in two chunks.
 *
 * Splitting the catalogs per namespace (`common`, `driverHub`, `admin`, …)
 * rather than one flat file per locale is a maintenance choice, not a bundling
 * one — ~2,000 strings in a single JSON object is not reviewable in a diff. The
 * barrels in `src/messages/<locale>/index.ts` merge them back into the one nested
 * object `next-intl` expects, where the namespace is the top-level key.
 */

/**
 * The locale every other locale falls back to, key by key.
 *
 * English rather than the app's `DEFAULT_LOCALE` (Georgian), and the difference
 * is the whole point: Georgian is the *default* — the language a visitor gets
 * when they express no preference — but English is the *complete* one. Every
 * string in this app is authored in English first and extracted from source by
 * `scripts/extract-translations.mjs`; Georgian arrives later, by hand, through
 * `translation/*.json`. So English is the only catalog that can be relied on to
 * have a given key at all.
 */
const FALLBACK_LOCALE: AppLocale = "en";

const CATALOG_LOADERS: Record<
  AppLocale,
  () => Promise<{ default: Record<string, unknown> }>
> = {
  ka: () => import("@/messages/ka"),
  en: () => import("@/messages/en"),
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `overlay` wins key by key, recursing into nested namespaces, with anything
 * absent from `overlay` left as `base` had it.
 *
 * A blank string in `overlay` counts as absent. `tests/i18n-catalogs.spec.ts`
 * already forbids blank messages, so this should be unreachable — it is here
 * because the failure it prevents (a visitor served an empty label) is silent
 * and the check is one comparison.
 *
 * Exported for `tests/i18n-fallback.spec.ts` only. That spec cannot call
 * `loadMessages` itself: it would pull the catalog barrels in, and Playwright's
 * ESM loader rejects their bare JSON imports without an attribute the Next
 * bundler does not want — the same constraint that makes
 * `tests/i18n-catalogs.spec.ts` read the catalogs off disk.
 */
export function withFallback(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overlay)) {
    const fallback = merged[key];

    if (isPlainObject(value) && isPlainObject(fallback)) {
      merged[key] = withFallback(fallback, value);
      continue;
    }

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

/**
 * Why the fallback layer exists, and when to delete it.
 *
 * `next-intl` renders a missing key as the dotted key itself, silently — a
 * Georgian visitor would read `auth.signIn.heading` where a heading belongs,
 * and nothing would throw, log or fail a test. The catalogs make that a live
 * risk rather than a theoretical one: Georgian is the default locale and, at
 * the time of writing, 11 of 1,519 strings are authored. Every screen still
 * holds hardcoded English literals, so nothing reads these catalogs yet — but
 * the first component converted to `useTranslations` would ship key paths to
 * production for every string its translator had not reached.
 *
 * Falling back to English means the worst case is the English the screen
 * already showed, which is exactly the state the app is in today.
 *
 * The cost is that a Georgian visitor downloads the English catalog too, which
 * is the one thing the per-locale `import()` above was written to avoid. That
 * trade is deliberate and it is temporary: once `translation/*.json` is fully
 * authored and `pnpm i18n:import` has run, delete `FALLBACK_LOCALE`,
 * `withFallback` and this comment, and return the catalog unmerged. The parity
 * spec in `tests/i18n-catalogs.spec.ts` is what will tell you it is safe.
 */
export async function loadMessages(locale: AppLocale) {
  const { default: messages } = await CATALOG_LOADERS[locale]();

  if (locale === FALLBACK_LOCALE) {
    return messages;
  }

  const { default: fallback } = await CATALOG_LOADERS[FALLBACK_LOCALE]();

  return withFallback(fallback, messages);
}
