import type { AppLocale } from "@/i18n/routing";

/**
 * Loads one locale's message catalogs.
 *
 * The map is keyed by locale with a literal `import()` per entry rather than
 * one `import(\`@/messages/${locale}\`)`: a template literal makes the bundler
 * emit a context module covering every directory that could match, so both
 * locales would ship in every bundle. Two explicit imports keep them in two
 * chunks, and a visitor reading Georgian never downloads the English strings.
 *
 * Splitting the catalogs per namespace (`common`, `driverHub`, `admin`, …)
 * rather than one flat file per locale is a maintenance choice, not a bundling
 * one — ~2,000 strings in a single JSON object is not reviewable in a diff. The
 * barrels in `src/messages/<locale>/index.ts` merge them back into the one nested
 * object `next-intl` expects, where the namespace is the top-level key.
 */
const CATALOG_LOADERS: Record<
  AppLocale,
  () => Promise<{ default: Record<string, unknown> }>
> = {
  ka: () => import("@/messages/ka"),
  en: () => import("@/messages/en"),
};

export async function loadMessages(locale: AppLocale) {
  const { default: messages } = await CATALOG_LOADERS[locale]();
  return messages;
}
