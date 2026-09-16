import { NextResponse } from "next/server";
import { Workbook } from "exceljs";

import {
  AVAILABILITY_STATUS,
  AVAILABILITY_STATUS_ORDER,
  availabilityGaps,
  formatHour,
  matchesCapacity,
} from "@/components/driver-hub/screens/fleet-availability-format";
import { auth } from "@/lib/auth";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import type { HubAccount } from "@/lib/dashboard/hub/account";
import {
  getHubFleetAvailability,
  type HubAvailabilityRow,
  type HubAvailabilityStatus,
  type HubAvailabilityVehicle,
  type HubFleetAvailability,
} from "@/lib/dashboard/hub/fleet-availability";

/**
 * GET /api/dashboard/hub/drivers/availability/export — the Fleet Availability
 * board as a downloadable `.xlsx`.
 *
 * The handoff's prototype writes SpreadsheetML 2003 in the browser and says so
 * itself: that is a prototype shortcut, and production should "prefer a server
 * route that streams a real `.xlsx` (`exceljs`) from the same query the board
 * renders, so the export cannot disagree with the screen". This is that route,
 * built the same way `earnings/export/route.ts` and
 * `admin/analytics/export/route.ts` are, so the three exports in this codebase
 * are one technique rather than three.
 *
 * **Every bar in the workbook is recomputed from `getHubFleetAvailability`.**
 * Nothing about a row, an hour or a status is accepted from the caller — those
 * are values a client can forge, and a spreadsheet that disagrees with the
 * screen is worse than no spreadsheet. What the query string may say is only
 * *which* day and *which* slice: a date, a window, a scope, two checkboxes and
 * the same six filters the board's own filter bar sets.
 *
 * Scope is the session's own account, resolved server-side. There is no company
 * or driver id in the query string and there must never be one — the `companyId`
 * clause inside the loader is the tenancy boundary, and a caller-supplied id
 * would turn this route into a way to download another fleet's whole day.
 *
 * A non-BUSINESS account is refused with a `403` rather than an empty workbook,
 * exactly as the sibling JSON route refuses it: the page-side guard
 * `redirect()`s, and a redirect is the wrong answer to a `fetch` for a file —
 * the browser would follow it and save the sign-in page as a spreadsheet.
 *
 * ## The narrowing lives in one place
 *
 * The window, the capacity buckets and the free-stretch walk are imported from
 * `fleet-availability-format.ts` rather than reimplemented here. That module is
 * pure — no React, no `Date.now()` — precisely so that the screen and the sheet
 * can share it: a second copy of `availabilityGaps()` would drift from the first
 * the day somebody changed the 15-minute floor, and the two would then disagree
 * about how many hours a driver had free.
 */

/**
 * exceljs is a CommonJS package built on Node streams and zlib, so this route
 * has to run on the Node runtime rather than the edge one. That is already the
 * default, but stating it keeps a future project-wide `runtime = "edge"` from
 * breaking the download silently.
 */
export const runtime = "nodejs";

/** The shape every failure of this route answers with. */
export type HubAvailabilityExportError = { error: string };

/** Two decimals for the Hours column — the board snaps to quarter hours. */
const HOURS_FORMAT = "0.00";

/** The handoff's accent, as exceljs' `AARRGGBB`. Header fill and header text. */
const HEADER_FILL_ARGB = "FFFF5A1F";
const HEADER_TEXT_ARGB = "FFFFFFFF";

/** What a cell prints when the fact behind it does not exist. */
const EM_DASH = "—";

/** The board's full day, and the window every scope but `view` exports. */
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;

/** "ALL" is the filter bar's unset value, on every one of its selects. */
const UNSET_FILTER = "ALL";

/**
 * Which slice of the board the workbook covers — the export dialog's three
 * cards, in its own order.
 *
 * `view` is the visible window with the filter bar applied; `day` keeps the
 * filters but widens to the whole day; `all` is the entire roster, filters
 * ignored, which is what the dialog's "filters ignored" meta promises.
 */
type ExportScope = "view" | "day" | "all";

/**
 * The one thing this workbook must not be allowed to imply.
 *
 * There is no shift, rest or unavailability model anywhere in this schema — see
 * the loader's module comment — so a stretch with no bar on it means only that
 * nothing has been *booked* into it. It does not mean the driver is at the
 * wheel, on duty, awake or willing. A spreadsheet outlives the screen that made
 * it and gets forwarded to people who never saw the board, so the distinction
 * has to travel with the file rather than live in a legend they will not read.
 */
const GAPS_NOTE =
  "An 'Available' row means no committed work in that stretch — NOT a confirmed " +
  "available driver. This platform records no shifts, rest periods or " +
  "unavailability, so nothing here says whether a driver is on duty. Confirm " +
  "with the driver before dispatching.";

/**
 * Why the last column exists, said in the sheet itself.
 *
 * `Order` stores no job duration and no ETA, so a bar whose end could not be
 * read out of the database was given a nominal width to be drawable at all. A
 * reader planning a day around "09:00 – 10:00" is entitled to know which of
 * those two numbers was measured.
 */
const DERIVED_END_NOTE =
  "Derived end = Yes means the End time was not recorded and was estimated so " +
  "the job could be shown at all. Treat those End and Hours values as " +
  "placeholders, not measurements.";

/** One column of the sheet, in the handoff's order. */
type SheetColumn = {
  header: string;
  width: number;
  numFmt?: string;
};

/**
 * The column list, in the order the handoff fixes: `Date, Driver, Plate,
 * Vehicle, Class, Body, Capacity (kg), City[, Driver phone], Status, Start, End,
 * Hours, Reference, Route` — plus `Derived end`, appended rather than inserted
 * so the handoff's order is preserved exactly and anybody diffing this against
 * the prototype's output sees one extra column at the end rather than a shifted
 * sheet.
 *
 * The phone column is opt-in, which is the dialog's default and the right one: a
 * roster's mobile numbers are personal data, and a workbook that carries them by
 * default is a workbook that leaks them every time somebody forwards a capacity
 * report.
 */
function columnsFor(includePhone: boolean): SheetColumn[] {
  return [
    { header: "Date", width: 12 },
    { header: "Driver", width: 24 },
    { header: "Plate", width: 12 },
    { header: "Vehicle", width: 22 },
    { header: "Class", width: 20 },
    { header: "Body", width: 16 },
    { header: "Capacity (kg)", width: 14, numFmt: "#,##0" },
    { header: "City", width: 14 },
    ...(includePhone ? [{ header: "Driver phone", width: 18 }] : []),
    { header: "Status", width: 20 },
    { header: "Start", width: 9 },
    { header: "End", width: 9 },
    { header: "Hours", width: 9, numFmt: HOURS_FORMAT },
    { header: "Reference", width: 14 },
    { header: "Route", width: 38 },
    { header: "Derived end", width: 13 },
  ];
}

/** The six filter-bar values this route understands, `null` for unset. */
type ExportFilters = {
  city: string | null;
  vehicleClass: string | null;
  capacity: string | null;
  /** Validated on parse rather than cast at the point of use — see `parseStatusFilter`. */
  status: HubAvailabilityStatus | null;
  driverId: string | null;
  plate: string | null;
};

/** One line of the sheet: a committed block, or a free stretch between two. */
type ExportLine = {
  status: HubAvailabilityStatus;
  start: number;
  end: number;
  /** The vehicle whose details the row's columns describe; see `linesFor`. */
  vehicle: HubAvailabilityVehicle | null;
  /** What the Plate column prints, which may be a plate we have no row for. */
  plate: string | null;
  reference: string | null;
  route: string | null;
  derivedEnd: boolean;
};

/** An hour to the two decimals the Hours column prints at. */
function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A query-string value, with the filter bar's "unset" spelling folded to null. */
function filterParam(value: string | null): string | null {
  if (value === null || value === "" || value === UNSET_FILTER) {
    return null;
  }

  return value;
}

/**
 * A checkbox as the query string carries it.
 *
 * The default is the caller's to state, because the two checkboxes disagree
 * about theirs: free slots are on by default and the phone column is off, which
 * is the dialog's arrangement. Anything other than the opposite of the default
 * is read as the default, so a truncated or hand-edited URL lands on the safe
 * setting rather than on whichever one `Boolean()` happens to produce.
 */
function parseFlag(value: string | null, fallback: boolean): boolean {
  if (value === "1") {
    return true;
  }

  if (value === "0") {
    return false;
  }

  return fallback;
}

/**
 * A status filter as one of the board's four statuses, or `null`.
 *
 * Looked up in `AVAILABILITY_STATUS_ORDER` rather than asserted: the value comes
 * from a query string, and matching it against the one list the legend and the
 * filter select are also built from is what keeps an unknown word out of the
 * comparison entirely — where it would otherwise silently match nothing and
 * produce an empty workbook that looks like a fleet with no drivers.
 */
function parseStatusFilter(value: string | null): HubAvailabilityStatus | null {
  const raw = filterParam(value);

  return AVAILABILITY_STATUS_ORDER.find((status) => status === raw) ?? null;
}

/** `view` | `day` | `all`, defaulting to the dialog's own default card. */
function parseScope(value: string | null): ExportScope {
  return value === "day" || value === "all" ? value : "view";
}

/**
 * An integer hour in `[0, 24]`, or `null` for anything else.
 *
 * Integers only, because the board's window selects offer whole hours. A
 * fractional or out-of-range value is rejected rather than clamped: it means the
 * caller and this route disagree about what the window is, and silently
 * exporting a different window from the one on screen is the disagreement this
 * route exists to prevent.
 */
function parseHourParam(value: string | null): number | null {
  if (value === null || !/^\d{1,2}$/.test(value)) {
    return null;
  }

  const hour = Number(value);

  return hour >= DAY_START_HOUR && hour <= DAY_END_HOUR ? hour : null;
}

/**
 * The window the workbook covers.
 *
 * Only `view` reads `from`/`to`; `day` and `all` are whole-day scopes by
 * definition, and letting a stale `from` narrow them would quietly contradict
 * the "00:00–24:00" the dialog's own card prints. An incomplete or inverted
 * `view` window falls back to the whole day for the same reason — a window that
 * cannot be read is not a window to guess at.
 */
function resolveWindow(
  scope: ExportScope,
  fromParam: string | null,
  toParam: string | null,
): { from: number; to: number } {
  if (scope !== "view") {
    return { from: DAY_START_HOUR, to: DAY_END_HOUR };
  }

  const from = parseHourParam(fromParam);
  const to = parseHourParam(toParam);

  if (from === null || to === null || from >= to) {
    return { from: DAY_START_HOUR, to: DAY_END_HOUR };
  }

  return { from, to };
}

/**
 * Every status present on one row inside the window, the complement included.
 *
 * Built so the status filter can be answered as a set membership rather than as
 * four special cases, and so `available` — which is never stored and exists only
 * as the gaps between blocks — is answered by the same walk the sheet's own
 * `Available` rows come from.
 */
function statusesInWindow(
  row: HubAvailabilityRow,
  from: number,
  to: number,
): Set<HubAvailabilityStatus> {
  const statuses = new Set<HubAvailabilityStatus>();

  for (const block of row.blocks) {
    if (block.end > from && block.start < to) {
      statuses.add(block.status);
    }
  }

  if (availabilityGaps(row.blocks, from, to).length > 0) {
    statuses.add("available");
  }

  return statuses;
}

/**
 * Whether a driver's row survives the filter bar.
 *
 * Filters narrow **rows**, never individual bars, which is what the screen does:
 * the board hides a driver whose vehicle is the wrong class, and never hides one
 * bar of a row it is showing. A sheet that dropped bars instead would put a
 * driver's day in front of a reader with pieces missing and no indication that
 * anything had been removed — and its free stretches would then be wrong, since
 * a removed bar reads as time nobody is using.
 *
 * The vehicle filters match against `vehiclesInDay` rather than the current
 * pairing, per the handoff: "the Vehicle type and Capacity filters match against
 * any vehicle the driver is assigned to within the visible window", so a driver
 * moved off the refrigerated truck at noon still answers a search for it.
 */
function matchesFilters(
  row: HubAvailabilityRow,
  filters: ExportFilters,
  from: number,
  to: number,
): boolean {
  // Destructured rather than read off `filters` inside the callbacks below:
  // TypeScript's narrowing of a property does not survive into a closure, and a
  // local const is what makes the null checks below carry into `.some()` without
  // an assertion.
  const { city, driverId, vehicleClass, capacity, plate, status } = filters;

  if (city !== null && row.city !== city) {
    return false;
  }

  if (driverId !== null && row.driverId !== driverId) {
    return false;
  }

  if (
    vehicleClass !== null &&
    !row.vehiclesInDay.some((vehicle) => vehicle.vehicleClass === vehicleClass)
  ) {
    return false;
  }

  if (
    capacity !== null &&
    !row.vehiclesInDay.some((vehicle) =>
      matchesCapacity(vehicle.capacityKg, capacity),
    )
  ) {
    return false;
  }

  if (plate !== null) {
    // Uppercase substring, as the handoff specifies for the plate input.
    // Georgian plates are written in Latin capitals, so an uppercase fold is
    // enough and a locale-aware one would be a different comparison.
    const needle = plate.toUpperCase();

    if (
      !row.vehiclesInDay.some((vehicle) =>
        vehicle.plateNumber.toUpperCase().includes(needle),
      )
    ) {
      return false;
    }
  }

  if (status !== null && !statusesInWindow(row, from, to).has(status)) {
    return false;
  }

  return true;
}

/**
 * One driver's row as the lines the sheet prints for it, in time order.
 *
 * Blocks are clipped to the window and dropped when nothing of them is left
 * inside it — the same clip the board draws, so a bar that is half off the edge
 * of the screen is half as long in the sheet.
 *
 * Which vehicle a line's columns describe takes the block's own plate first: a
 * driver can be moved between trucks within a day, and the row keeps one line
 * while each bar names the vehicle it actually used. A block that recorded no
 * vehicle at all — `Order.vehicleId` stays unset until a job is accepted — falls
 * back to the row's current pairing, which is what the board's own label column
 * shows for that driver, so the sheet says exactly what the screen says. A plate
 * that is not among the day's vehicles keeps its plate and leaves the detail
 * columns empty rather than borrowing another truck's specification.
 */
function linesFor(
  row: HubAvailabilityRow,
  from: number,
  to: number,
  includeGaps: boolean,
): ExportLine[] {
  const lines: ExportLine[] = [];

  for (const block of row.blocks) {
    const start = Math.max(block.start, from);
    const end = Math.min(block.end, to);

    if (end <= start) {
      continue;
    }

    const named =
      block.vehiclePlate === null
        ? null
        : (row.vehiclesInDay.find(
            (vehicle) => vehicle.plateNumber === block.vehiclePlate,
          ) ?? null);

    lines.push({
      status: block.status,
      start,
      end,
      vehicle: block.vehiclePlate === null ? row.vehicle : named,
      plate: block.vehiclePlate ?? row.vehicle?.plateNumber ?? null,
      reference: block.reference,
      route: block.route,
      derivedEnd: block.derivedEnd,
    });
  }

  if (includeGaps) {
    for (const gap of availabilityGaps(row.blocks, from, to)) {
      lines.push({
        status: "available",
        start: gap.start,
        end: gap.end,
        // A free stretch belongs to the driver rather than to a job, so it is
        // described by the row's current pairing — the truck they would take it
        // in. `null` is a real answer here: a driver with no vehicle assigned
        // gets a row on the board, and their free time is free time nobody can
        // yet be dispatched into.
        vehicle: row.vehicle,
        plate: row.vehicle?.plateNumber ?? null,
        // Neither exists for a stretch that is defined by the absence of work,
        // and an em dash is the sheet's own way of saying so.
        reference: null,
        route: null,
        // A gap's bounds are the edges of the blocks around it and of the
        // window, all of which are real. Nothing about it was invented — though
        // a gap beside a derived-end bar inherits that bar's uncertainty, which
        // is what `DERIVED_END_NOTE` tells the reader to look for.
        derivedEnd: false,
      });
    }
  }

  return lines.sort((left, right) => left.start - right.start);
}

/** One line as the cells of its row, in `columnsFor`'s order. */
function cellsFor(
  line: ExportLine,
  row: HubAvailabilityRow,
  dayKey: string,
  includePhone: boolean,
): (string | number)[] {
  return [
    // Written as text, not as an Excel date: this is a calendar day in Tbilisi,
    // and letting Excel reinterpret it in the reader's locale is how a report
    // ends up claiming a day it was never run for. `YYYY-MM-DD` sorts correctly
    // as text anyway. The clock columns are text for the same reason — "24:00"
    // is a real value on this board and is not a time of day Excel can hold.
    dayKey,
    row.name,
    line.plate ?? EM_DASH,
    line.vehicle?.model ?? EM_DASH,
    line.vehicle?.vehicleClassLabel ?? EM_DASH,
    line.vehicle?.bodyTypeLabel ?? EM_DASH,
    line.vehicle?.capacityKg ?? EM_DASH,
    row.cityLabel,
    ...(includePhone ? [row.phone] : []),
    AVAILABILITY_STATUS[line.status].label,
    formatHour(line.start),
    formatHour(line.end),
    roundHours(line.end - line.start),
    line.reference ?? EM_DASH,
    line.route ?? EM_DASH,
    line.derivedEnd ? "Yes" : "No",
  ];
}

/** The one worksheet: a header block, then every line of every kept row. */
function addAvailabilitySheet(
  workbook: Workbook,
  account: HubAccount,
  data: HubFleetAvailability,
  options: {
    rows: HubAvailabilityRow[];
    from: number;
    to: number;
    scope: ExportScope;
    includeGaps: boolean;
    includePhone: boolean;
  },
): void {
  const sheet = workbook.addWorksheet("Driver availability");
  const columns = columnsFor(options.includePhone);

  // Widths and number formats only — the header titles are written by hand
  // below, because a sheet that opens with a header block cannot have exceljs
  // put column titles in row 1.
  sheet.columns = columns.map((column) => ({
    width: column.width,
    style: column.numFmt === undefined ? {} : { numFmt: column.numFmt },
  }));

  const headerBlock: [string, string][] = [
    ["Company", account.displayName],
    ["Date", data.dayKey],
    ["Window", `${formatHour(options.from)}–${formatHour(options.to)}`],
    [
      "Scope",
      options.scope === "all"
        ? "All drivers, whole day (filters ignored)"
        : `Filtered drivers, ${options.scope === "day" ? "whole day" : "current view"}`,
    ],
    ["Drivers", String(options.rows.length)],
    // Both notes ride in the header block rather than in a footer: a reader who
    // scrolls to the bottom of a 400-row sheet has already formed their opinion
    // of what the rows mean.
    ["Derived ends", DERIVED_END_NOTE],
  ];

  if (options.includeGaps) {
    headerBlock.push(["Available rows", GAPS_NOTE]);
  }

  for (const line of headerBlock) {
    const headerLine = sheet.addRow(line);
    headerLine.getCell(1).font = { bold: true };
  }

  sheet.addRow([]);

  const headerRow = sheet.addRow(columns.map((column) => column.header));
  headerRow.font = { bold: true, color: { argb: HEADER_TEXT_ARGB } };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL_ARGB },
    };
  });
  // Keep the column titles in view while scrolling a long roster.
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];

  for (const row of options.rows) {
    for (const line of linesFor(
      row,
      options.from,
      options.to,
      options.includeGaps,
    )) {
      sheet.addRow(cellsFor(line, row, data.dayKey, options.includePhone));
    }
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  // Read directly rather than through `requireDashboardSession()`, which
  // `redirect()`s: the browser would follow the redirect and save the sign-in
  // page as a spreadsheet. The two conditions below are the ones that guard
  // would redirect on, answered as status codes so the export dialog can print
  // a reason.
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json<HubAvailabilityExportError>(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  if (session.user.mustChangePassword || session.user.role === "CLIENT") {
    return NextResponse.json<HubAvailabilityExportError>(
      { error: "This account cannot export a fleet roster." },
      { status: 403 },
    );
  }

  const account = await resolveHubAccount();

  if (account === null) {
    return NextResponse.json<HubAvailabilityExportError>(
      { error: "Your driver profile isn't set up yet." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const data = await getHubFleetAvailability(
    account,
    searchParams.get("date") ?? "",
  );

  // `null` is the loader's "not a fleet owner" answer and means only that — a
  // fleet with an empty roster returns a board with no rows, which exports as a
  // workbook with a header block and no data rows. Same refusal, same wording,
  // as the JSON route beside this one.
  if (data === null) {
    return NextResponse.json<HubAvailabilityExportError>(
      {
        error:
          "Driver availability is a fleet screen — only a logistics company account has a roster to lay out.",
      },
      { status: 403 },
    );
  }

  const scope = parseScope(searchParams.get("scope"));
  const { from, to } = resolveWindow(
    scope,
    searchParams.get("from"),
    searchParams.get("to"),
  );
  const filters: ExportFilters = {
    city: filterParam(searchParams.get("city")),
    vehicleClass: filterParam(searchParams.get("vclass")),
    capacity: filterParam(searchParams.get("cap")),
    status: parseStatusFilter(searchParams.get("status")),
    driverId: filterParam(searchParams.get("driver")),
    plate: filterParam(searchParams.get("plate")),
  };

  // `all` means the whole roster with the filter bar ignored, which is the one
  // scope whose promise is about what it does NOT apply — see the dialog's
  // "filters ignored" meta.
  const rows =
    scope === "all"
      ? data.rows
      : data.rows.filter((row) => matchesFilters(row, filters, from, to));

  const workbook = new Workbook();
  workbook.creator = "Driver Hub";
  workbook.created = new Date();

  addAvailabilitySheet(workbook, account, data, {
    rows,
    from,
    to,
    scope,
    // The dialog's defaults: free slots on, phone numbers off.
    includeGaps: parseFlag(searchParams.get("gaps"), true),
    includePhone: parseFlag(searchParams.get("phone"), false),
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // Safe to interpolate: `data.dayKey` is the key the loader resolved and
      // formatted itself, never the raw query-string value, so it is a
      // `YYYY-MM-DD` that cannot carry a quote or a newline into the header.
      "Content-Disposition": `attachment; filename="driver-availability-${data.dayKey}.xlsx"`,
      // A board is a point-in-time snapshot of who is busy; a cached copy would
      // hand back a download describing a fleet's earlier day.
      "Cache-Control": "no-store",
    },
  });
}
