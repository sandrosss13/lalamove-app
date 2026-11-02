/**
 * The item catalogue's shape, locale handling, search and `LoadLine` adapter,
 * split out of `src/components/home/order-item-catalogue.ts` so the server can
 * use it.
 *
 * `GET /api/item-catalogue` shapes its response with `shapeCatalogueEntry` and
 * `parseCatalogueLocale` from here, so the response and the browser's
 * `CatalogueItem` type cannot drift apart. They used to live beside the
 * `useItemCatalogue` hook, and importing a module that imports React hooks into
 * a route handler fails `next build` ("This React Hook only works in a Client
 * Component"). This module therefore stays free of React and of `server-only`;
 * the hook lives in the `"use client"` module, which re-exports everything here.
 */

import type {
  CargoCategoryKey,
  ChassisTypeKey,
  HandlingTagKey,
  LoadLine,
} from "@/lib/orders/load-plan";

export type CatalogueLocale = "en" | "ka";

/** One catalogue entry as the item picker sees it, in a single locale. */
export type CatalogueItem = {
  code: string;
  group: string;
  /** In the request locale only. */
  label: string;
  /** Both locales' search terms, request locale first. */
  synonyms: string[];
  weightKg: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  stackable: boolean;
  needsTwoPeople: boolean;
  requiredBody: ChassisTypeKey | null;
  handlingTags: HandlingTagKey[];
  cargoCategory: CargoCategoryKey;
};

/**
 * The columns of `ItemCatalogEntry` the route selects. Structural, so the
 * Prisma row, and a literal in the spec, both satisfy it.
 */
export type CatalogueRow = Omit<CatalogueItem, "label" | "synonyms"> & {
  labelEn: string;
  labelKa: string;
  synonymsEn: readonly string[];
  synonymsKa: readonly string[];
};

export const ITEM_CATALOGUE_ERROR_MESSAGE =
  "Could not load the item list. Please refresh and try again.";

/**
 * `?locale=` to a catalogue locale. Anything other than `ka` (missing, empty,
 * unknown) is English, so a malformed URL still gets a valid response and the
 * set of distinct cacheable URLs stays small.
 */
export function parseCatalogueLocale(value: string | null): CatalogueLocale {
  return value === "ka" ? "ka" : "en";
}

/**
 * A database row to the response shape. The label is the request locale's
 * only; synonyms are the request locale's followed by the other's, so a client
 * typing Georgian on the English UI still finds the item. Duplicates are
 * dropped, keeping first position.
 */
export function shapeCatalogueEntry(
  row: CatalogueRow,
  locale: CatalogueLocale,
): CatalogueItem {
  const own = locale === "ka" ? row.synonymsKa : row.synonymsEn;
  const other = locale === "ka" ? row.synonymsEn : row.synonymsKa;

  return {
    code: row.code,
    group: row.group,
    label: locale === "ka" ? row.labelKa : row.labelEn,
    synonyms: [...new Set([...own, ...other])],
    weightKg: row.weightKg,
    lengthM: row.lengthM,
    widthM: row.widthM,
    heightM: row.heightM,
    stackable: row.stackable,
    needsTwoPeople: row.needsTwoPeople,
    requiredBody: row.requiredBody,
    handlingTags: [...row.handlingTags],
    cargoCategory: row.cargoCategory,
  };
}

/**
 * A catalogue item as a load line. The catalogue's figures are per unit, which
 * is what `LoadLine` expects. `quantity` is passed through as given; clamping
 * to `MAX_LINE_QUANTITY` is the picker's job, as it is for `customLine`.
 */
export function toLoadLine(item: CatalogueItem, quantity: number): LoadLine {
  return {
    quantity,
    unitWeightKg: item.weightKg,
    lengthM: item.lengthM,
    widthM: item.widthM,
    heightM: item.heightM,
    stackable: item.stackable,
    needsTwoPeople: item.needsTwoPeople,
    requiredBody: item.requiredBody,
    handlingTags: item.handlingTags,
    cargoCategory: item.cargoCategory,
  };
}

/** Lower-case, diacritics stripped. Georgian has no case; NFD leaves it alone. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Items matching `query` on label or synonyms, case- and diacritic-insensitive.
 * A match at the start of the label (or any word of it) or of a synonym ranks
 * above one elsewhere in the text; within a rank, label matches come before
 * synonym-only ones, then the catalogue's own order. An empty query returns
 * every item unchanged.
 */
export function searchCatalogue(
  items: readonly CatalogueItem[],
  query: string,
): CatalogueItem[] {
  const needle = fold(query);
  if (needle === "") {
    return [...items];
  }

  const rankOf = (text: string): number | null => {
    const folded = fold(text);
    const index = folded.indexOf(needle);
    if (index === -1) {
      return null;
    }
    if (index === 0) {
      return 0;
    }
    return folded.split(/[\s,/-]+/).some((word) => word.startsWith(needle))
      ? 1
      : 2;
  };

  const scored: { item: CatalogueItem; score: number; position: number }[] = [];
  items.forEach((item, position) => {
    const label = rankOf(item.label);
    const synonym = item.synonyms
      .map(rankOf)
      .reduce<number | null>(
        (best, rank) =>
          rank === null ? best : best === null ? rank : Math.min(best, rank),
        null,
      );
    if (label === null && synonym === null) {
      return;
    }
    // Label matches sit in the band below a synonym of the same quality.
    const score = Math.min(
      label === null ? Infinity : label * 2,
      synonym === null ? Infinity : synonym * 2 + 1,
    );
    scored.push({ item, score, position });
  });

  return scored
    .sort((a, b) => a.score - b.score || a.position - b.position)
    .map(({ item }) => item);
}
