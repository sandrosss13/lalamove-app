/**
 * Pure geometry, formatting and filter vocabulary for the Fleet Availability
 * board.
 *
 * Everything here is a plain function of its arguments — no React, no Prisma, no
 * `Date.now()`. The board, the two dialogs and the export route all read the
 * same values from here, which is what keeps the spreadsheet from disagreeing
 * with the screen: a bar's hours, its label and its status word are computed
 * once, in one place.
 *
 * The unit throughout is a **decimal hour inside the board's day** — `13.5` is
 * 13:30, `24` is midnight at the far edge. The loader hands blocks over in that
 * unit already (see `@/lib/dashboard/hub/fleet-availability`), so nothing in the
 * rendering path ever touches a timestamp or a time zone.
 */
import type {
  HubAvailabilityBlock,
  HubAvailabilityStatus,
} from "@/lib/dashboard/hub/fleet-availability";

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

/** Minutes the board snaps a drag to, and the smallest gap it will call free. */
export const SNAP_MINUTES = 15;

/** `13.5` → `"13:30"`. `24` prints as `"24:00"`, which is the board's right edge. */
export function formatHour(hour: number): string {
  const totalMinutes = Math.round(hour * 60);

  if (totalMinutes >= 24 * 60) {
    return "24:00";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** A duration in hours as the tooltip prints it: `"2.5 h"`. */
export function formatDuration(hours: number): string {
  // Two decimals would print "1.00 h" for the commonest case; one keeps the
  // quarter-hours the board snaps to exact ("1.5 h", "0.25 h" → "0.3 h" is the
  // one lossy case, and a 15-minute bar is below the label threshold anyway).
  return `${Number(hours.toFixed(2))} h`;
}

/** Rounds an hour to the nearest {@link SNAP_MINUTES}. */
export function snapHour(hour: number): number {
  const perHour = 60 / SNAP_MINUTES;

  return Math.round(hour * perHour) / perHour;
}

/** Keeps an hour inside `[min, max]`. */
export function clampHour(hour: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, hour));
}

/* -------------------------------------------------------------------------- */
/* Status vocabulary                                                          */
/* -------------------------------------------------------------------------- */

/**
 * How a status is named and painted.
 *
 * The colours are CSS custom properties rather than the handoff's literal hexes
 * because this app has a light **and** a dark theme — `globals.css` defines each
 * of these names twice, and a hardcoded `#eef7f1` bar would be an invisible
 * white smear on the dark board. The names are the contract; the values live in
 * `src/app/globals.css` next to every other token.
 */
export type AvailabilityStatusMeta = {
  /** The legend's and the export's word for it. */
  label: string;
  /** The shorter word a bar prints when it has room for one but not two. */
  shortLabel: string;
  /** `var(--…)` fill, which may be a gradient. */
  background: string;
  color: string;
  border: string;
};

export const AVAILABILITY_STATUS: Record<
  HubAvailabilityStatus,
  AvailabilityStatusMeta
> = {
  available: {
    label: "Available",
    shortLabel: "Available",
    background: "var(--hub-avail-available-bg)",
    color: "var(--hub-avail-available-fg)",
    border: "1px solid var(--hub-avail-available-border)",
  },
  assigned: {
    label: "Assigned / on order",
    shortLabel: "Assigned",
    background: "var(--hub-avail-assigned-bg)",
    color: "var(--hub-avail-assigned-fg)",
    border: "1px solid var(--hub-avail-assigned-border)",
  },
  enroute: {
    label: "En route",
    shortLabel: "En route",
    background: "var(--hub-avail-enroute-bg)",
    color: "var(--hub-avail-enroute-fg)",
    border: "1px solid var(--hub-avail-enroute-border)",
  },
  booked: {
    label: "Booked (future)",
    shortLabel: "Booked",
    background: "var(--hub-avail-booked-bg)",
    color: "var(--hub-avail-booked-fg)",
    border: "1.5px dashed var(--hub-avail-booked-border)",
  },
};

/**
 * The order the legend and the status filter list them in — committed work
 * first in the order a job passes through it, `available` last as the
 * complement it is.
 */
export const AVAILABILITY_STATUS_ORDER: HubAvailabilityStatus[] = [
  "available",
  "assigned",
  "enroute",
  "booked",
];

/* -------------------------------------------------------------------------- */
/* Zoom                                                                       */
/* -------------------------------------------------------------------------- */

/** Pixels per hour, in the handoff's five steps. Index 2 (`52`) is the default. */
export const ZOOM_STEPS = [24, 34, 52, 78, 116] as const;

export const DEFAULT_ZOOM_INDEX = 2;

/**
 * How many hours apart the axis prints a label at this zoom — every hour when
 * there is room, every 2nd, then every 4th. Without this the labels overlap
 * into an unreadable smear at the narrow end.
 */
export function hourLabelStep(pixelsPerHour: number): number {
  if (pixelsPerHour >= 50) {
    return 1;
  }

  return pixelsPerHour >= 30 ? 2 : 4;
}

/* -------------------------------------------------------------------------- */
/* Capacity buckets                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The capacity filter's buckets, in kilograms.
 *
 * Applied in memory, never as a Prisma `where`: a vehicle's capacity is
 * `payloadKg ?? vehicleTypeSpec.maxPayloadKg` — a coalesce across two tables
 * that the query layer cannot express — so the rows are fetched and then
 * narrowed here.
 *
 * Bounds are exclusive-low/inclusive-high (`min < capacity <= max`) so the
 * boundary tonnages the labels name fall in the bucket that names them: a
 * 2,000 kg van is "Up to 2 t", not "2 – 8 t".
 */
export type CapacityBucket = {
  value: string;
  label: string;
  min: number;
  max: number;
};

export const CAPACITY_BUCKETS: CapacityBucket[] = [
  {
    value: "ALL",
    label: "Any capacity",
    min: 0,
    max: Number.POSITIVE_INFINITY,
  },
  { value: "S", label: "Up to 2 t", min: 0, max: 2000 },
  { value: "M", label: "2 – 8 t", min: 2000, max: 8000 },
  { value: "L", label: "8 – 18 t", min: 8000, max: 18000 },
  {
    value: "X",
    label: "18 t and above",
    min: 18000,
    max: Number.POSITIVE_INFINITY,
  },
];

/** Whether a capacity falls in a bucket. A vehicle with no known capacity never does. */
export function matchesCapacity(
  capacityKg: number | null,
  bucketValue: string,
): boolean {
  if (bucketValue === "ALL") {
    return true;
  }

  const bucket = CAPACITY_BUCKETS.find((entry) => entry.value === bucketValue);

  if (bucket === undefined || capacityKg === null) {
    return false;
  }

  return capacityKg > bucket.min && capacityKg <= bucket.max;
}

/* -------------------------------------------------------------------------- */
/* Blocks and gaps                                                            */
/* -------------------------------------------------------------------------- */

/** A stretch of free time between commitments — the complement the board draws. */
export type AvailabilityGap = {
  start: number;
  end: number;
};

/**
 * The gaps between a driver's committed blocks inside `[from, to]`.
 *
 * Walks the blocks in start order, carrying a cursor past the furthest end seen
 * so far — which is what makes overlapping blocks collapse into one busy
 * stretch instead of producing a negative-width gap between them. Anything
 * shorter than the snap interval is dropped: a four-minute crack between two
 * jobs is not a slot anybody can be dispatched into, and drawing it would litter
 * the track with slivers.
 */
export function availabilityGaps(
  blocks: HubAvailabilityBlock[],
  from: number,
  to: number,
): AvailabilityGap[] {
  const minimum = SNAP_MINUTES / 60;
  const visible = blocks
    .filter((block) => block.end > from && block.start < to)
    .sort((left, right) => left.start - right.start);

  const gaps: AvailabilityGap[] = [];
  let cursor = from;

  for (const block of visible) {
    const start = Math.max(block.start, from);

    if (start - cursor >= minimum) {
      gaps.push({ start: cursor, end: start });
    }

    cursor = Math.max(cursor, Math.min(block.end, to));
  }

  if (to - cursor >= minimum) {
    gaps.push({ start: cursor, end: to });
  }

  return gaps;
}

/** Whether any committed block covers `hour` — the summary line's "free now" test. */
export function isBusyAt(
  blocks: HubAvailabilityBlock[],
  hour: number,
): boolean {
  return blocks.some((block) => block.start <= hour && block.end >= hour);
}

/**
 * What a bar prints at the width it has been given.
 *
 * Degrades rather than ellipsising something unreadable: the reference joins the
 * status word only when there is room for both, and under ~74px the bar carries
 * no text at all and speaks through its colour and its tooltip.
 */
export function barLabel(
  status: HubAvailabilityStatus,
  reference: string,
  widthPx: number,
): string {
  const meta = AVAILABILITY_STATUS[status];

  if (widthPx > 150) {
    return `${meta.shortLabel} · ${reference}`;
  }

  return widthPx > 74 ? meta.shortLabel : "";
}
