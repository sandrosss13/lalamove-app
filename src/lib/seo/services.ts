/**
 * The service landing pages: `/{locale}/momsakhureba/{service}` on the client
 * host — one page per kind of job ("house moving", "furniture delivery",
 * "movers"…) written for search, the job-type counterpart of the city pages in
 * `src/lib/seo/cities.ts`.
 *
 * This module is only the route contract (which slugs exist, how their URLs
 * are built and recognised). The copy lives in the `serviceLanding` message
 * catalogs. It is imported by the Edge middleware, the indexing policy in
 * `src/lib/seo/site.ts`, the sitemap and the specs, so — like
 * `src/lib/seo/cities.ts` — it must stay free of runtime imports: no Prisma,
 * no `server-only`, no Node built-ins, no side effects.
 */

/**
 * The unprefixed path segment every service page sits under. Georgian
 * ("მომსახურება", transliterated) for the same reason as the city pages'
 * `/gadazidva`: Georgian is the default locale, and the English pages share
 * the path so each service is one hreflang cluster under one URL.
 */
export const SERVICE_LANDING_SEGMENT = "/momsakhureba";

/**
 * Every service with a landing page, in display order. Each slug is the
 * transliterated Georgian search phrase the page is written for.
 */
export const SERVICE_LANDING_SLUGS = [
  "binis-gadazidva",
  "avejis-gadazidva",
  "teqnikis-gadazidva",
  "opisis-gadazidva",
  "samsheneblo-masalebis-gadazidva",
  "mtvirtavebi",
] as const;

export type ServiceLandingSlug = (typeof SERVICE_LANDING_SLUGS)[number];

/**
 * The value in the app's `CargoCategory` enum (Prisma schema) each service
 * corresponds to, or `null` where the page is about something other than one
 * category: office moving spans several (furniture, appliances, boxes), and
 * movers are the booking's helpers, not a kind of cargo. Spelled out as
 * literals rather than imported from `@prisma/client`, which would pull Prisma
 * into the Edge bundle; the union below keeps the two in step by hand.
 */
export const SERVICE_LANDING_CARGO_CATEGORY: Record<
  ServiceLandingSlug,
  | "FULL_RELOCATION"
  | "FURNITURE_FURNISHINGS"
  | "APPLIANCES"
  | "CONSTRUCTION_MATERIALS"
  | null
> = {
  "binis-gadazidva": "FULL_RELOCATION",
  "avejis-gadazidva": "FURNITURE_FURNISHINGS",
  "teqnikis-gadazidva": "APPLIANCES",
  "opisis-gadazidva": null,
  "samsheneblo-masalebis-gadazidva": "CONSTRUCTION_MATERIALS",
  mtvirtavebi: null,
};

const SERVICE_LANDING_SLUG_SET: ReadonlySet<string> = new Set(
  SERVICE_LANDING_SLUGS,
);

export function isServiceLandingSlug(
  value: string,
): value is ServiceLandingSlug {
  return SERVICE_LANDING_SLUG_SET.has(value);
}

/** The unprefixed path of a service page, e.g. `"/momsakhureba/mtvirtavebi"`. */
export function serviceLandingPath(slug: ServiceLandingSlug): string {
  return `${SERVICE_LANDING_SEGMENT}/${slug}`;
}

/**
 * Whether an *unprefixed* pathname (what `splitLocalePrefix` leaves) is
 * exactly one known service page. Deliberately strict, like
 * `isCityLandingPath` — no trailing slash, no sub-paths, no unknown slugs — so
 * that only the pages that really exist are exempt from the pre-launch gate
 * and indexable; `/momsakhureba/unknown` stays gated like any other path.
 */
export function isServiceLandingPath(pathname: string): boolean {
  const prefix = `${SERVICE_LANDING_SEGMENT}/`;
  return (
    pathname.startsWith(prefix) &&
    isServiceLandingSlug(pathname.slice(prefix.length))
  );
}
