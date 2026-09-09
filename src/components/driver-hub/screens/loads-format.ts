/**
 * Display formatters for the load board, shared by the board shell (task-09)
 * and by every Wave 4 surface — the desktop table (task-10), the detail drawer
 * (task-11), the claim dialogs (task-12) and the mobile board (task-13).
 *
 * Mirrors the per-screen `*-format.ts` convention the hub already uses
 * (`jobs-format.ts`, `earnings-format.ts`, `drivers-format.ts`, …): this is
 * *this feature's* formatting module, not a central one. Wave 4 adds to this
 * file rather than creating a second — a per-task formatter file would put two
 * spellings of "₾190" on the same screen within a week.
 *
 * ## The money rule, stated where the money is formatted
 *
 * `Order.price` is what the **client** pays. The driver earns 85% of it,
 * resolved and stored at booking in `Order.driverPayout`, and that is the only
 * money figure this feature is allowed to render. `GET /api/loads` enforces
 * this at the query — its select never reads `price`, `baseFare`,
 * `distanceFare`, `timeFare`, `helperFee`, `overtimeFee` or
 * `serviceLevelAdjustment` at all, so the leak is impossible rather than
 * merely avoided — and the formatters below name their parameters after the
 * payout so a call site passing anything else reads wrong on sight.
 *
 * ## Typography
 *
 * Nothing here emits markup, so the `font-price` (IBM Plex Mono) and
 * `tabular-nums` classes every numeric on this surface carries are the caller's
 * job. These functions only guarantee that two callers printing the same number
 * print the same characters.
 */

import type { CargoHandlingTag } from "@prisma/client";

import type { VehicleCapability } from "@/lib/orders/vehicle-fit";

/**
 * Whole lari, no decimals.
 *
 * Payouts on this board are three-figure sums where the tetri are noise: the
 * design prints "₾190", and a driver comparing rows down a column reads the
 * magnitude, not the change. `driverPayout` is stored as a rounded currency
 * value anyway (see `roundCurrency` in `src/lib/pricing.ts`), so nothing
 * meaningful is being hidden.
 *
 * `en-GB` rather than a Georgian locale for the same reason the rest of this
 * codebase uses it: the hub's numerals are Western Arabic with comma grouping
 * throughout, and switching locale here alone would make one column disagree
 * with every other.
 */
const gelFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * `190` → `"₾190"`.
 *
 * **Never call this with `Order.price` or any fare component.** The parameter
 * is named `driverPayout` so that a call site handing it something else is
 * visibly wrong; see the module comment.
 */
export function formatGel(driverPayout: number): string {
  return `₾${gelFormatter.format(driverPayout)}`;
}

/**
 * The per-kilometre sub-line: `6` → `"₾6/km"`, `null` → `"—"`.
 *
 * Nullable because `GET /api/loads` returns `ratePerKm: null` for a load whose
 * `distanceKm` is zero — a division it refuses to put `Infinity` into a JSON
 * response for. Rare, but it reaches the UI as a real value and an em dash is
 * the honest rendering of it.
 *
 * Two decimals rather than `formatGel`'s zero: a rate is frequently under ₾10,
 * where rounding to whole lari turns ₾6.40 and ₾5.60 into the same figure and
 * destroys the one comparison the sub-line exists to support.
 */
const gelPerKmFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatGelPerKm(driverRatePerKm: number | null): string {
  return driverRatePerKm === null
    ? EM_DASH
    : `₾${gelPerKmFormatter.format(driverRatePerKm)}/km`;
}

/**
 * The single placeholder for every absent value on this surface.
 *
 * A shared constant rather than a literal per call site: the board has a lot of
 * nullable columns (weight, dimensions, pickup window, deadline,
 * distance-from-driver) and a mix of "—", "-" and "–" down one table is the
 * kind of inconsistency nobody files but everybody notices.
 */
export const EM_DASH = "—";

const weightFormatter = new Intl.NumberFormat("en-GB");

/** `820` → `"820 kg"`; `1200` → `"1,200 kg"`; `null` → `"—"`. */
export function formatWeightKg(weightKg: number | null): string {
  return weightKg === null ? EM_DASH : `${weightFormatter.format(weightKg)} kg`;
}

const distanceFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/**
 * `18.4` → `"18.4 km"`; `null` → `"—"`.
 *
 * Nullable for `pickupDistanceKm`, which degrades rather than being omitted:
 * `DriverProfile.currentLat/currentLng` are frequently stale or absent and an
 * order booked against an ungeocodable address has no pickup point at all
 * (`specs/driver-load-board/requirements.md`, Assumptions).
 */
export function formatDistanceKm(distanceKm: number | null): string {
  return distanceKm === null
    ? EM_DASH
    : `${distanceFormatter.format(distanceKm)} km`;
}

/**
 * A vehicle's hold, or a load's box: `"3.2 × 1.7 × 1.9 m"`.
 *
 * Takes the three axes as a structural slice rather than a `VehicleCapability`
 * proper, so the same function prints a load's declared `cargoLengthM`/
 * `cargoWidthM`/`cargoHeightM` — the two are the same three numbers with
 * different names on either side of the fit comparison.
 *
 * `toFixed(1)` unconditionally: a hold quoted as "3 × 1.7 × 1.9" beside one
 * quoted as "3.2 × 1.7 × 1.9" reads as a different kind of measurement rather
 * than a rounder one.
 *
 * **`Infinity` is a real input, not a bug.** `capabilityOf` translates a
 * `cargoHeightM` of `0` — the catalogue's "open bed, no height limit" sentinel,
 * seeded for `FLATBED_TRUCK` — into `Infinity`, and `toFixed` would render that
 * as the literal string "Infinity". An open bed prints "open" instead.
 */
export function formatDims(dims: {
  lengthM: number;
  widthM: number;
  heightM: number;
}): string {
  const height = Number.isFinite(dims.heightM)
    ? dims.heightM.toFixed(1)
    : "open";

  return `${dims.lengthM.toFixed(1)} × ${dims.widthM.toFixed(1)} × ${height} m`;
}

/**
 * A load's own declared box, where any of the three axes may be undeclared.
 *
 * Separate from `formatDims` rather than folded into it with nullable
 * parameters: a vehicle capability is *always* complete by construction (that
 * is what `capabilityOf` resolves away), and widening the vehicle formatter to
 * accept nulls would lose that guarantee at every call site to serve the one
 * that needs it. Returns `"—"` when any axis is missing — a partial box
 * ("3.2 × — × 1.9 m") describes nothing a driver can act on.
 */
export function formatLoadDims(dims: {
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
}): string {
  const { lengthM, widthM, heightM } = dims;

  if (lengthM === null || widthM === null || heightM === null) {
    return EM_DASH;
  }

  return formatDims({ lengthM, widthM, heightM });
}

/** `1, "load"` → `"1 load"`; `3, "load"` → `"3 loads"`. */
export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * The board's six handling tags in **`CargoHandlingTag` declaration order**,
 * with the copy a driver reads.
 *
 * The order is the contract, and it is load-bearing rather than incidental.
 * Pills are sorted by this list — not by the order the tags happen to sit in
 * `Order.handlingTags` (an array the client's booking form appends to in
 * whatever order the checkboxes were ticked) and not alphabetically. Two loads
 * carrying the same two tags must render the same two pills in the same two
 * positions, or a driver scanning a column of rows has to read each pill rather
 * than recognising its place.
 *
 * Declaration order also happens to run most-consequential-first — Fragile and
 * Cold chain and Hazmat change how the job is driven, the last three change
 * only how it is lifted — so the leading pills are the ones worth seeing when
 * a narrow row truncates the rest.
 *
 * Kept in sync with `enum CargoHandlingTag` in `prisma/schema.prisma` by the
 * `satisfies` clause, which turns an added enum member into a type error here
 * rather than a tag that silently renders as its raw `SCREAMING_SNAKE` name.
 * The generated enum is imported as a *type* only, so this module still costs a
 * client bundle nothing at runtime.
 */
export const HANDLING_TAG_LABELS = [
  { value: "FRAGILE", label: "Fragile" },
  { value: "COLD_CHAIN", label: "Cold chain" },
  { value: "HAZMAT", label: "Hazmat" },
  { value: "TIME_CRITICAL", label: "Time critical" },
  { value: "UPRIGHT_ONLY", label: "Upright only" },
  { value: "HEAVY_ITEM", label: "Heavy item" },
] as const satisfies readonly { value: CargoHandlingTag; label: string }[];

/**
 * One of the six `CargoHandlingTag` values, as a plain string union.
 *
 * Derived from the table rather than aliased to the Prisma enum so that the
 * board's own code never has to import the generated enum: `GET /api/loads`
 * hands `handlingTags` across the wire as `string[]`, and this is the narrowing
 * back.
 */
export type HandlingTag = (typeof HANDLING_TAG_LABELS)[number]["value"];

/**
 * Sort a load's handling tags into `HANDLING_TAG_LABELS` order and pair each
 * with its label — the one function every surface that renders tag pills
 * should call.
 *
 * `GET /api/loads` types `handlingTags` as `string[]` (it crosses the wire as
 * JSON), so an unrecognised value is possible in principle — a tag added to the
 * Prisma enum and not to the table above. Those are dropped rather than
 * rendered raw: a pill reading "REFRIGERATED_ONLY" is worse than a missing one,
 * and the `satisfies` on the table is what stops it happening in the first
 * place.
 */
export function sortedHandlingTags(
  tags: readonly string[],
): { value: HandlingTag; label: string }[] {
  return HANDLING_TAG_LABELS.filter((entry) => tags.includes(entry.value)).map(
    (entry) => ({ value: entry.value, label: entry.label }),
  );
}

/**
 * A compile-time assertion that the table above covers the Prisma enum
 * *exhaustively*, not merely soundly.
 *
 * The `satisfies` clause on `HANDLING_TAG_LABELS` catches a value that is not a
 * `CargoHandlingTag`; it says nothing about a `CargoHandlingTag` that is
 * missing from the table — which is the direction a schema change actually
 * breaks in. This alias fails to resolve to `true` in that case, so adding a
 * seventh tag to `prisma/schema.prisma` without adding its copy here is a type
 * error at build rather than a pill that never renders.
 */
type HandlingTagsAreExhaustive = CargoHandlingTag extends HandlingTag
  ? true
  : never;

/** Referenced only so the assertion above is actually checked. */
export const HANDLING_TAGS_COVER_SCHEMA: HandlingTagsAreExhaustive = true;

/**
 * Re-exported so Wave 4 surfaces get the capability shape without a second
 * import path to reason about — `formatDims` is the only reason they need it.
 */
export type { VehicleCapability };
