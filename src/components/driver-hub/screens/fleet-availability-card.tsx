"use client";

import * as React from "react";

import { HubCard, SampleNote } from "@/components/driver-hub/hub-primitives";
import {
  FleetAvailabilityBoard,
  type AvailabilityDrag,
  type AvailabilityTooltip,
} from "@/components/driver-hub/screens/fleet-availability-board";
import {
  ExportAvailabilityDialog,
  HoldSlotDialog,
  type ExportScope,
} from "@/components/driver-hub/screens/fleet-availability-dialogs";
import {
  ALL_FILTER_VALUE,
  FleetAvailabilityFilters,
  type AvailabilityLegendEntry,
  type DriverFilterOption,
} from "@/components/driver-hub/screens/fleet-availability-filters";
import {
  AVAILABILITY_STATUS_ORDER,
  ZOOM_STEPS,
  DEFAULT_ZOOM_INDEX,
  availabilityGaps,
  clampHour,
  formatHour,
  isBusyAt,
  matchesCapacity,
  snapHour,
} from "@/components/driver-hub/screens/fleet-availability-format";
import { Button } from "@/components/ui/button";
import type {
  HubAvailabilityBlock,
  HubAvailabilityRow,
  HubAvailabilityStatus,
  HubFleetAvailability,
} from "@/lib/dashboard/hub/fleet-availability";

/**
 * **Fleet availability** — the Drivers screen's scheduling board, and the only
 * stateful piece of the section.
 *
 * Everything below it is a pure view: `fleet-availability-filters.tsx` renders
 * a filter tuple and reports changes, `fleet-availability-board.tsx` draws the
 * rows it is handed, and the two dialogs take their contents as props. All of
 * the state, all of the filtering and all of the counting happen here, for one
 * reason: three separate surfaces have to agree about the same set of drivers —
 * the summary line, the legend and the export's row count. Computing the
 * filtered set once and passing the *answer* down is what stops the spreadsheet
 * from disagreeing with the screen, which is the failure this board cannot
 * afford: a dispatcher moves real trucks on it.
 *
 * ## What is real and what is not
 *
 * Every bar on this board is read from the database — there is no sample data
 * here, deliberately, because a placeholder bar would be an invented claim
 * about a named person's day. The module comment on
 * `@/lib/dashboard/hub/fleet-availability` explains that in full, along with
 * why the handoff's fifth status (`Unavailable`) is absent.
 *
 * The **one** thing on this surface that is not a fact is a slot held by
 * dragging: this schema carries no reservation model, so a hold lives in
 * `localHolds` — React state in this browser tab — and vanishes on reload. It
 * therefore wears a `<SampleNote label="Not saved">` that says exactly that.
 * The alternative considered and rejected was to disable dragging until a
 * reservation table exists; that would have shipped a board whose main
 * interaction silently does nothing, which is worse than one that is honest
 * about where the answer went.
 *
 * ## Why paging is client-side
 *
 * The loader returns one day for one fleet — tens of rows, not thousands — and
 * the legend and summary have to describe the *filtered* set rather than the
 * page. Server paging would mean a second round trip for the counts, or counts
 * that quietly describe twelve rows while claiming to describe the fleet.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Where the board refetches a day from. Same origin, so the session cookie rides along. */
const AVAILABILITY_ENDPOINT = "/api/dashboard/hub/drivers/availability";

/** Where the workbook comes from. */
const EXPORT_ENDPOINT = "/api/dashboard/hub/drivers/availability/export";

/** Rows per page — the prototype's `pageSize`. */
const PAGE_SIZE = 12;

/**
 * The window the board opens on and returns to on reset: a working day rather
 * than a full 24 hours, which at the default 52 px/h is a track that fits a
 * laptop without scrolling.
 */
const DEFAULT_FROM_HOUR = 6;
const DEFAULT_TO_HOUR = 22;

/** Whole-day bounds, for the two export scopes that ignore the visible window. */
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;

/**
 * The shortest drag that becomes a hold, in hours.
 *
 * Below this a drag is a slip of the mouse, not a booking — opening a dialog
 * for a 15-minute smear every time a dispatcher clicks a row would make the
 * board hostile to click.
 */
const MINIMUM_HOLD_HOURS = 0.5;

/** How long the object URL outlives the click — see `earnings-export-button.tsx`. */
const REVOKE_DELAY_MS = 2000;

const LOAD_ERROR = "Couldn't load availability for this day.";
const EXPORT_GENERIC_ERROR = "Could not build the export. Try again.";
const EXPORT_NETWORK_ERROR = "Network error. Please check your connection.";

/** The second line's wording for a driver with no vehicle pairing. */
const NO_VEHICLE_LABEL = "No vehicle assigned";

/** What the `<SampleNote />` beside the hint line explains. */
const HOLD_NOT_SAVED_NOTE =
  "A held slot lives in this browser tab only. The schema carries no " +
  "reservation model yet, so nothing is written to the database and the hold " +
  "is gone on reload.";

/* -------------------------------------------------------------------------- */
/* Local holds                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Holds are keyed by day **and** driver.
 *
 * Keying by driver alone would leak Tuesday's hold onto Wednesday's board the
 * moment the date changed — the rows are the same drivers, so nothing would
 * look wrong, and a dispatcher would read a commitment that was never made for
 * that day.
 */
function holdKey(dayKey: string, driverId: string): string {
  return `${dayKey}::${driverId}`;
}

/** What a driver's row shows for the plate, including the "none" case. */
function rowPlateLabel(row: HubAvailabilityRow): string {
  return row.vehicle?.plateNumber ?? NO_VEHICLE_LABEL;
}

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

export type FleetAvailabilityCardProps = {
  /**
   * The day the server rendered, already resolved. Changing the date in the
   * filters refetches; coming back to this day refetches too rather than
   * restoring this snapshot, because by then it may be minutes stale and its
   * `nowHour` — and therefore every block's status — was resolved against an
   * instant that has passed.
   */
  initial: HubFleetAvailability;
};

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export function FleetAvailabilityCard({ initial }: FleetAvailabilityCardProps) {
  /* ---------------------------------------------------------------------- */
  /* State                                                                  */
  /* ---------------------------------------------------------------------- */

  const [dayKey, setDayKey] = React.useState(initial.dayKey);
  const [fromHour, setFromHour] = React.useState(DEFAULT_FROM_HOUR);
  const [toHour, setToHour] = React.useState(DEFAULT_TO_HOUR);
  const [zoomIndex, setZoomIndex] = React.useState(DEFAULT_ZOOM_INDEX);
  const [page, setPage] = React.useState(0);

  const [city, setCity] = React.useState(ALL_FILTER_VALUE);
  const [vehicleClass, setVehicleClass] = React.useState(ALL_FILTER_VALUE);
  const [capacity, setCapacity] = React.useState(ALL_FILTER_VALUE);
  const [status, setStatus] = React.useState(ALL_FILTER_VALUE);
  const [driverId, setDriverId] = React.useState(ALL_FILTER_VALUE);
  const [driverOpen, setDriverOpen] = React.useState(false);
  const [driverQuery, setDriverQuery] = React.useState("");
  const [plate, setPlate] = React.useState("");

  const [tooltip, setTooltip] = React.useState<AvailabilityTooltip | null>(
    null,
  );
  const [drag, setDrag] = React.useState<AvailabilityDrag | null>(null);
  const [pending, setPending] = React.useState<PendingHold | null>(null);
  const [holdOpen, setHoldOpen] = React.useState(false);

  const [exportOpen, setExportOpen] = React.useState(false);
  const [scope, setScope] = React.useState<ExportScope>("view");
  const [includeGaps, setIncludeGaps] = React.useState(true);
  const [includePhone, setIncludePhone] = React.useState(false);

  const [rows, setRows] = React.useState<HubAvailabilityRow[]>(initial.rows);
  const [nowHour, setNowHour] = React.useState<number | null>(initial.nowHour);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** Bumped by the inline retry to re-run the fetch effect for the same day. */
  const [reloadToken, setReloadToken] = React.useState(0);

  const [localHolds, setLocalHolds] = React.useState<
    Record<string, HubAvailabilityBlock[]>
  >({});

  /* ---------------------------------------------------------------------- */
  /* Fetching                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * True until the first effect run. The server already rendered `initial` for
   * `initial.dayKey`, so refetching it immediately on mount would be a wasted
   * round trip and a flash of the loading state on every page load.
   */
  const isFirstRun = React.useRef(true);

  React.useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    async function load(): Promise<void> {
      try {
        const params = new URLSearchParams({ date: dayKey });
        const response = await fetch(
          `${AVAILABILITY_ENDPOINT}?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          if (!cancelled) {
            setError(LOAD_ERROR);
          }
          return;
        }

        const payload = (await response.json()) as HubFleetAvailability;

        if (!cancelled) {
          setRows(payload.rows);
          setNowHour(payload.nowHour);
        }
      } catch {
        // An abort lands here too, and an aborted request is not a failure the
        // dispatcher should be told about — `cancelled` is what distinguishes
        // "the day changed again" from "the network is down".
        if (!cancelled) {
          setError(LOAD_ERROR);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dayKey, reloadToken]);

  /* ---------------------------------------------------------------------- */
  /* Derived: the filtered set                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * The fetched rows with this tab's holds folded in.
   *
   * Merged here rather than in the board so that a held slot counts everywhere
   * a real block does — the legend, the summary's "free now" test, the status
   * filter and the export's row count. A hold the board drew but the summary
   * ignored would be the same class of disagreement this file exists to
   * prevent.
   */
  const mergedRows = React.useMemo<HubAvailabilityRow[]>(() => {
    return rows.map((row) => {
      const holds = localHolds[holdKey(dayKey, row.driverId)];

      if (holds === undefined || holds.length === 0) {
        return row;
      }

      return {
        ...row,
        blocks: [...row.blocks, ...holds].sort(
          (left, right) => left.start - right.start,
        ),
      };
    });
  }, [rows, localHolds, dayKey]);

  const filteredRows = React.useMemo(() => {
    const plateQuery = plate.trim().toUpperCase();

    return mergedRows.filter((row) => {
      if (city !== ALL_FILTER_VALUE && row.city !== city) {
        return false;
      }

      if (driverId !== ALL_FILTER_VALUE && row.driverId !== driverId) {
        return false;
      }

      // The vehicle filters match against `vehiclesInDay`, not the row's
      // current pairing: a driver moved between trucks at noon keeps one row,
      // and a search for the morning truck's class has to keep that row rather
      // than judging their whole day by whichever vehicle they ended on.
      if (
        vehicleClass !== ALL_FILTER_VALUE &&
        !row.vehiclesInDay.some(
          (vehicle) => vehicle.vehicleClass === vehicleClass,
        )
      ) {
        return false;
      }

      // A driver with no vehicle at all is dropped by any *specific* capacity
      // or class filter and kept by `ALL` — `matchesCapacity()` already treats
      // an unknown capacity as matching no bucket, and `.some()` over an empty
      // list is false. That is the honest answer: nothing is known about a
      // truck that does not exist, so it cannot be claimed to clear 8 tonnes.
      if (
        capacity !== ALL_FILTER_VALUE &&
        !row.vehiclesInDay.some((vehicle) =>
          matchesCapacity(vehicle.capacityKg, capacity),
        )
      ) {
        return false;
      }

      if (
        plateQuery !== "" &&
        !row.vehiclesInDay.some((vehicle) =>
          vehicle.plateNumber.toUpperCase().includes(plateQuery),
        )
      ) {
        return false;
      }

      if (status !== ALL_FILTER_VALUE) {
        if (status === "available") {
          return isFreeInWindow(row, nowHour, fromHour, toHour);
        }

        return row.blocks.some(
          (block) =>
            block.status === status &&
            block.end > fromHour &&
            block.start < toHour,
        );
      }

      return true;
    });
  }, [
    mergedRows,
    city,
    driverId,
    vehicleClass,
    capacity,
    plate,
    status,
    nowHour,
    fromHour,
    toHour,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Derived: counts, legend and paging                                     */
  /* ---------------------------------------------------------------------- */

  const freeCount = filteredRows.filter((row) =>
    isFreeInWindow(row, nowHour, fromHour, toHour),
  ).length;

  /**
   * Block counts per status inside the visible window, across the whole
   * filtered set — never the page. Paging is a way of looking at the answer,
   * not part of it.
   */
  const blockCounts = React.useMemo(() => {
    const counts: Record<HubAvailabilityStatus, number> = {
      available: 0,
      assigned: 0,
      enroute: 0,
      booked: 0,
    };

    for (const row of filteredRows) {
      for (const block of row.blocks) {
        if (block.end > fromHour && block.start < toHour) {
          counts[block.status] += 1;
        }
      }
    }

    return counts;
  }, [filteredRows, fromHour, toHour]);

  const legend: AvailabilityLegendEntry[] = AVAILABILITY_STATUS_ORDER.map(
    (entry) => {
      if (entry !== "available") {
        return { status: entry, count: String(blockCounts[entry]) };
      }

      // "Available" is the complement, so it counts *drivers*, not blocks — and
      // it only means "free right now" on a board that has a right now. On any
      // other day the honest reading is "has a free stretch somewhere in the
      // window", and the wording says which of the two it is.
      return {
        status: entry,
        count: nowHour === null ? `${freeCount} free` : `${freeCount} now`,
      };
    },
  );

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  // Clamped rather than corrected in a `useEffect`: filtering down to three
  // rows while sitting on page 4 must show page 1 on *this* render, not after a
  // second pass that briefly paints an empty board.
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const pixelsPerHour = ZOOM_STEPS[zoomIndex] ?? ZOOM_STEPS[DEFAULT_ZOOM_INDEX];

  /**
   * The summary under the title.
   *
   * Two wordings, because "free at 14:20" is a claim that only exists on today.
   * `nowHour` is `null` for any other day — the loader resolves it against the
   * same instant it derived every block's status from — so the line drops the
   * "free at" clause entirely rather than printing a time the board is not
   * marking or, worse, the browser's own clock against a different day.
   */
  const summary =
    nowHour === null
      ? `${filteredRows.length} drivers · ${rows.length} in fleet`
      : `${freeCount} of ${filteredRows.length} drivers free at ${formatHour(nowHour)} · ${rows.length} in fleet`;

  const driverOptions: DriverFilterOption[] = React.useMemo(
    () =>
      // Built from the *unfiltered* roster on purpose: a combobox that only
      // offered drivers the other filters had already kept would make picking a
      // driver impossible whenever the other filters had excluded them, which
      // is exactly when a dispatcher reaches for it.
      rows.map((row) => ({
        id: row.driverId,
        name: row.name,
        meta: rowPlateLabel(row),
      })),
    [rows],
  );

  /* ---------------------------------------------------------------------- */
  /* Filter handlers                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Every filter change resets the page, per the handoff. Wrapped once rather
   * than repeated at nine call sites, where the tenth would eventually forget
   * and leave the dispatcher on an empty page 4 of a two-page result.
   */
  function withPageReset<T>(apply: (value: T) => void): (value: T) => void {
    return (value: T) => {
      apply(value);
      setPage(0);
    };
  }

  /** `from ≤ to − 1`, enforced on the pair rather than on either select. */
  function handleFromHourChange(hour: number): void {
    setFromHour(Math.min(hour, toHour - 1));
    setPage(0);
  }

  function handleToHourChange(hour: number): void {
    setToHour(Math.max(hour, fromHour + 1));
    setPage(0);
  }

  function handleDriverIdChange(nextDriverId: string): void {
    setDriverId(nextDriverId);
    // The popover closes on pick and forgets the query, so re-opening it starts
    // from the full list rather than from a search the dispatcher has already
    // acted on.
    setDriverOpen(false);
    setDriverQuery("");
    setPage(0);
  }

  function handleResetFilters(): void {
    setCity(ALL_FILTER_VALUE);
    setVehicleClass(ALL_FILTER_VALUE);
    setCapacity(ALL_FILTER_VALUE);
    setStatus(ALL_FILTER_VALUE);
    setDriverId(ALL_FILTER_VALUE);
    setDriverQuery("");
    setPlate("");
    setFromHour(DEFAULT_FROM_HOUR);
    setToHour(DEFAULT_TO_HOUR);
    setPage(0);
    // The date and the zoom are deliberately untouched: neither narrows the
    // result, and yanking a dispatcher off the day they are working on is not
    // what "Reset filters" promises.
  }

  /* ---------------------------------------------------------------------- */
  /* Drag to hold                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * The live drag, mirrored outside React state.
   *
   * The `mousemove` listener needs the current drag on every frame, but reading
   * it from state would force the effect below to list `drag` as a dependency —
   * and then every frame would tear the listeners down and re-attach them.
   * The ref is read by the listener; the state exists so the ghost re-renders.
   */
  const dragRef = React.useRef<AvailabilityDrag | null>(null);

  const isDragging = drag !== null;

  React.useEffect(() => {
    if (!isDragging) {
      return;
    }

    function handleMove(event: MouseEvent): void {
      const current = dragRef.current;

      if (current === null) {
        return;
      }

      // Converted from the geometry snapshotted at mousedown, so the listener
      // touches neither the DOM nor current state.
      const ratio = (event.clientX - current.trackLeft) / current.trackWidth;
      const hour =
        current.fromHour + ratio * (current.toHour - current.fromHour);
      const next: AvailabilityDrag = {
        ...current,
        cursorHour: snapHour(clampHour(hour, current.fromHour, current.toHour)),
      };

      dragRef.current = next;
      setDrag(next);
    }

    function handleUp(): void {
      const current = dragRef.current;

      dragRef.current = null;
      setDrag(null);

      if (current === null) {
        return;
      }

      const start = Math.min(current.anchorHour, current.cursorHour);
      const end = Math.max(current.anchorHour, current.cursorHour);

      if (end - start < MINIMUM_HOLD_HOURS) {
        return;
      }

      setPending({
        driverId: current.driverId,
        driverName: current.driverName,
        plateLabel: current.plateLabel,
        dayKey,
        start,
        end,
      });
      setHoldOpen(true);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    // The cleanup is the only teardown path, which is the point: `mouseup` sets
    // `isDragging` false and React runs this, so an unmount mid-drag — a tab
    // switch, a navigation — cannot leave two listeners on `window` holding a
    // closure over a dead component.
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, dayKey]);

  function handleTrackMouseDown(
    row: HubAvailabilityRow,
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    // Left button only: a right-click is a context menu and a middle-click is a
    // paste or a scroll, and neither should start selecting a booking.
    if (event.button !== 0) {
      return;
    }

    // Without this the browser starts a text selection across the row labels,
    // which both looks broken and steals the `mouseup`.
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const hour = snapHour(
      clampHour(fromHour + ratio * (toHour - fromHour), fromHour, toHour),
    );

    const next: AvailabilityDrag = {
      driverId: row.driverId,
      driverName: row.name,
      plateLabel: rowPlateLabel(row),
      anchorHour: hour,
      cursorHour: hour,
      trackLeft: rect.left,
      trackWidth: rect.width,
      fromHour,
      toHour,
    };

    dragRef.current = next;
    setDrag(next);
    // A tooltip pinned under the cursor for the whole drag would sit over the
    // ghost the dispatcher is trying to read.
    setTooltip(null);
  }

  function handleConfirmHold(): void {
    if (pending === null) {
      return;
    }

    const row = rows.find((entry) => entry.driverId === pending.driverId);

    const block: HubAvailabilityBlock = {
      // Prefixed so a held block is distinguishable from an order id anywhere
      // it is inspected, and unique enough for a React key within one tab.
      id: `hold-${pending.driverId}-${Date.now()}`,
      start: pending.start,
      end: pending.end,
      status: "booked",
      reference: "Held",
      route: "Reserved by dispatcher",
      // The driver's current pairing, because that is the truck this hold is
      // against — unlike an order's block, where the plate is a record of what
      // actually ran.
      vehiclePlate: row?.vehicle?.plateNumber ?? null,
      // The end is exactly what was dragged, so it is recorded rather than
      // inferred; the bar gets the solid edge its `booked` status already
      // draws dashed, and no "inferred" note in its tooltip.
      derivedEnd: false,
    };

    const key = holdKey(pending.dayKey, pending.driverId);

    setLocalHolds((previous) => ({
      ...previous,
      [key]: [...(previous[key] ?? []), block],
    }));
    setPending(null);
    setHoldOpen(false);
  }

  /* ---------------------------------------------------------------------- */
  /* Export                                                                 */
  /* ---------------------------------------------------------------------- */

  /** The window each scope covers: the visible one, or the whole day. */
  const exportFromHour = scope === "view" ? fromHour : DAY_START_HOUR;
  const exportToHour = scope === "view" ? toHour : DAY_END_HOUR;
  const exportRows = scope === "all" ? mergedRows : filteredRows;

  /**
   * How many lines the spreadsheet will hold — one per committed block in the
   * scope's window, plus one per free gap when free slots are included.
   *
   * Computed from `availabilityGaps()`, the same helper the board's own gap
   * maths uses, so the live count in the dialog and the file that arrives
   * cannot disagree about what counts as a gap (anything under 15 minutes does
   * not).
   */
  const spreadsheetRowCount = React.useMemo(() => {
    let total = 0;

    for (const row of exportRows) {
      total += row.blocks.filter(
        (block) => block.end > exportFromHour && block.start < exportToHour,
      ).length;

      if (includeGaps) {
        total += availabilityGaps(
          row.blocks,
          exportFromHour,
          exportToHour,
        ).length;
      }
    }

    return total;
  }, [exportRows, exportFromHour, exportToHour, includeGaps]);

  /**
   * Fetches the workbook and hands it to the browser.
   *
   * A `fetch` rather than an `<a href>`, for the reason
   * `earnings-export-button.tsx` documents at length: the file is built from a
   * database pass, and a link gives no feedback while it waits and lands a
   * failure as a browser error page in place of the dashboard. Throwing on
   * failure lets the dialog keep itself open and print the reason inline,
   * which is the handoff's own instruction for the hold dialog too.
   *
   * The filter tuple rides along so "Filtered drivers" means on the server
   * exactly what it means on screen. The server re-resolves everything from the
   * session's own account — nothing about the file's contents is decided here.
   */
  async function handleDownload(): Promise<void> {
    // Names and encodings are the export route's, not this component's
    // internal ones: `vclass`/`cap` rather than `vehicleClass`/`capacity`, and
    // the two flags as `1`/`0` rather than `true`/`false`. The route reads a
    // query string, so every unrecognised name and every unparsed value falls
    // back to a default *silently* — which is the failure mode this comment
    // exists to prevent. Spelling them wrong does not error; it quietly ships a
    // workbook that disagrees with the dialog the operator just filled in.
    const params = new URLSearchParams({
      date: dayKey,
      scope,
      from: String(exportFromHour),
      to: String(exportToHour),
      gaps: includeGaps ? "1" : "0",
      phone: includePhone ? "1" : "0",
    });

    // Omitted outright for the "all drivers" scope, so a stale filter cannot
    // quietly narrow an export that says "filters ignored".
    if (scope !== "all") {
      params.set("city", city);
      params.set("vclass", vehicleClass);
      params.set("cap", capacity);
      params.set("status", status);
      params.set("driver", driverId);
      params.set("plate", plate.trim().toUpperCase());
    }

    let response: Response;

    try {
      response = await fetch(`${EXPORT_ENDPOINT}?${params.toString()}`);
    } catch {
      throw new Error(EXPORT_NETWORK_ERROR);
    }

    if (!response.ok) {
      // The route answers failures as JSON; a proxy or a crash may not, so the
      // parse is allowed to fail into the generic message.
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      throw new Error(payload?.error ?? EXPORT_GENERIC_ERROR);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    // Rebuilt from the day this request carried rather than parsed out of
    // `Content-Disposition`: both sides derive it from the same string, so they
    // agree, and one fewer header to parse is one fewer way for the file to
    // arrive named `download`.
    anchor.download = `driver-availability-${dayKey}.xlsx`;
    // Appended before clicking: a detached anchor is ignored by Firefox.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // Revoking synchronously can cancel the download in browsers that start
    // reading the blob only after the click has been dispatched.
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, REVOKE_DELAY_MS);

    // The dialog closes itself once this resolves, and keeps itself open with
    // the thrown message when it does not — so closing from here as well would
    // put the same decision in two places.
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <HubCard
      title="Fleet availability"
      action={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetFilters}
          >
            Reset filters
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setExportOpen(true)}
            // Gated on the whole roster, not the filtered set: the "All
            // drivers, whole day" scope ignores the filters, so a filter that
            // happens to match nothing is not a reason to refuse an export.
            // An empty roster is — a workbook of one header row reads as a
            // broken download rather than an empty result.
            disabled={rows.length === 0}
          >
            Export to Excel
          </Button>
        </div>
      }
      contentClassName="flex flex-col gap-4"
    >
      {/* The handoff puts this line directly under the page `h1`; inside a
          `HubCard` the title lives in the card header, so the summary becomes
          the first thing in the body. Same reading order, one card gap instead
          of the artboard's 4px. */}
      <p className="text-[13px] text-muted-foreground">{summary}</p>

      <FleetAvailabilityFilters
        dayKey={dayKey}
        onDayKeyChange={withPageReset(setDayKey)}
        fromHour={fromHour}
        toHour={toHour}
        onFromHourChange={handleFromHourChange}
        onToHourChange={handleToHourChange}
        city={city}
        onCityChange={withPageReset(setCity)}
        vehicleClass={vehicleClass}
        onVehicleClassChange={withPageReset(setVehicleClass)}
        capacity={capacity}
        onCapacityChange={withPageReset(setCapacity)}
        status={status}
        onStatusChange={withPageReset(setStatus)}
        driverId={driverId}
        onDriverIdChange={handleDriverIdChange}
        driverOptions={driverOptions}
        driverOpen={driverOpen}
        onDriverOpenChange={setDriverOpen}
        driverQuery={driverQuery}
        onDriverQueryChange={setDriverQuery}
        plate={plate}
        onPlateChange={withPageReset(setPlate)}
        zoomIndex={zoomIndex}
        onZoomIndexChange={setZoomIndex}
        legend={legend}
        nowHour={nowHour}
      />

      <FleetAvailabilityBoard
        rows={pageRows}
        fromHour={fromHour}
        toHour={toHour}
        pixelsPerHour={pixelsPerHour}
        nowHour={nowHour}
        rangeStart={filteredRows.length === 0 ? 0 : safePage * PAGE_SIZE + 1}
        rangeEnd={Math.min(
          filteredRows.length,
          safePage * PAGE_SIZE + PAGE_SIZE,
        )}
        totalRowCount={filteredRows.length}
        onPreviousPage={() => setPage(Math.max(0, safePage - 1))}
        onNextPage={() => setPage(Math.min(pageCount - 1, safePage + 1))}
        canPreviousPage={safePage > 0}
        canNextPage={safePage < pageCount - 1}
        isLoading={isLoading}
        error={error}
        onRetry={() => setReloadToken((token) => token + 1)}
        drag={drag}
        onTrackMouseDown={handleTrackMouseDown}
        tooltip={tooltip}
        onTooltipChange={setTooltip}
      />

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          Drag across an empty stretch of a row to hold it as a booking.
        </p>
        <SampleNote label="Not saved" note={HOLD_NOT_SAVED_NOTE} />
      </div>

      <HoldSlotDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        pending={pending}
        onConfirm={handleConfirmHold}
      />

      <ExportAvailabilityDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        scope={scope}
        onScopeChange={setScope}
        includeGaps={includeGaps}
        onIncludeGapsChange={setIncludeGaps}
        includePhone={includePhone}
        onIncludePhoneChange={setIncludePhone}
        filteredDriverCount={filteredRows.length}
        totalDriverCount={rows.length}
        fromHour={fromHour}
        toHour={toHour}
        spreadsheetRowCount={spreadsheetRowCount}
        onDownload={handleDownload}
      />
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** What the hold dialog is asked to confirm. */
type PendingHold = {
  /** Not shown; it is how the confirmed hold finds its row. */
  driverId: string;
  driverName: string;
  plateLabel: string;
  dayKey: string;
  start: number;
  end: number;
};

/**
 * Whether a driver counts as free — which means two different things.
 *
 * On today it is the handoff's test: nothing covers this instant. On any other
 * day there is no instant to test, so the question becomes whether the visible
 * window holds a free stretch at all. Answering the first question with the
 * browser's own clock against a day that is not today would produce a number
 * that is simply wrong, and answering it with a hardcoded hour would be worse.
 *
 * Both the summary line, the legend's "Available" count and the status filter
 * go through here, so those three can never disagree about who is free.
 */
function isFreeInWindow(
  row: HubAvailabilityRow,
  nowHour: number | null,
  fromHour: number,
  toHour: number,
): boolean {
  if (nowHour === null) {
    return availabilityGaps(row.blocks, fromHour, toHour).length > 0;
  }

  return !isBusyAt(row.blocks, nowHour);
}
