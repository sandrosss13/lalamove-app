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
 * ## Every Wave 4 local fork now lives here
 *
 * The four Wave 4 surfaces were written simultaneously with this file fenced to
 * one of them, so the drawer, the claim dialogs and the mobile board each grew
 * a private copy of the helpers they needed — and the copies had already
 * diverged: the drawer printed a deadline as "4 Aug, 18:00" (one `Intl` pattern
 * with day, month and clock together, which `en-GB` comma-separates) where the
 * dialogs printed "4 Aug 18:00" (day-month and clock composed). They are folded
 * back in below, and **new surfaces import from here rather than re-deriving**:
 * that comma was invisible until the two strings were read side by side, which
 * is exactly how formatter drift always presents.
 *
 * Two differences between surfaces survived the merge because they are
 * deliberate, and each is documented where it is implemented: `formatPostedAgo`
 * prefixes the relative age it shares with the drawer's "claimed N ago" line,
 * and the claim dialogs name a date absolutely where the board names it
 * relatively.
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

import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";
import {
  HUB_TIME_ZONE,
  hubCivilDate,
  hubDayNumber,
} from "@/lib/dashboard/hub/timezone";
import type { VehicleCapability } from "@/lib/orders/vehicle-fit";

/**
 * Whole lari, no decimals — the **scannable** form, for a column of figures
 * being compared rather than a figure being agreed to.
 *
 * Payouts on this board are three-figure sums where the tetri are noise when
 * rows are read against each other: the design prints "₾190", and a driver
 * running an eye down a column reads the magnitude, not the change.
 *
 * **The tetri this drops are real, and they are not recoverable from the
 * output.** An earlier version of this comment claimed `driverPayout` "is
 * stored as a rounded currency value anyway, so nothing meaningful is being
 * hidden"; that was wrong. `driverPayoutFor` (`src/lib/orders/payout.ts`)
 * returns `roundCurrency(...)`, and `roundCurrency` (`src/lib/pricing.ts`) is
 * `Math.round(value * 100) / 100` — it rounds to **tetri, not to lari**.
 * Fractional payouts are therefore routine, and `Intl` rounds half away from
 * zero, so a stored `109.50` renders here as "₾110": a figure inflated in the
 * driver's favour, which is the worst direction to be wrong in on a number
 * somebody is about to commit to.
 *
 * So: this formatter for the table column and any other place the number is one
 * of many being scanned; `formatGelExact` below wherever the number *is* the
 * answer.
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
 * Every tetri that is actually there: `109` → `"₾109"`, `109.5` → `"₾109.5"`,
 * `109.23` → `"₾109.23"`.
 *
 * **The form for money a driver commits to or is owed**, as opposed to money
 * being skimmed: the confirm dialog's "You are paid" line — the single figure
 * the whole dialog exists to have a driver agree to — and the drawer's and
 * detail sheet's headline payout, which is that same figure read one step
 * earlier. Those must equal the amount that will land, to the tetri;
 * `formatGel`'s rounding does not, and rounds upward half the time.
 *
 * `minimumFractionDigits: 0` rather than `2` so a whole payout still reads
 * "₾190" and not "₾190.00": the overwhelming majority of these figures are
 * whole, and forcing two zeros onto all of them to serve the minority would
 * make the common case noisier to read while fixing nothing.
 *
 * The options are identical to `gelPerKmFormatter`'s and the duplication is
 * deliberate — two different rules (a committed sum must be exact; a per-km
 * rate must not collapse ₾6.40 and ₾5.60 into one number) that happen to land
 * on the same precision. Sharing one formatter between them would make a future
 * change to either silently change the other.
 *
 * **Never call this with `Order.price` or any fare component**, on the same
 * terms as `formatGel`; see the module comment.
 */
const gelExactFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatGelExact(driverPayout: number): string {
  return `₾${gelExactFormatter.format(driverPayout)}`;
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
 * A load's declared box as a volume: `"3.7 m³"`, or `"—"` when any axis is
 * undeclared.
 *
 * One decimal, matching the design's `vol` and `formatLoadDims`' own precision:
 * quoting a cubic metre to three places implies a survey nobody did — these are
 * three numbers a client typed into a booking form.
 *
 * Null-tolerant on the same terms as `formatLoadDims` and for the same reason —
 * a volume computed from two of three axes is not a smaller number, it is a
 * wrong one.
 */
export function formatVolumeM3(dims: {
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
}): string {
  const { lengthM, widthM, heightM } = dims;

  if (lengthM === null || widthM === null || heightM === null) {
    return EM_DASH;
  }

  return `${(lengthM * widthM * heightM).toFixed(1)} m³`;
}

/**
 * The cargo category's display copy, falling back to the raw enum value.
 *
 * `HubLoad.cargoCategory` is typed `string` rather than `CargoCategory` — it
 * crosses the wire as JSON, where the enum is gone — so the
 * `Record<CargoCategory, string>` lookup is widened here instead of the row
 * being cast back. An unrecognised value renders as itself: seeing
 * `RETAIL_STOCK` in a summary is ugly, but it names the cargo, which the blank
 * an assertion-plus-`undefined` would produce does not. A category added to the
 * schema without copy fails typecheck in `src/lib/cargo.ts` long before it
 * could reach the fallback.
 */
const CARGO_CATEGORY_LABEL_BY_VALUE: Record<string, string> =
  CARGO_CATEGORY_LABELS;

export function cargoCategoryLabel(cargoCategory: string): string {
  return CARGO_CATEGORY_LABEL_BY_VALUE[cargoCategory] ?? cargoCategory;
}

/**
 * `"No helpers requested"` / `"1 helper requested"` / `"2 helpers requested"`.
 *
 * "No helpers requested" rather than "0 helpers": the sentence answers "does
 * this job need a second pair of hands", and a zero reads as a quantity
 * somebody chose rather than as a request nobody made.
 */
export function formatHelperRequest(helperCount: number): string {
  return helperCount === 0
    ? "No helpers requested"
    : `${pluralise(helperCount, "helper")} requested`;
}

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `09:40`. 24-hour and pinned to `HUB_TIME_ZONE`, exactly as `jobs-format.ts`
 * pins its own.
 *
 * Reproduced here rather than imported from `jobs-format.ts` because this hub
 * keeps one formatter module per screen (see that file's own header, and
 * `vehicles-format.ts` / `drivers-format.ts`), and a cross-screen import is the
 * first step towards one screen's copy changing another's. The *zone* is shared
 * — it comes from `@/lib/dashboard/hub/timezone`, which is the single definition
 * of what a Tbilisi day is — so the two modules cannot drift on the thing that
 * actually matters.
 */
const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: HUB_TIME_ZONE,
});

/** `4 Aug` — a date inside the current Tbilisi year, where the year is noise. */
const dayMonthFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: HUB_TIME_ZONE,
});

/** `4 Aug 2025` — a date in another year, where it is not. */
const dayMonthYearFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: HUB_TIME_ZONE,
});

/**
 * `4 August 2025 at 18:00` — the unabbreviated form, for the `title` on a line
 * that shows only a clock.
 */
const fullTimestampFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: HUB_TIME_ZONE,
});

/**
 * An ISO timestamp as a `Date`, or `null` when there is nothing usable to
 * parse.
 *
 * Every timestamp on this board crosses the wire as JSON — `JSON.parse` revives
 * no dates — so every one of them is a parse that can fail. It never should,
 * but `Intl.DateTimeFormat.prototype.format` throws a `RangeError` on an
 * `Invalid Date` rather than degrading, and a thrown formatter takes the whole
 * board down over one malformed field. Every public function below routes its
 * input through here, so absent and unusable collapse to the same answer.
 */
function parseIso(iso: string | null): Date | null {
  if (iso === null) {
    return null;
  }

  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** `"2025-08-04T09:40:00Z"` → `"09:40"`; absent or unusable → `"—"`. */
export function formatClock(iso: string | null): string {
  const date = parseIso(iso);

  return date === null ? EM_DASH : clockFormatter.format(date);
}

/**
 * The long form for a `title` attribute, or `undefined` so no tooltip is
 * attached at all.
 *
 * `undefined` rather than `"—"`: a tooltip that says nothing is worse than no
 * tooltip, because it still has to be hovered to find that out.
 */
export function formatFullTimestamp(iso: string | null): string | undefined {
  const date = parseIso(iso);

  return date === null ? undefined : fullTimestampFormatter.format(date);
}

/**
 * `"4 Aug 18:00"` — a date and a clock time with no relative day label at all;
 * absent or unusable → `"—"`.
 *
 * Composed from `dayMonthFormatter` and `clockFormatter` rather than asked of
 * one `Intl.DateTimeFormat` carrying day, month, hour and minute together:
 * `en-GB` renders that combination as `"4 Aug, 18:00"`, and the comma is the
 * kind of difference that goes unnoticed until two surfaces print the same
 * deadline side by side. One composition, one spelling.
 *
 * **Absolute on purpose, where it is used.** The claim dialogs name every
 * instant this way instead of through `formatLoadDayLabel`'s
 * Today/Tomorrow copy, because a relative label needs a "now" to compare
 * against, and a confirmation dialog can sit open across Tbilisi midnight and go
 * on insisting the pick-up is "Today" on the one screen where a driver commits
 * to it. The board's own rows, which re-render on a timer, use the relative
 * form.
 */
export function formatAbsoluteDateTime(iso: string | null): string {
  const date = parseIso(iso);

  return date === null
    ? EM_DASH
    : `${dayMonthFormatter.format(date)} ${clockFormatter.format(date)}`;
}

/**
 * `"4 Aug 14:00–16:00"` — a pick-up window named absolutely; `"—"` when either
 * end is missing or unusable.
 *
 * The absolute sibling of `formatPickupWindow`, for the reason
 * `formatAbsoluteDateTime` states. Both ends are required because half a window
 * ("14:00–") describes nothing a driver can plan around, and the en dash is the
 * typographic range separator, not a hyphen.
 */
export function formatAbsoluteWindow(
  startIso: string | null,
  endIso: string | null,
): string {
  const start = parseIso(startIso);
  const end = parseIso(endIso);

  if (start === null || end === null) {
    return EM_DASH;
  }

  return `${dayMonthFormatter.format(start)} ${clockFormatter.format(start)}–${clockFormatter.format(end)}`;
}

/**
 * Which Tbilisi calendar day and year an instant falls on.
 *
 * A day *number* rather than a formatted date so two days can simply be
 * subtracted — `Date` offers no way to count calendar days across a zone, and
 * dividing a millisecond difference puts the boundary an hour out the first time
 * a zone gains DST.
 */
function civilDate(date: Date): { dayNumber: number; year: number } {
  return { dayNumber: hubDayNumber(date), year: hubCivilDate(date).year };
}

/**
 * `"Today"` / `"Tomorrow"` / `"Yesterday"` / `"4 Aug"` / `"4 Aug 2025"`.
 *
 * Unlike `jobs-format.ts`'s equivalent, today is spelled out rather than
 * returning `null`. Job history is read as a list of things that already
 * happened, so a bare `09:40` there unambiguously means this morning; a load
 * board is read forwards, and a bare `14:00–16:00` on a row a driver is deciding
 * whether to accept is precisely the string that gets misread as "this
 * afternoon" when it is tomorrow's.
 *
 * "Tomorrow" earns its place here for the same reason: most pick-up dates on an
 * open board are in the future.
 *
 * **This is the table's and the card's Pick-up date formatter**, reading
 * `HubLoad.scheduledAt` — which is why `iso` is nullable. `scheduledAt` is a
 * required field of the booking form and of `POST /api/orders`, so a load booked
 * through the live UI always carries one; it is nullable on the column only
 * because orders predating its migration were never backfilled, and because the
 * hub's seed scripts deliberately leave some unset. Those rows dash here, which
 * is the same treatment every other absent value on this surface gets and the
 * reason this returns `EM_DASH` rather than throwing or guessing.
 *
 * It deliberately does **not** fall back to `pickupWindowStart`. That pair is an
 * independent, optional refinement a client usually leaves at "Any time" — see
 * `Order.pickupWindowStart` in `prisma/schema.prisma` — so substituting it would
 * answer "when is this booked for" with a different question's answer, and would
 * dash more often than the field it was covering for.
 */
export function formatLoadDayLabel(iso: string | null, nowIso: string): string {
  const date = parseIso(iso);

  return date === null ? EM_DASH : dayLabelOf(date, nowIso);
}

/**
 * The minute of the Tbilisi day an instant falls on — `09:40` → `580`; absent
 * or unusable → `null`.
 *
 * Exists for one caller: the ordering behind the table's **Pick-up time**
 * column. Sorting that header on `scheduledAt` itself would order rows
 * chronologically, which is what the *Pick-up date* header beside it already
 * does and which would float a 23:00 pick-up today above a 07:00 one tomorrow —
 * the opposite of what a driver asking a time column for "earliest start" means.
 * Time of day is the only ordering that makes the header true.
 *
 * Derived by reading `clockFormatter`'s own output back rather than by
 * configuring `Intl` a second time. The number then orders exactly what the
 * column prints, in exactly the zone it prints it in, so a change to
 * `HUB_TIME_ZONE` moves the display and the sort together instead of leaving one
 * of them behind.
 */
export function hubMinuteOfDay(iso: string | null): number | null {
  const date = parseIso(iso);

  if (date === null) {
    return null;
  }

  // `clockFormatter` is `hour12: false` with two-digit fields, so this is always
  // exactly `HH:MM`. Both halves are still parsed defensively because
  // `noUncheckedIndexedAccess` is on and because some ICU builds render midnight
  // as "24:00" — `% 24` folds that back onto the zero it means.
  const parts = clockFormatter.format(date).split(":");
  const hours = Number.parseInt(parts[0] ?? "", 10);
  const minutes = Number.parseInt(parts[1] ?? "", 10);

  return Number.isNaN(hours) || Number.isNaN(minutes)
    ? null
    : (hours % 24) * MINUTES_PER_HOUR + minutes;
}

/**
 * The same label over an already-parsed instant.
 *
 * Split out so the window and deadline formatters below — which have to parse
 * anyway, to print the clock time — do not parse the same string twice and do
 * not have to re-prove to the type checker that a string they already validated
 * is non-null.
 */
function dayLabelOf(date: Date, nowIso: string): string {
  const then = civilDate(date);
  const now = civilDate(new Date(nowIso));
  const dayDelta = now.dayNumber - then.dayNumber;

  if (dayDelta === 0) {
    return "Today";
  }

  if (dayDelta === 1) {
    return "Yesterday";
  }

  if (dayDelta === -1) {
    return "Tomorrow";
  }

  return then.year === now.year
    ? dayMonthFormatter.format(date)
    : dayMonthYearFormatter.format(date);
}

/**
 * `"Today 14:00–16:00"`, `"Tomorrow 09:00"`, or `"—"`.
 *
 * Both bounds are nullable on `HubLoad` because an order can be booked with no
 * requested slot at all, and the three cases are genuinely different:
 *
 * - no start → there is no window, and `"—"` says so;
 * - start but no end → an open-ended "from 09:00", printed as the single time
 *   rather than as `"09:00–—"`, which reads as a rendering failure;
 * - both → the range, with an en dash (the typographic range separator), not a
 *   hyphen.
 *
 * The day label is taken from the *start*: a window that crosses Tbilisi
 * midnight is labelled by the day the driver has to be there.
 */
export function formatPickupWindow(
  startIso: string | null,
  endIso: string | null,
  nowIso: string,
): string {
  const start = parseIso(startIso);

  if (start === null) {
    return EM_DASH;
  }

  const opening = `${dayLabelOf(start, nowIso)} ${clockFormatter.format(start)}`;
  const end = parseIso(endIso);

  return end === null ? opening : `${opening}–${clockFormatter.format(end)}`;
}

/**
 * `"Deliver by Today 20:00"`, or `null` when the order carries no deadline.
 *
 * `null` rather than `"—"` so the caller omits the sub-line entirely instead of
 * printing a labelled em dash. This line is supplementary context under the
 * pick-up window; a row that has no deadline is better with one line than with
 * two where the second says nothing.
 */
export function formatDeadlineLine(
  deadlineIso: string | null,
  nowIso: string,
): string | null {
  const deadline = parseIso(deadlineIso);

  if (deadline === null) {
    return null;
  }

  return `Deliver by ${dayLabelOf(deadline, nowIso)} ${clockFormatter.format(deadline)}`;
}

/**
 * Bucket boundaries for `formatRelativeAgo`, named so the thresholds read.
 * `MINUTES_PER_HOUR` is `hubMinuteOfDay`'s multiplier as well — the same fact,
 * so the same constant.
 */
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/**
 * How long ago an instant was, unprefixed: `"just now"` / `"14 min ago"` /
 * `"2h ago"` / `"3d ago"`. `null` when it cannot be said honestly.
 *
 * The one implementation of this board's bucketing rule. Two surfaces phrase it
 * differently — the table's Route line reads "posted 14 min ago", the drawer's
 * claimed note reads "Claimed by another driver 4 min ago" — and a sentence
 * fragment is the only thing they can share without one of them owning the
 * other's copy. `formatPostedAgo` below is the prefixing wrapper.
 *
 * Coarse buckets on purpose: the difference between 14 and 15 minutes changes
 * no decision, and a string that re-rendered every second would. "min" takes no
 * plural — it is a unit abbreviation, not a word — so `pluralise` is not
 * involved.
 *
 * `null` in two cases, both of which mean the caller should fall back to a
 * sentence with no age in it rather than print a number it cannot stand behind:
 *
 * - an unusable timestamp;
 * - an instant in the *future*. `createdAt` and `updatedAt` come from the
 *   database clock and `nowIso` from the browser's, so a row written seconds
 *   ago legitimately arrives "in the future" on a device whose clock runs slow.
 *   `"in 2 min ago"` would be the only visible symptom of a skew nobody can act
 *   on.
 */
export function formatRelativeAgo(
  instantIso: string,
  nowIso: string,
): string | null {
  const instant = parseIso(instantIso);
  const now = parseIso(nowIso);

  if (instant === null || now === null) {
    return null;
  }

  const elapsedMs = now.getTime() - instant.getTime();

  if (elapsedMs < 0) {
    return null;
  }

  const minutes = Math.floor(elapsedMs / MS_PER_MINUTE);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < MINUTES_PER_HOUR) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);

  if (hours < HOURS_PER_DAY) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / HOURS_PER_DAY)}d ago`;
}

/**
 * `"posted just now"` / `"posted 14 min ago"` / `"posted 2h ago"` /
 * `"posted 3d ago"`.
 *
 * How long a load has sat unclaimed is the cheapest signal a driver has that
 * something about it is off — a well-paid, well-located row that nobody has
 * taken in three days usually has a reason.
 *
 * The two cases `formatRelativeAgo` refuses to name both collapse to "just
 * now" here rather than to nothing, because this fragment sits in the middle of
 * a row's third line where an absent phrase would read as a rendering fault
 * rather than as an unknown. That is also the pre-existing behaviour for a
 * future `createdAt`, which this wrapper preserves exactly.
 */
export function formatPostedAgo(createdAtIso: string, nowIso: string): string {
  return `posted ${formatRelativeAgo(createdAtIso, nowIso) ?? "just now"}`;
}

/**
 * Re-exported so Wave 4 surfaces get the capability shape without a second
 * import path to reason about — `formatDims` is the only reason they need it.
 */
export type { VehicleCapability };
