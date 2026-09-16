import { NextResponse } from "next/server";
import { Workbook } from "exceljs";

import { auth } from "@/lib/auth";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import type { HubAccount } from "@/lib/dashboard/hub/account";
import {
  getHubEarnings,
  resolveHubEarningsRange,
  type HubEarningsData,
} from "@/lib/dashboard/hub/earnings";
import {
  SAMPLE_ONLINE_HOURS_PER_JOB,
  sampleEarningsExtras,
} from "@/lib/dashboard/hub/sample";

/**
 * GET /api/dashboard/hub/earnings/export?from=&to=&preset= — the Earnings
 * screen's current range as a downloadable `.xlsx`.
 *
 * The handoff builds this in the browser, as an HTML table served under
 * `application/vnd.ms-excel` — and says so itself: that is a prototype
 * shortcut, and production should prefer a server endpoint. This is it, built
 * with `exceljs` exactly as `src/app/api/admin/analytics/export/route.ts`
 * already does, so the two exports in this codebase are one technique rather
 * than two.
 *
 * Like that route, it **recomputes** every figure rather than accepting numbers
 * from the caller: numbers that arrive from a client are numbers a client can
 * forge, and a spreadsheet that disagrees with the screen is worse than no
 * spreadsheet. The only thing read from the query string is the range, which is
 * then put through the same `resolveHubEarningsRange` the page used.
 *
 * Scope is the session's own account, resolved server-side. There is no driver
 * or company id in the query string and there must never be one: the scope
 * clause inside `getHubEarnings` is the tenancy boundary, and a caller-supplied
 * id would turn this route into a way to read another fleet's takings.
 *
 * A roster driver — an employed driver on somebody else's fleet — is refused
 * with a `403` before any of that happens. The payouts this workbook sums were
 * settled to their employer rather than to them, so `/dashboard/earnings`
 * redirects that persona away entirely; this route is the other half of that
 * gate, because a hidden screen does nothing about a hand-issued `fetch`.
 */

/**
 * exceljs is a CommonJS package built on Node streams and zlib, so this route
 * has to run on the Node runtime rather than the edge one. That is already the
 * default, but stating it keeps a future project-wide `runtime = "edge"` from
 * breaking the download silently.
 */
export const runtime = "nodejs";

/** The shape every failure of this route answers with. */
export type HubEarningsExportError = { error: string };

/** Excel's own currency mask — two decimals, thousands separated. */
const CURRENCY_FORMAT = "#,##0.00";

/**
 * Two decimals for the online-hours column, not the one the screen prints.
 *
 * The daily figures are exact at this precision, so the column adds up to the
 * totals row cell for cell. Rounding each day to the tenth the screen shows
 * would drift by over an hour across a thirty-day range and leave a column that
 * visibly fails to sum — in a spreadsheet, which is the one place a reader will
 * check.
 */
const HOURS_FORMAT = "0.00";

/** The design's day-name column: "Mon". UTC, like every bucket in the range. */
const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});

/** Which columns of the sheet are invented, said in the sheet itself. */
const ESTIMATES_NOTE =
  "Online hours, Tips, Incentives and Adjustments are estimates, not recorded " +
  "data — and the Total column includes them. Date, Day, Jobs and Fares are " +
  "real completed-order figures.";

/** Header row copy. The four estimated columns say so in their own headers. */
const TABLE_HEADERS = [
  "Date",
  "Day",
  "Jobs",
  "Online hours (estimate)",
  "Fares",
  "Tips (estimate)",
  "Incentives (estimate)",
  "Adjustments (estimate)",
  "Total (incl. estimates)",
] as const;

/** Money is rounded to the cent it is printed at, as the loader does. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A `YYYY-MM-DD` UTC day key as a `Date`, for the weekday column. */
function utcDay(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

/**
 * Saturday or Sunday in UTC — the denominator `sampleEarningsExtras` asks for.
 * UTC because every bucket in the range is a UTC day.
 */
function isUtcWeekend(dateKey: string): boolean {
  const weekday = utcDay(dateKey).getUTCDay();

  return weekday === 0 || weekday === 6;
}

/**
 * Estimated online hours for one day.
 *
 * Deliberately not `sampleOnlineHours()`, which rounds to the tenth for the
 * screen's "Nh online" note: `jobs × 0.92` is exact at two decimals, so keeping
 * that precision per day makes the column's sum exactly the range figure the
 * screen shows, rounded once at the end rather than thirty times.
 */
function estimatedDayHours(jobs: number): number {
  return roundCurrency(jobs * SAMPLE_ONLINE_HOURS_PER_JOB);
}

/** One row of the sheet's day table, in the order `TABLE_HEADERS` names. */
type DayRow = {
  date: string;
  day: string;
  jobs: number;
  hours: number;
  fares: number;
  tips: number;
  incentives: number;
  adjustments: number;
  total: number;
};

/**
 * Every day of the range as a sheet row, plus the totals row that is their
 * exact sum.
 *
 * The estimated columns are derived per day through the same pure helpers the
 * screen's range-level figures come from, so a reader can check any row against
 * the rule that produced it — and the totals are accumulated from the printed
 * rows rather than taken from `HubEarningsData`, so the workbook reconciles
 * with itself. It also agrees with the screen: `grossFares` is the sum of the
 * day fares by construction, and tips and incentives are linear in the job
 * counts.
 */
function buildRows(data: HubEarningsData): {
  rows: readonly DayRow[];
  totals: DayRow;
} {
  const totals: DayRow = {
    date: "Totals",
    day: "",
    jobs: 0,
    hours: 0,
    fares: 0,
    tips: 0,
    incentives: 0,
    adjustments: 0,
    total: 0,
  };

  const rows = data.days.map((day): DayRow => {
    const extras = sampleEarningsExtras({
      completedJobs: day.jobs,
      weekendJobs: isUtcWeekend(day.date) ? day.jobs : 0,
    });
    const hours = estimatedDayHours(day.jobs);
    const total = roundCurrency(
      day.fares + extras.tipsGel + extras.incentivesGel + extras.adjustmentsGel,
    );

    totals.jobs += day.jobs;
    totals.hours = roundCurrency(totals.hours + hours);
    totals.fares = roundCurrency(totals.fares + day.fares);
    totals.tips = roundCurrency(totals.tips + extras.tipsGel);
    totals.incentives = roundCurrency(totals.incentives + extras.incentivesGel);
    totals.adjustments = roundCurrency(
      totals.adjustments + extras.adjustmentsGel,
    );
    totals.total = roundCurrency(totals.total + total);

    return {
      date: day.date,
      day: weekdayFormatter.format(utcDay(day.date)),
      jobs: day.jobs,
      hours,
      fares: day.fares,
      tips: extras.tipsGel,
      incentives: extras.incentivesGel,
      adjustments: extras.adjustmentsGel,
      total,
    };
  });

  return { rows, totals };
}

/** The one worksheet: a header block, the day table, then a totals row. */
function addEarningsSheet(
  workbook: Workbook,
  account: HubAccount,
  data: HubEarningsData,
): void {
  const sheet = workbook.addWorksheet("Earnings");

  // Keys and widths only — the header row is written by hand below, because a
  // sheet that opens with a header block cannot have exceljs put column titles
  // in row 1.
  sheet.columns = [
    { key: "date", width: 12 },
    { key: "day", width: 10 },
    { key: "jobs", width: 8 },
    { key: "hours", width: 22, style: { numFmt: HOURS_FORMAT } },
    { key: "fares", width: 12, style: { numFmt: CURRENCY_FORMAT } },
    { key: "tips", width: 16, style: { numFmt: CURRENCY_FORMAT } },
    { key: "incentives", width: 20, style: { numFmt: CURRENCY_FORMAT } },
    { key: "adjustments", width: 22, style: { numFmt: CURRENCY_FORMAT } },
    { key: "total", width: 22, style: { numFmt: CURRENCY_FORMAT } },
  ];

  // The range is written as text, not as an Excel date: these are calendar-day
  // bounds in UTC, and letting Excel reinterpret them in the reader's locale is
  // how a report ends up claiming a range it was never run for. The per-day
  // Date column below is text for the same reason — and sorts correctly anyway,
  // `YYYY-MM-DD` being lexicographically ordered.
  const headerBlock = [
    [account.kind === "BUSINESS" ? "Company" : "Driver", account.displayName],
    ["Range", `${data.range.from} to ${data.range.to}`],
    ["Currency", "GEL (₾)"],
    // A spreadsheet outlives the screen that made it: a column of invented tips
    // with no marker beside it is the failure mode this row exists to prevent.
    ["Estimated columns", ESTIMATES_NOTE],
  ];

  for (const line of headerBlock) {
    const row = sheet.addRow(line);
    row.getCell(1).font = { bold: true };
  }

  sheet.addRow([]);

  const headerRow = sheet.addRow([...TABLE_HEADERS]);
  headerRow.font = { bold: true };
  // Keep the column titles in view while scrolling a long range.
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];

  const { rows, totals } = buildRows(data);

  for (const row of rows) {
    sheet.addRow(row);
  }

  sheet.addRow([]);

  const totalsRow = sheet.addRow(totals);
  totalsRow.font = { bold: true };
}

export async function GET(request: Request): Promise<NextResponse> {
  // The session is read directly rather than through the page-side guard
  // because that guard `redirect()`s, and a redirect is the wrong answer to a
  // `fetch` for a file: the browser would follow it and save the sign-in page
  // as a spreadsheet. The two conditions below are the same ones
  // `requireDashboardSession()` redirects on, answered as status codes so the
  // export button can print a reason — after which `resolveHubAccount()` has
  // nothing left to redirect for and resolves the account normally.
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json<HubEarningsExportError>(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  if (session.user.mustChangePassword || session.user.role === "CLIENT") {
    return NextResponse.json<HubEarningsExportError>(
      { error: "This account cannot export driver earnings." },
      { status: 403 },
    );
  }

  const account = await resolveHubAccount();

  if (account === null) {
    return NextResponse.json<HubEarningsExportError>(
      { error: "Your driver profile isn't set up yet." },
      { status: 403 },
    );
  }

  // The roster-driver gate, the API half of the pair — `/dashboard/earnings`
  // redirects the same persona to /dashboard/loads, and a redirect is the wrong
  // answer to a fetch for a file (see the note on the session check above), so
  // it is answered as a status code here.
  //
  // Every figure in this workbook is scoped by `driverId = <this user>` and
  // headed with this user's own name, but for an employed driver the payouts it
  // sums were settled to their *employer*: the company claimed the order and was
  // paid for it, and `Order.driverId` records only who drove. A spreadsheet
  // outlives the screen that made it, so an employee's copy of their employer's
  // takings, with their own name at the top, is the exact artefact this refusal
  // exists to prevent.
  //
  // 403 rather than 401 — the caller is authenticated, just not entitled — and
  // it matches both the two refusals above and the one `GET /api/loads` answers
  // this same persona with.
  if (account.persona === "ROSTER") {
    return NextResponse.json<HubEarningsExportError>(
      {
        error:
          "Drivers who belong to a company are paid through their employer, so there are no personal earnings to export.",
      },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const range = resolveHubEarningsRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    preset: searchParams.get("preset") ?? undefined,
  });

  const data = await getHubEarnings(account, range);

  const workbook = new Workbook();
  workbook.creator = "Driver Hub";
  workbook.created = new Date();

  addEarningsSheet(workbook, account, data);

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // Safe to interpolate: `data.range` was re-normalised by
      // `getHubEarnings`, which only ever emits dates it formatted itself, so
      // both halves are `YYYY-MM-DD` and cannot carry a quote or a newline into
      // the header.
      "Content-Disposition": `attachment; filename="earnings-${data.range.from}_${data.range.to}.xlsx"`,
      // A report is a point-in-time snapshot; a cached copy would quietly hand
      // back yesterday's figures for the same range.
      "Cache-Control": "no-store",
    },
  });
}
