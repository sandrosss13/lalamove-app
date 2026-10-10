import type { ContentLocale } from "@prisma/client";

// Type-only imports, so nothing of the server routes (Prisma, Better Auth) is
// pulled into the client bundle — they are erased at compile time.
import type { AdminBannerRow } from "@/app/api/admin/content/banners/route";
import type { AdminHomePageSectionRow } from "@/app/api/admin/content/home-page-sections/route";
import {
  DEFAULT_HOME_PAGE_SECTION_ORDER,
  HOME_PAGE_CHROME_SECTION_TYPES,
  PINNED_UNDER_HERO,
  isHomePageSectionType,
  type HomePageSectionType,
} from "@/lib/admin/home-page-content";

/**
 * A banner as the inline lists edit it.
 *
 * The three card-copy columns (`eyebrow`, `body`, `ctaLabel`) exist on the
 * `Banner` model but are optional here: the list endpoint is free to start
 * returning them before (or after) this UI ships, and an absent key reads the
 * same as an empty one.
 */
export type CmsBanner = AdminBannerRow & {
  eyebrow?: string | null;
  body?: string | null;
  ctaLabel?: string | null;
};

/** Root of every section endpoint the CMS calls. */
export const SECTIONS_ENDPOINT = "/api/admin/content/home-page-sections";

/** Root of every banner endpoint the CMS calls. */
export const BANNERS_ENDPOINT = "/api/admin/content/banners";

/**
 * Pulls the API's `{ error }` message out of a failed response — a `403` for a
 * role that may not manage content, or a `409` for a seventh live hero banner,
 * says *why* instead of showing a generic failure.
 */
export async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return fallback;
}

/**
 * Reads the section list out of any of the section endpoints.
 *
 * The list `GET` answers `{ items }`; the bulk endpoints (reorder, materialize,
 * copy-locale, restore-defaults) answer `{ sections }` with the same rows. One
 * reader for both keeps every caller from caring which one it hit.
 */
export function readSectionRows(body: unknown): AdminHomePageSectionRow[] {
  if (typeof body !== "object" || body === null) {
    return [];
  }

  const record = body as Record<string, unknown>;
  const rows = Array.isArray(record.sections)
    ? record.sections
    : Array.isArray(record.items)
      ? record.items
      : [];

  return rows as AdminHomePageSectionRow[];
}

/** Replaces one entry of a repeatable list, leaving the rest untouched. */
export function replaceAt<Item>(
  items: readonly Item[],
  index: number,
  next: Item,
): Item[] {
  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}

/** Drops one entry of a repeatable list. */
export function removeAt<Item>(items: readonly Item[], index: number): Item[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

/**
 * Moves one entry of a list by one position. Returns a copy unchanged when the
 * move would run off either end, so callers need no bounds check of their own.
 */
export function moveAt<Item>(
  items: readonly Item[],
  index: number,
  direction: -1 | 1,
): Item[] {
  const target = index + direction;
  const next = [...items];

  if (target < 0 || target >= items.length) {
    return next;
  }

  const [moved] = next.splice(index, 1);
  // `splice` on an in-range index always removes one element; the guard is what
  // says so to the compiler, which types the read as possibly undefined.
  if (moved === undefined) {
    return [...items];
  }
  next.splice(target, 0, moved);

  return next;
}

/** The page's own locale tag (`/ka`, `/en`) for a `ContentLocale`. */
export function toPathLocale(locale: ContentLocale): string {
  return locale.toLowerCase();
}

/** `admin.homePageSectionTypes` key for each section type. */
export const SECTION_TYPE_LABEL_KEYS: Record<HomePageSectionType, string> = {
  hero: "hero",
  hero_carousel: "heroCarousel",
  partner_marquee: "partnerMarquee",
  stats: "stats",
  bento: "bento",
  quote_calculator: "quoteCalculator",
  offers: "offers",
  how_it_works: "howItWorks",
  vehicle_types: "vehicleTypes",
  driver_cta: "driverCta",
  coverage: "coverage",
  faq: "faq",
  closing_cta: "closingCta",
  category_tiles: "categoryTiles",
  nav: "nav",
  footer: "footer",
};

/** The v4 body types, as a set for membership checks. */
const V4_BODY_TYPES: ReadonlySet<string> = new Set(
  DEFAULT_HOME_PAGE_SECTION_ORDER,
);

const CHROME_TYPES: ReadonlySet<string> = new Set(
  HOME_PAGE_CHROME_SECTION_TYPES,
);

/** One locale's rows, split the way the section list renders them. */
export type PartitionedSections = {
  /** v4 body sections in display order, the pinned booking card under hero. */
  body: AdminHomePageSectionRow[];
  nav: AdminHomePageSectionRow | null;
  footer: AdminHomePageSectionRow | null;
  /**
   * Rows v4 has no slot for: the retired types (`hero`, `stats`, `bento`,
   * `driver_cta`, `category_tiles`) and anything this build does not know.
   */
  retired: AdminHomePageSectionRow[];
};

/**
 * Places the pinned section(s) directly after the first hero carousel — the
 * position the renderer gives them regardless of `sortOrder` — or first when
 * there is no carousel.
 */
export function withPinnedUnderHero(
  movable: readonly AdminHomePageSectionRow[],
  pinned: readonly AdminHomePageSectionRow[],
): AdminHomePageSectionRow[] {
  const heroIndex = movable.findIndex(
    (section) => section.type === "hero_carousel",
  );
  const ordered = [...movable];
  ordered.splice(heroIndex + 1, 0, ...pinned);

  return ordered;
}

/**
 * Splits a locale's rows (already in `sortOrder`, as every endpoint returns
 * them) into the groups of the section list.
 */
export function partitionSections(
  rows: readonly AdminHomePageSectionRow[],
): PartitionedSections {
  const movable: AdminHomePageSectionRow[] = [];
  const pinned: AdminHomePageSectionRow[] = [];
  const retired: AdminHomePageSectionRow[] = [];
  let nav: AdminHomePageSectionRow | null = null;
  let footer: AdminHomePageSectionRow | null = null;

  for (const row of rows) {
    if (row.type === PINNED_UNDER_HERO) {
      pinned.push(row);
    } else if (V4_BODY_TYPES.has(row.type)) {
      movable.push(row);
    } else if (CHROME_TYPES.has(row.type)) {
      // A duplicate chrome row cannot be rendered (the composer picks one by
      // type), so extras are listed with the retired rows where they can at
      // least be found and deleted.
      if (row.type === "nav" && nav === null) {
        nav = row;
      } else if (row.type === "footer" && footer === null) {
        footer = row;
      } else {
        retired.push(row);
      }
    } else {
      retired.push(row);
    }
  }

  return { body: withPinnedUnderHero(movable, pinned), nav, footer, retired };
}

/**
 * Whether a locale is missing any section the v4 page is made of, which is the
 * cue to ask the server to materialize the defaults so every section can be
 * listed and edited.
 */
export function isMissingV4Sections(
  rows: readonly AdminHomePageSectionRow[],
): boolean {
  const present = new Set(rows.map((row) => row.type));

  return [
    ...DEFAULT_HOME_PAGE_SECTION_ORDER,
    ...HOME_PAGE_CHROME_SECTION_TYPES,
  ].some((type) => !present.has(type));
}

/** Whether a stored type is one v4 can edit inline (body or chrome). */
export function isEditableV4Type(type: string): type is HomePageSectionType {
  return (
    isHomePageSectionType(type) &&
    (V4_BODY_TYPES.has(type) || CHROME_TYPES.has(type))
  );
}

/**
 * A short, stable fingerprint of a JSON value (djb2 over its serialization).
 *
 * Used to key the editor pane on a section's *content*: a save that changes
 * the content remounts the pane with a clean draft, while a visibility toggle
 * or a reorder (which leave the content alone) does not throw away edits in
 * progress.
 */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value) ?? "";
  let hash = 5381;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }

  return (hash >>> 0).toString(36);
}
