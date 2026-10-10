/**
 * Homepage display rules for vehicle types — which ones the public marketing
 * surfaces show, and in what order — plus the id validation behind the admin
 * reorder endpoint.
 *
 * Deliberately free of `server-only`, Prisma imports and Prisma types in its
 * signatures: the landing hook runs `orderForHomepage` in the browser, and
 * `tests/vehicle-homepage-display.spec.ts` runs both functions as plain
 * object-in, object-out checks with no database.
 *
 * **Homepage only.** The signed-in booking form, driver onboarding, vehicle
 * forms, pricing, orders and the load board never call into this module; they
 * keep their own ordering and see hidden types as usual.
 */

/** The duty classes in the order the homepage renders them (Medium, then Heavy). */
const CATEGORY_RANK: Readonly<Record<string, number>> = {
  MEDIUM_DUTY: 0,
  HEAVY_DUTY: 1,
};

/**
 * The fields `orderForHomepage` reads. The two display fields are optional so a
 * response from a deployment that predates them reads as "visible, unordered",
 * which degrades to the old category-then-label order rather than to an empty
 * homepage.
 */
export type HomepageDisplayFields = {
  category: string;
  label: string;
  showOnHomepage?: boolean;
  homepageSortOrder?: number;
};

/** Rank of a category; an unknown one sorts after both known classes. */
function categoryRank(category: string): number {
  return CATEGORY_RANK[category] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The vehicle types the homepage should show, in homepage order: hidden types
 * removed, then category, then `homepageSortOrder`, then `label` as the
 * tie-break (so two types left at the same position still read alphabetically,
 * which is also the order the migration backfilled).
 *
 * Returns a new array; the input is not mutated.
 */
export function orderForHomepage<VehicleType extends HomepageDisplayFields>(
  vehicleTypes: readonly VehicleType[],
): VehicleType[] {
  return vehicleTypes
    .filter((vehicleType) => vehicleType.showOnHomepage !== false)
    .sort(
      (a, b) =>
        categoryRank(a.category) - categoryRank(b.category) ||
        (a.homepageSortOrder ?? 0) - (b.homepageSortOrder ?? 0) ||
        a.label.localeCompare(b.label, "en"),
    );
}

/** Upper bound on a reorder request's `ids`; the catalogue is eleven rows. */
export const MAX_VEHICLE_REORDER_IDS = 100;

/** One row whose homepage position a reorder changes. */
export type VehicleHomepageMove = { id: string; from: number; to: number };

/** Outcome of validating a reorder request against the category's rows. */
export type VehicleReorderPlan =
  | { ok: true; order: string[]; moves: VehicleHomepageMove[] }
  /** `ids` is not a non-empty list of distinct, non-empty strings. */
  | { ok: false; reason: "invalid_ids" }
  /** An id is not a row of the category (stale list, or another category). */
  | { ok: false; reason: "foreign_ids" };

/**
 * Validates a reorder request and works out what to write.
 *
 * `rows` is the category's current rows in their current homepage order;
 * `ids` is the requested order, first to last. Rows the request leaves out keep
 * their relative order and go after the listed ones, and every row is
 * renumbered to its index — a dense `0..n-1` with no ties. Only rows whose
 * position actually changes are returned as moves.
 *
 * Mirrors `PUT /api/admin/content/home-page-sections/reorder`, extracted here
 * so the rule can be tested without a database.
 */
export function planVehicleReorder(
  rows: readonly { id: string; homepageSortOrder: number }[],
  ids: unknown,
): VehicleReorderPlan {
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_VEHICLE_REORDER_IDS ||
    !ids.every((id) => typeof id === "string" && id !== "") ||
    new Set(ids).size !== ids.length
  ) {
    return { ok: false, reason: "invalid_ids" };
  }

  const orderedIds = ids as string[];
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  if (!orderedIds.every((id) => rowsById.has(id))) {
    return { ok: false, reason: "foreign_ids" };
  }

  const listed = new Set(orderedIds);
  const order = [
    ...orderedIds,
    ...rows.filter((row) => !listed.has(row.id)).map((row) => row.id),
  ];

  const moves = order.flatMap((id, index) => {
    const row = rowsById.get(id);
    return row !== undefined && row.homepageSortOrder !== index
      ? [{ id, from: row.homepageSortOrder, to: index }]
      : [];
  });

  return { ok: true, order, moves };
}
