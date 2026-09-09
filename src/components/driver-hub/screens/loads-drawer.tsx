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
  cargoCategoryLabel,
  formatAbsoluteDateTime,
  formatClock,
  formatDistanceKm,
  formatFullTimestamp,
  formatGel,
  formatHelperRequest,
  formatLoadDims,
  formatRelativeAgo,
  formatVolumeM3,
  formatWeightKg,
  sortedHandlingTags,
} from "@/components/driver-hub/screens/loads-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
 * The design's header sub-line reads "incl. ₾11 waiting allowance" and defines
 * it as "6% of price, rounded". **That line is deliberately not rendered.**
 * `price` is not and must never be available to a driver-facing component, and
 * taking the same percentage of `driverPayout` instead — which this drawer did
 * until the figure was reviewed — quotes drivers a breakdown of their own pay
 * that no stored value supports. It stays out until the order carries a real
 * waiting-allowance field, tracked in
 * `specs/driver-load-board/action-required.md`. Do not restore it by reaching
 * for the client's fare.
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
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every string this drawer prints comes from `loads-format.ts`.
 *
 * It used to carry eight private formatters — a clock, a deadline, a full
 * timestamp, a relative age, an ISO parse guard, a volume, a currency rounding
 * and a cargo-category lookup — written here only because that module was
 * fenced to a sibling task while this file was being built. They have all moved
 * there, and one of them had already drifted: the deadline was formatted with a
 * single `Intl` pattern carrying day, month, hour and minute together, which
 * `en-GB` renders as "4 Aug, 18:00", while the claim dialogs composed the same
 * instant as "4 Aug 18:00". The shared `formatAbsoluteDateTime` is the
 * composed spelling, so this drawer's deadline lost a comma in the merge.
 *
 * Nothing time-related is formatted locally any more, which is the point: every
 * one of those helpers is pinned to `HUB_TIME_ZONE`, and an unzoned formatter
 * renders a 22:30 Tbilisi pick-up window as "18:30" — four hours wrong on every
 * row, and wrong about the *day* for anything after 20:00.
 */

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
  const dims = {
    lengthM: load.cargoLengthM,
    widthM: load.cargoWidthM,
    heightM: load.cargoHeightM,
  };

  return [
    { key: "Type", value: cargoCategoryLabel(load.cargoCategory) },
    { key: "Weight", value: formatWeightKg(load.cargoWeightKg) },
    { key: "Dimensions", value: formatLoadDims(dims) },
    { key: "Volume", value: formatVolumeM3(dims) },
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
    { key: "Helpers", value: formatHelperRequest(load.helperCount) },
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
    isRejected,
  } = useLoadsBoard();

  if (selectedLoad === null) {
    return null;
  }

  const load = selectedLoad;

  /**
   * Whether this load is one the driver has hidden.
   *
   * Read from the board rather than inferred from the rejected sub-view being
   * open: the row itself cannot say, because `GET /api/loads` returns a rejected
   * load with `status: "available"`, and "the sub-view is on, therefore this row
   * is rejected" only holds while two unrelated invariants do. The context
   * carries the fact — see `isRejected` in `loads-context.tsx`.
   */
  const isLoadRejected = isRejected(load.id);

  /**
   * The instant the "claimed N ago" line below is measured against.
   *
   * Sampled at render rather than ticking on a timer. The board re-reads
   * `GET /api/loads` after every mutation and task-14 will poll it, so this
   * label refreshes with the data it describes instead of drifting on a clock
   * of its own. Safe to read during render here for the reason the table's own
   * `nowIso` states: the board fetches from the browser, so this drawer never
   * renders on the server and there is no first pass to disagree with.
   */
  const nowIso = new Date().toISOString();

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
   * rather than to a wrong number if the timestamp is unusable or in the
   * future — `formatRelativeAgo` answers `null` in both cases, which is exactly
   * the fallback this line wants and the reason the shared helper returns the
   * fragment unprefixed rather than the table's "posted …" phrasing.
   */
  const claimedAgo =
    load.status === "claimed"
      ? formatRelativeAgo(load.updatedAt, nowIso)
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
                : `Deliver by ${formatAbsoluteDateTime(load.deliveryDeadline)}`
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
        ) : isLoadRejected ? (
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
