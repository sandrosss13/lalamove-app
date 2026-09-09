"use client";

import * as React from "react";
import { X } from "lucide-react";

import { HUB_STATUS_TONE_CLASSES } from "@/components/driver-hub/hub-status";
import type { HubStatusTone } from "@/components/driver-hub/hub-status";
import {
  useLoadsBoard,
  type HubLoad,
} from "@/components/driver-hub/screens/loads-context";
import {
  EM_DASH,
  formatDistanceKm,
  formatGel,
  formatLoadDims,
  formatWeightKg,
  pluralise,
  sortedHandlingTags,
} from "@/components/driver-hub/screens/loads-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";
import { HUB_TIME_ZONE } from "@/lib/dashboard/hub/timezone";
import { cn } from "@/lib/utils";

/**
 * The load board's 400px right-hand detail drawer: one load's full route, cargo
 * specification, handling requirements and the accept/reject decision.
 *
 * This is the only desktop surface that shows every handling tag, the free-text
 * packaging and quantity the client typed, and the per-load compliance warnings
 * the table's seven columns have no room for. Implements section 3 of the
 * design handoff (`UI:UX/Order Dashboard/design_handoff_driver_load_board/README.md`).
 *
 * ## The money rule
 *
 * Every figure here is `HubLoad.driverPayout` — the driver's 85% share,
 * commissioned once at booking by `driverPayoutFor` and stored on the order.
 * **`Order.price` is never read, imported, derived from or rendered.** It is
 * not merely avoided: `GET /api/loads` does not select the fare columns at all,
 * so `HubLoad` has no `price` field and reaching for one is a compile error.
 *
 * The design's header sub-line reads "incl. ₾11 waiting allowance" and
 * describes that as "6% of price, rounded". **This component computes it as 6%
 * of `driverPayout` instead**, because `price` is not and must never be
 * available to a driver-facing component. Do not "fix" this by reaching for the
 * client's fare — the substitution is deliberate and the two figures are not
 * meant to agree.
 *
 * ## `data-admin-surface` on the outermost element
 *
 * Required, and not decoration. This drawer is `position: fixed`, so it is
 * visually detached from the shell's layout, and if it is ever moved onto a
 * Radix portal it will be literally outside the shell's subtree. Without the
 * attribute the `bg-card` / `bg-muted` / `border-border` tokens it reaches for
 * resolve to the marketing site's palette instead of the hub's. Nothing errors;
 * the colours are just quietly wrong. `top-[61px]` clears the hub's sticky
 * header, which is that tall.
 *
 * ## What the two compliance notes are, and are not
 *
 * - **Hazmat is advisory, never enforcement.** Nothing in the schema gates it:
 *   `DriverLicence` carries no certification field, so any licensed driver can
 *   claim a hazmat load whether or not they hold a valid ADR certification. The
 *   note asks them to confirm it themselves. See
 *   `specs/driver-load-board/requirements.md`'s Non-Goals ("Hazmat loads are
 *   tagged and warned about, not gated") and the real compliance exposure this
 *   leaves, tracked in `specs/driver-load-board/action-required.md` under "Gate
 *   hazmat loads on driver certification".
 * - **Cold chain and body type are two different questions.** A
 *   `COLD_CHAIN` handling tag is a property of the **cargo** — what the client
 *   says the goods need. `bodyType` (`ChassisType`) is a property of the
 *   **vehicle body** the client picked and paid for at booking. They can
 *   disagree: a client can declare cold-chain cargo without having booked a
 *   refrigerated body, and `null` (no body type declared at all) is the common
 *   case on older orders. The mismatch note says so rather than silently
 *   trusting either side. The same reasoning is recorded on the
 *   `CargoHandlingTag` enum in `prisma/schema.prisma`.
 *
 * ## "Open job sheet" ships disabled
 *
 * There is no job-sheet screen to link to, and inventing one is explicitly out
 * of scope (`specs/driver-load-board/requirements.md`, Non-Goals: "The drawer's
 * 'Open job sheet' button is designed but has no destination. Render it
 * disabled with a tooltip; do not invent the screen."). The gap is tracked in
 * `specs/driver-load-board/action-required.md` under "Design the job sheet".
 * The button is `disabled` with an explanatory `title`, paired with `sr-only`
 * text carrying the same sentence — `title` alone is not reliably announced.
 *
 * ## Takes no props, by contract
 *
 * Everything comes from `useLoadsBoard()`. See the note at the top of
 * `loads-context.tsx` for why all four Wave 4 surfaces read from the context
 * rather than from props.
 */

/* -------------------------------------------------------------------------- */
/* Local formatters                                                           */
/* -------------------------------------------------------------------------- */

/**
 * **These four belong in `loads-format.ts` and should move there.**
 *
 * They are defined here only because that module was being edited concurrently
 * while this file was written, and two agents editing one file is exactly the
 * failure the Wave 4 split exists to prevent. Everything this drawer needs that
 * `loads-format.ts` already exports — `formatGel`, `formatWeightKg`,
 * `formatLoadDims`, `formatDistanceKm`, `sortedHandlingTags`, `pluralise`,
 * `EM_DASH` — is imported from it rather than re-implemented.
 *
 * Every one of them is pinned to `HUB_TIME_ZONE`, the hub's single definition of
 * what a clock time and a day are. An unzoned formatter renders a 22:30 Tbilisi
 * pickup window as "18:30" — four hours wrong on every row, and wrong about the
 * *day* for anything after 20:00. See `src/lib/dashboard/hub/timezone.ts`.
 */

/** `09:40`. 24-hour, matching every other clock time in the hub. */
const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: HUB_TIME_ZONE,
});

/** `4 Aug 18:00` — a deadline can be days out, so it carries its date. */
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: HUB_TIME_ZONE,
});

/** The unabbreviated form, for the `title` on a line that shows only a clock. */
const fullFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: HUB_TIME_ZONE,
});

/**
 * Parse an ISO timestamp, or `null` if there is nothing usable to parse.
 *
 * Guards the formatters below against `RangeError`: these strings cross the
 * wire as JSON and `new Date("")` is an `Invalid Date` that every `Intl`
 * formatter throws on rather than degrading.
 */
function parseIso(iso: string | null): Date | null {
  if (iso === null) {
    return null;
  }

  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** `"2025-08-04T09:40:00Z"` → `"09:40"`; unusable input → `"—"`. */
function formatClock(iso: string | null): string {
  const date = parseIso(iso);

  return date === null ? EM_DASH : clockFormatter.format(date);
}

/** `"2025-08-04T18:00:00Z"` → `"4 Aug 18:00"`; unusable input → `"—"`. */
function formatDeadline(iso: string | null): string {
  const date = parseIso(iso);

  return date === null ? EM_DASH : dateTimeFormatter.format(date);
}

/** The long form for a `title`, or `undefined` so no tooltip is attached. */
function formatFullTimestamp(iso: string | null): string | undefined {
  const date = parseIso(iso);

  return date === null ? undefined : fullFormatter.format(date);
}

/**
 * `"4 min ago"` — how long ago a load was claimed, or `null` when it cannot be
 * said honestly.
 *
 * Whole minutes only: the row exists for a two-minute grey-out window, so
 * seconds are noise and hours are impossible. `null` for an unparseable
 * timestamp and for one in the future (a clock skew between the driver's device
 * and the server), because "in -1 minutes" is worse than saying nothing — the
 * caller falls back to the unqualified sentence.
 *
 * Sampled at render rather than ticking. The board re-reads `GET /api/loads`
 * after every mutation and task-14 will poll it, so this label refreshes with
 * the data it describes rather than drifting on its own timer.
 */
function formatMinutesAgo(iso: string, nowMs: number): string | null {
  const date = parseIso(iso);

  if (date === null) {
    return null;
  }

  const elapsedMs = nowMs - date.getTime();

  if (elapsedMs < 0) {
    return null;
  }

  const minutes = Math.floor(elapsedMs / 60_000);

  // Not `pluralise`: "min" is a unit abbreviation and does not take an s.
  return minutes < 1 ? "just now" : `${minutes} min ago`;
}

/**
 * `3.2 × 1.7 × 1.9` → `"10.3 m³"`; any axis undeclared → `"—"`.
 *
 * Volume is not a stored column — it is derived from the three declared axes.
 * One decimal, matching `formatDistanceKm` and the Dimensions row it sits under;
 * a cubic metre quoted to three decimals implies a precision a client typing
 * "about 3 by 2" never had.
 *
 * All-or-nothing on the nulls for the same reason `formatLoadDims` is: two of
 * three axes multiply to an area, not a volume, and printing one would be
 * worse than printing nothing.
 */
function formatVolumeM3(
  lengthM: number | null,
  widthM: number | null,
  heightM: number | null,
): string {
  if (lengthM === null || widthM === null || heightM === null) {
    return EM_DASH;
  }

  return `${(lengthM * widthM * heightM).toFixed(1)} m³`;
}

/**
 * The whole-cent rounding rule used everywhere else in this codebase (see
 * `roundCurrency` in `src/lib/pricing.ts`, which is not exported).
 *
 * Local rather than imported because `pricing.ts` is a server-side pricing
 * engine and this is a `"use client"` component; the rule is one expression and
 * duplicating it costs less than widening that module's public surface.
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The cargo category's display copy, falling back to the raw enum value.
 *
 * `HubLoad.cargoCategory` is typed `string` rather than `CargoCategory` — it
 * crosses the wire as JSON — so the lookup is widened here instead of the row
 * being cast. An unrecognised value renders as itself, which is ugly but true;
 * `CARGO_CATEGORY_LABELS` is `Record`-keyed on the enum, so a category added to
 * the schema without copy fails typecheck there before it can reach this
 * fallback.
 */
const CARGO_CATEGORY_LABEL_BY_VALUE: Record<string, string> =
  CARGO_CATEGORY_LABELS;

function cargoCategoryLabel(cargoCategory: string): string {
  return CARGO_CATEGORY_LABEL_BY_VALUE[cargoCategory] ?? cargoCategory;
}

/* -------------------------------------------------------------------------- */
/* Status pill                                                                */
/* -------------------------------------------------------------------------- */

type LoadStatus = HubLoad["status"];

/**
 * The three row states mapped onto `hub-status.ts`'s six tones — **no seventh
 * colour pair is invented here.**
 *
 * The design draws these three pills in literal dark/grey/emerald, which are not
 * words in `TONE_BY_STATUS`'s vocabulary, so this is a small local lookup rather
 * than a `hubStatusTone()` call. `HubStatusBadge` is deliberately not reused for
 * the same reason: its `status` prop expects a word from that vocabulary, and
 * "Open · first to confirm" is not one.
 */
const DRAWER_STATUS_TONE: Record<LoadStatus, HubStatusTone> = {
  // Urgent, and wants the driver to act now. `warning` is the closest of the six
  // (Pending / Invited / Due soon): "still fine, but it needs you to do
  // something soon" is exactly what an open, racing load is.
  available: "warning",
  // Settled and no longer actionable — `neutral`, the same tone as Offline and
  // Idle: a real, deliberate state that is not an alert.
  claimed: "neutral",
  // The state the driver wants. `success`, the family the design's own emerald
  // pill implies.
  mine: "success",
};

const DRAWER_STATUS_LABEL: Record<LoadStatus, string> = {
  available: "Open · first to confirm",
  claimed: "Claimed",
  mine: "Yours",
};

/* -------------------------------------------------------------------------- */
/* Shared class strings                                                       */
/* -------------------------------------------------------------------------- */

/** The section heading above Route and Cargo. */
const SECTION_LABEL_CLASSES =
  "text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase";

/** A pill: handling tags and the status pill share the design's metrics. */
const PILL_CLASSES =
  "h-auto rounded-full px-[9px] py-[3px] text-[11px] font-medium " +
  "tracking-[0.02em]";

/** A boxed note in the actions block — the claimed, mine and advisory notes. */
const NOTE_CLASSES = "rounded-md border p-2.5 text-[13px] leading-relaxed";

/**
 * Why "Open job sheet" is disabled.
 *
 * One string so the visible tooltip and the `sr-only` sentence beside it can
 * never drift apart — the same pairing `hub-online-toggle.tsx` uses for its own
 * disabled control.
 */
const JOB_SHEET_TITLE =
  "Job sheet isn't built yet. Client contact details and proof of delivery " +
  "will live there.";

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

type RouteStopProps = {
  /** "Pick-up" or "Drop-off" — rendered uppercase by CSS, not by the string. */
  label: string;
  /** Filled for the pickup, a hollow ring for the dropoff. */
  marker: "filled" | "ring";
  /** Already-humanised city label, or null when the geocoder could not place it. */
  city: string | null;
  address: string;
  /** The window or the deadline, already formatted. */
  time: string;
  /** The unabbreviated timestamp behind `time`, when there is one. */
  timeTitle?: string;
};

/**
 * One end of the trip: marker, label, city, address and the time line.
 *
 * Both markers are 8px. The dropoff's 2px ring reads as the same visual weight
 * as the pickup's filled dot at that size, which is why the design uses a ring
 * rather than a smaller or lighter fill to distinguish them. `bg-primary` /
 * `border-primary` rather than the design's literal `oklch(0.205 0 0)`: inside
 * `[data-admin-surface]` that token *is* that colour, and going through it keeps
 * this file free of colour literals that no other hub file would know to change.
 */
function RouteStop({
  label,
  marker,
  city,
  address,
  time,
  timeTitle,
}: RouteStopProps) {
  return (
    <div className="flex items-start gap-3">
      {/* Decorative: the "PICK-UP"/"DROP-OFF" label beside it already says which
          end this is, and a dot announced as "circle" tells a reader nothing. */}
      <span
        aria-hidden="true"
        className={cn(
          "mt-[5px] size-2 flex-none rounded-full",
          marker === "filled"
            ? "bg-primary"
            : "border-2 border-primary bg-transparent",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className={cn(SECTION_LABEL_CLASSES, "flex-none")}>
              {label}
            </span>
            <span className="truncate text-xs font-medium">
              {city ?? EM_DASH}
            </span>
          </div>
          <span
            title={timeTitle}
            className="flex-none font-price text-xs text-muted-foreground tabular-nums"
          >
            {time}
          </span>
        </div>
        {/* `title` rather than wrapping: an address is one line in the design and
            a two-line one would push the drop-off row out of alignment. */}
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {address}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cargo                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The eight cargo rows, in the design's order.
 *
 * Built as data rather than as eight hand-written `<dt>`/`<dd>` pairs so the
 * grid's alignment cannot drift row to row, and so the order is one list to read
 * rather than eighty lines of markup to scan.
 *
 * There is no Body type row — the booked chassis appears only in the cold-chain
 * mismatch note below, where it is the point rather than a detail.
 */
function cargoRows(load: HubLoad): { key: string; value: string }[] {
  const tags = sortedHandlingTags(load.handlingTags);

  return [
    { key: "Type", value: cargoCategoryLabel(load.cargoCategory) },
    { key: "Weight", value: formatWeightKg(load.cargoWeightKg) },
    {
      key: "Dimensions",
      value: formatLoadDims({
        lengthM: load.cargoLengthM,
        widthM: load.cargoWidthM,
        heightM: load.cargoHeightM,
      }),
    },
    {
      key: "Volume",
      value: formatVolumeM3(
        load.cargoLengthM,
        load.cargoWidthM,
        load.cargoHeightM,
      ),
    },
    { key: "Packaging", value: load.packagingDescription ?? EM_DASH },
    { key: "Quantity", value: load.itemQuantity ?? EM_DASH },
    {
      key: "Handling",
      // "None declared" rather than an em dash: the client was asked and said
      // nothing applied, which is a different fact from a value being missing.
      value:
        tags.length === 0
          ? "None declared"
          : tags.map((tag) => tag.label).join(", "),
    },
    {
      key: "Helpers",
      value:
        load.helperCount === 0
          ? "No helpers requested"
          : `${pluralise(load.helperCount, "helper")} requested`,
    },
  ];
}

/**
 * The three cargo-photo tiles.
 *
 * **Permanent dashed placeholders.** There is no cargo photo upload anywhere in
 * the client booking flow to feed them and `GET /api/loads` carries no photo
 * field at all, so the count is a constant and no field on the row is consulted
 * to decide it. `specs/driver-load-board/requirements.md`'s Non-Goals: "No cargo
 * photos… Do not add one." Do not build an upload control here, and do not
 * remove the tiles for a load with no photos — every load has no photos, and
 * that is the permanent state of this feature.
 */
const PHOTO_TILES = ["Photo 1", "Photo 2", "Photo 3"];

/* -------------------------------------------------------------------------- */
/* Drawer                                                                     */
/* -------------------------------------------------------------------------- */

export function LoadsDrawer() {
  const {
    selectedLoad,
    selectLoad,
    openConfirm,
    reject,
    restore,
    pendingActionId,
    actionError,
    showRejected,
  } = useLoadsBoard();

  if (selectedLoad === null) {
    return null;
  }

  const load = selectedLoad;

  /**
   * Whether this load is one the driver has hidden.
   *
   * Derived from the sub-view rather than from the row, because the row cannot
   * say: `GET /api/loads` returns rejected loads with `status: "available"` (a
   * rejection changes what *this* account's board shows, never the load's real
   * server-side status), and the context exposes no per-row rejected flag. The
   * inference is sound because entering or leaving the rejected sub-view clears
   * the selection — see `setShowRejected` in `loads-context.tsx` — so a selected
   * row while `showRejected` is on came from the rejected list and nowhere else.
   */
  const isRejected = showRejected;

  /**
   * 6% of the driver's payout, not of the client's price. See the money rule in
   * this file's doc comment for why the design's own definition is not the one
   * implemented.
   *
   * Formatted with `formatGel` — the board's own whole-lari formatter — so the
   * sub-line and the headline above it print the same way. The task file asked
   * for two decimals here on the assumption that this feature's `formatGel`
   * matched `jobs-format.ts`'s two-decimal one; it deliberately does not (see
   * the note on `formatGel` in `loads-format.ts`), and a "₾11.40" under a "₾190"
   * would be the one figure on this board rendered differently from the rest.
   */
  const waitingAllowance = roundCurrency(load.driverPayout * 0.06);

  const isPending = pendingActionId === load.id;
  const isBusy = pendingActionId !== null;

  const hasHazmat = load.handlingTags.includes("HAZMAT");
  /**
   * The tag says the *cargo* needs cold chain; `bodyType` says which *body* the
   * client booked. `null` — no body type declared at all — counts as a mismatch
   * rather than as "probably fine": an undeclared body is exactly the case where
   * the driver most needs to check.
   */
  const hasColdChainMismatch =
    load.handlingTags.includes("COLD_CHAIN") &&
    load.bodyType !== "REFRIGERATED";

  const tags = sortedHandlingTags(load.handlingTags);

  /**
   * "Claimed 4 min ago", when the claim instant can be read.
   *
   * The task file said this sentence could not be written because the payload
   * carries no claim timestamp. The shipped endpoint does: `updatedAt` is the
   * claim instant on a `"claimed"` row (it is the only thing that moves a row
   * into that bucket — see the `CLAIMED_BY_OTHERS_STATUSES` branch in
   * `src/app/api/loads/route.ts`), and `HubLoad` documents it as such. So the
   * design's own wording is restored. It degrades to the unqualified sentence
   * rather than to a wrong number if the timestamp is unusable.
   */
  const claimedAgo =
    load.status === "claimed"
      ? formatMinutesAgo(load.updatedAt, Date.now())
      : null;

  return (
    <aside
      // Required. Without it every token below resolves to the marketing
      // palette — see this file's doc comment.
      data-admin-surface=""
      aria-label={`Load ${load.reference}`}
      // The shadow is the design's own `-8px 0 24px rgba(0,0,0,0.08)`, written
      // as an arbitrary value for the same reason `hub-primitives.tsx` writes
      // the handoff's active-segment shadow that way: these are one-off
      // elevations with no other use in the hub, so they do not earn a
      // `--shadow-*` token. It lifts the drawer off the table it overlaps —
      // without it the 1px left border is the only separation, and the two
      // white surfaces read as one.
      className="fixed top-[61px] right-0 bottom-0 z-30 hidden w-[400px] max-w-[92vw] overflow-y-auto border-l border-border bg-card shadow-[-8px_0_24px_rgba(0,0,0,0.08)] lg:block"
    >
      {/* ---------------------------------------------------------------- */}
      {/* 1. Header                                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 truncate font-price text-xs font-medium tabular-nums">
            {load.reference}
          </span>
          <div className="flex flex-none items-center gap-2">
            <Badge
              // `outline` so no variant background survives the merge if a tone
              // class is ever missing — the same reason `HubStatusBadge` uses it.
              variant="outline"
              className={cn(
                PILL_CLASSES,
                "border-transparent",
                HUB_STATUS_TONE_CLASSES[DRAWER_STATUS_TONE[load.status]],
              )}
            >
              {/* A rejected load keeps the "available" pill and label:
                  rejecting hides the row from this driver's board and changes
                  nothing about the load's real status, so there is nothing new
                  for the pill to represent. */}
              {DRAWER_STATUS_LABEL[load.status]}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => selectLoad(null)}
              className="size-[26px]"
            >
              <X aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>

        <p className="mt-2 font-price text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {formatGel(load.driverPayout)}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          incl. {formatGel(waitingAllowance)} waiting allowance
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Route                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3">
          <RouteStop
            label="Pick-up"
            marker="filled"
            city={load.pickupCity}
            address={load.pickupAddress}
            // Both ends of the window or nothing: "09:00–—" describes no slot a
            // driver can plan around.
            time={
              load.pickupWindowStart === null || load.pickupWindowEnd === null
                ? EM_DASH
                : `${formatClock(load.pickupWindowStart)}–${formatClock(load.pickupWindowEnd)}`
            }
            // The window prints as a bare clock, so the date it falls on lives in
            // the tooltip rather than nowhere.
            timeTitle={formatFullTimestamp(load.pickupWindowStart)}
          />
          <RouteStop
            label="Drop-off"
            marker="ring"
            city={load.dropoffCity}
            address={load.dropoffAddress}
            time={
              load.deliveryDeadline === null
                ? EM_DASH
                : `Deliver by ${formatDeadline(load.deliveryDeadline)}`
            }
            timeTitle={formatFullTimestamp(load.deliveryDeadline)}
          />
        </div>

        {/* Indented 20px — the 8px marker plus its 12px gap — so it hangs under
            the two addresses rather than under the markers.

            `distanceKm` is the load's own pickup-to-dropoff trip, NOT
            `pickupDistanceKm` (how far the driver is from the pickup), which is
            frequently stale or null and is not part of this section.

            "2 stops" is a hard-coded constant, not a field: `Order` is a single
            pickup → single dropoff booking with no stop table, so two is the
            only number it can be. See requirements.md's Non-Goals. */}
        <p className="mt-3 pl-5 text-xs text-muted-foreground tabular-nums">
          {formatDistanceKm(load.distanceKm)} · 2 stops
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 3. Cargo                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b border-border p-4">
        <h3 className={SECTION_LABEL_CLASSES}>Cargo</h3>

        <dl className="mt-2 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[13px]">
          {cargoRows(load).map((row) => (
            <React.Fragment key={row.key}>
              <dt className="text-muted-foreground">{row.key}</dt>
              <dd className="min-w-0 break-words">{row.value}</dd>
            </React.Fragment>
          ))}
        </dl>

        {/* Sorted by `CargoHandlingTag` declaration order, never by the order
            they sit in `Order.handlingTags` — the booking form appends those in
            whatever order the chips were tapped, so two loads carrying the same
            three tags would otherwise show them in different sequences.
            `sortedHandlingTags` is the one place that ordering is defined.

            Absent entirely at zero tags: the Handling row above already reads
            "None declared", and an empty pill row would be a blank line under
            it. */}
        {tags.length === 0 ? null : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.value}
                className={cn(
                  PILL_CLASSES,
                  "border border-border bg-muted text-muted-foreground",
                )}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          {PHOTO_TILES.map((label) => (
            <div
              key={label}
              className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed border-border bg-muted text-[10px] text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Actions                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-2 p-4">
        {/* Additive on top of the state block below, not a replacement for it:
            a hazmat load that is already claimed still warrants the note, and a
            driver reading it should see both. */}
        {hasHazmat ? (
          <p
            className={cn(
              NOTE_CLASSES,
              "border-transparent",
              HUB_STATUS_TONE_CLASSES.warning,
            )}
          >
            Hazmat cargo. Confirm you and your vehicle hold a valid ADR
            certification before accepting — this isn&apos;t checked
            automatically.
          </p>
        ) : null}

        {hasColdChainMismatch ? (
          <p
            className={cn(
              NOTE_CLASSES,
              "border-transparent",
              HUB_STATUS_TONE_CLASSES.neutral,
            )}
          >
            This load needs cold-chain handling, but wasn&apos;t booked with a
            refrigerated body. Confirm your vehicle can keep it cold before
            accepting.
          </p>
        ) : null}

        {load.status === "claimed" ? (
          <p className={cn(NOTE_CLASSES, "border-border bg-muted")}>
            {claimedAgo === null
              ? "Claimed by another driver. No longer available."
              : `Claimed by another driver ${claimedAgo}. No longer available.`}
          </p>
        ) : load.status === "mine" ? (
          <>
            <p
              className={cn(
                NOTE_CLASSES,
                "border-transparent",
                HUB_STATUS_TONE_CLASSES.success,
              )}
            >
              You claimed this load. Contact details are in your job sheet.
            </p>
            <Button
              type="button"
              variant="outline"
              // Ships disabled: there is no job sheet to open. See this file's
              // doc comment and requirements.md's Non-Goals — do not wire this
              // to a placeholder route.
              disabled
              title={JOB_SHEET_TITLE}
              className="h-10 text-sm font-medium"
            >
              Open job sheet
              {/* `title` is not reliably announced, so the reason is real text
                  for assistive tech too — the same pairing
                  `hub-online-toggle.tsx` uses for its disabled pill. */}
              <span className="sr-only">. {JOB_SHEET_TITLE}</span>
            </Button>
          </>
        ) : isRejected ? (
          // No Accept is offered for a load the driver has hidden: restoring it
          // is the only path back to claiming it, matching the table's own
          // row-state behaviour.
          <Button
            type="button"
            variant="outline"
            onClick={() => void restore(load.id)}
            disabled={isBusy}
            className="h-10 text-sm font-medium"
          >
            {isPending ? "Restoring…" : "Restore to open loads"}
          </Button>
        ) : (
          <>
            {/* Opens the confirm dialog (task-12) by id — this drawer never
                calls the claim endpoint itself. */}
            <Button
              type="button"
              onClick={() => openConfirm(load.id)}
              disabled={isBusy}
              className="h-10 text-sm font-medium"
            >
              Accept this load
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void reject(load.id)}
              disabled={isBusy}
              // The design's destructive hover, expressed through the existing
              // `--destructive` token rather than as three raw oklch literals:
              // the tone is the same and the colour stays in one place.
              className="h-10 text-sm font-medium hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            >
              {isPending ? "Rejecting…" : "Reject this load"}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              First driver to confirm claims the order. Rejecting only hides it
              from your board.
            </p>
          </>
        )}

        {/* The board-wide reject/restore failure. Shown here because this drawer
            is where those two actions were taken from. */}
        {actionError === null ? null : (
          <p role="alert" className="text-xs leading-relaxed text-destructive">
            {actionError}
          </p>
        )}
      </div>
    </aside>
  );
}
