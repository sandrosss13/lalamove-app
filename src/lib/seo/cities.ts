/**
 * The city landing pages: `/{locale}/gadazidva/{city}` on the client host —
 * "cargo delivery in <city>" pages written for search, one per city.
 *
 * This module is only the route contract (which slugs exist, how their URLs
 * are built and recognised). The copy lives in the `cityLanding` message
 * catalogs. It is imported by the Edge middleware, the indexing policy in
 * `src/lib/seo/site.ts`, the sitemap and the specs, so — like
 * `src/lib/host.ts` — it must stay free of runtime imports: no Prisma, no
 * `server-only`, no Node built-ins, no side effects.
 */

/**
 * The unprefixed path segment every city page sits under. Georgian
 * ("გადაზიდვა", transliterated) because Georgian is the default locale and the
 * keyword searchers type; the English pages share it so each city is one
 * hreflang cluster under one path.
 */
export const CITY_LANDING_SEGMENT = "/gadazidva";

/** Every city with a landing page, in display order (largest first). */
export const CITY_LANDING_SLUGS = [
  "tbilisi",
  "batumi",
  "kutaisi",
  "rustavi",
  "gori",
  "zugdidi",
] as const;

export type CityLandingSlug = (typeof CITY_LANDING_SLUGS)[number];

/**
 * Each slug's value in the app's `GeorgianCity` enum (Prisma schema). Spelled
 * out as literals rather than imported from `@prisma/client`, which would pull
 * Prisma into the Edge bundle; the union below keeps the two in step by hand.
 */
export const CITY_LANDING_GEORGIAN_CITY: Record<
  CityLandingSlug,
  "TBILISI" | "BATUMI" | "KUTAISI" | "RUSTAVI" | "GORI" | "ZUGDIDI"
> = {
  tbilisi: "TBILISI",
  batumi: "BATUMI",
  kutaisi: "KUTAISI",
  rustavi: "RUSTAVI",
  gori: "GORI",
  zugdidi: "ZUGDIDI",
};

const CITY_LANDING_SLUG_SET: ReadonlySet<string> = new Set(CITY_LANDING_SLUGS);

export function isCityLandingSlug(value: string): value is CityLandingSlug {
  return CITY_LANDING_SLUG_SET.has(value);
}

/** The unprefixed path of a city page, e.g. `"/gadazidva/tbilisi"`. */
export function cityLandingPath(slug: CityLandingSlug): string {
  return `${CITY_LANDING_SEGMENT}/${slug}`;
}

/**
 * Whether an *unprefixed* pathname (what `splitLocalePrefix` leaves) is
 * exactly one known city page. Deliberately strict — no trailing slash, no
 * sub-paths, no unknown slugs — so that only the pages that really exist are
 * exempt from the pre-launch gate and indexable; `/gadazidva/atlantis` stays
 * gated like any other path.
 */
export function isCityLandingPath(pathname: string): boolean {
  const prefix = `${CITY_LANDING_SEGMENT}/`;
  return (
    pathname.startsWith(prefix) &&
    isCityLandingSlug(pathname.slice(prefix.length))
  );
}
