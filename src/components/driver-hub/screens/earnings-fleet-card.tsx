"use client";

import { HubCard, HubEmptyState } from "@/components/driver-hub/hub-primitives";
import {
  formatGel,
  pluralise,
} from "@/components/driver-hub/screens/earnings-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HubEarningsFleet } from "@/lib/dashboard/hub/earnings";
import { cn } from "@/lib/utils";

/**
 * Revenue by driver: which of a fleet's drivers earned the company what over the
 * range selected above.
 *
 * Every figure on this card is real, which is why nothing on it is badged. It is
 * built from `COMPLETED` `Order` rows scoped to the signed-in company, and a
 * `<SampleNote />` here would devalue the badge everywhere else on the screen —
 * the marker means "invented", so it must never sit beside something measured.
 *
 * ## The money rule
 *
 * Every currency figure here is `driverPayout + overtimeDriverPayout` — the
 * carrier's commissioned share, which is what the fleet was actually paid.
 * `Order.price` and `Order.overtimeFee` are the *client's* money and are not on
 * `HubEarningsData` at all, deliberately: `earnings.ts`'s header calls summing
 * them "the bug this module used to have", and `prisma/schema.prisma` states that
 * `driverPayout` is the only money figure a driver may be shown. So there is no
 * "Billed" or "Client paid" column here, and no way to reconstruct one.
 *
 * ## Why the footer restates a number it could compute
 *
 * The footer prints the `total` prop — `HubEarningsData.grossFares`, the same
 * figure the tile at the top of the screen headlines — rather than a `reduce`
 * over the rows below it. The two cover the same orders, but the day series
 * rounds per Tbilisi day while this rollup rounds per driver, both off `Float`
 * columns, so a re-sum can land a few cents away from the tile. One screen
 * showing one quantity as two different numbers is a worse failure than a footer
 * that does not visibly add up, and `HubEarningsFleet`'s own doc comment asks for
 * exactly this.
 *
 * ## Why there is an unassigned row
 *
 * A company claims an order under its own identity and assigns a driver at
 * dispatch, and `Order.driverId` is `onDelete: SetNull`, so completed orders can
 * legitimately carry the company's money and no driver. Those orders are inside
 * `grossFares`, so without a row of their own the driver column would visibly
 * fail to reach the footer. The row exists for that arithmetic honesty; it is
 * never given an invented driver name and never folded into the largest earner's
 * row.
 */

/**
 * The column tracks as a static class string so Tailwind can see them at build
 * time — the same idiom as `earnings-payouts-card.tsx` and `vehicles-screen.tsx`.
 * The min-width is what makes `Table`'s own `overflow-x-auto` wrapper scroll on
 * a narrow pane instead of crushing the Driver column.
 */
const COLUMNS = "grid-cols-[1.6fr_0.7fr_0.8fr_1fr_1fr] min-w-[560px]";

/**
 * `font-normal` is stated rather than omitted: the design sets no weight on any
 * table header, but `TableHead` bakes `font-medium` into its own base classes,
 * so leaving the weight out here leaves tailwind-merge nothing to override and
 * the header renders at 500 anyway. Shared verbatim with every other hub table,
 * `earnings-payouts-card.tsx` included — the two share this screen for a
 * BUSINESS account and must not disagree.
 */
const HEAD_CLASSES =
  "h-auto px-0 pb-2.5 text-[11px] font-normal tracking-[0.08em] uppercase text-muted-foreground";
const CELL_CLASSES = "min-w-0 px-0 py-3.5";

/**
 * The row shape shared by the header and the body, so a driver row and the
 * unassigned row below it cannot drift apart.
 */
const ROW_CLASSES = "grid items-center gap-3";

export type EarningsFleetCardProps = {
  fleet: HubEarningsFleet;
  /**
   * `HubEarningsData.grossFares` — the range total, printed in the footer.
   *
   * Passed in rather than summed from `fleet.drivers` here, for the rounding
   * reason set out in this module's header: the tile at the top of the screen is
   * the figure of record and this footer restates it.
   */
  total: number;
};

export function EarningsFleetCard({ fleet, total }: EarningsFleetCardProps) {
  const { drivers, unassigned } = fleet;

  // A range whose only completed orders had no driver on them still has one row
  // worth showing, so the table's presence is not decided by `drivers.length`
  // alone.
  const hasRows = drivers.length > 0 || unassigned.jobsCompleted > 0;

  // The unassigned bucket carries no per-job average of its own — the loader
  // computes one per driver, and this is not a driver. Dividing here is safe:
  // the row renders only when the count is positive, and the guard is kept for
  // the same reason the loader keeps its own.
  const unassignedAveragePerJobGel =
    unassigned.jobsCompleted === 0
      ? 0
      : unassigned.grossFaresGel / unassigned.jobsCompleted;

  return (
    <HubCard
      title="Revenue by driver"
      action={`${pluralise(drivers.length, "driver")} in range`}
    >
      {!hasRows ? (
        // Named for the selected range rather than stated absolutely: the range
        // is a filter the reader chose and can widen, and an empty table should
        // point at it instead of implying the fleet has never earned.
        <HubEmptyState message="No driver completed a job in this range.">
          <p className="mt-1.5 text-xs">
            Completed orders appear here once a driver is assigned to them.
          </p>
        </HubEmptyState>
      ) : (
        <Table role="table" className={cn("block", COLUMNS)}>
          <TableHeader role="rowgroup" className="block">
            <TableRow
              role="row"
              className={cn(
                ROW_CLASSES,
                "border-b border-border hover:bg-transparent",
                COLUMNS,
              )}
            >
              <TableHead role="columnheader" className={HEAD_CLASSES}>
                Driver
              </TableHead>
              <TableHead role="columnheader" className={HEAD_CLASSES}>
                Jobs
              </TableHead>
              <TableHead role="columnheader" className={HEAD_CLASSES}>
                Share
              </TableHead>
              <TableHead role="columnheader" className={HEAD_CLASSES}>
                Avg per job
              </TableHead>
              <TableHead
                role="columnheader"
                className={cn(HEAD_CLASSES, "text-right")}
              >
                Revenue
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody role="rowgroup" className="block">
            {/* Largest earner first, as the loader sorted them. Not re-sorted
                and not filtered here: a second ordering rule is a second thing
                that can disagree with the server's. */}
            {drivers.map((row) => (
              <TableRow
                key={row.driverId}
                role="row"
                // Nothing to open: per-driver detail is the Drivers screen's
                // job, so these rows carry no hover affordance leading nowhere.
                className={cn(
                  ROW_CLASSES,
                  "border-b border-muted text-sm hover:bg-transparent",
                  COLUMNS,
                )}
              >
                {/* A name, so not `font-price` — that face is for figures. */}
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "truncate font-medium")}
                >
                  {row.name}
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "truncate font-price")}
                >
                  {row.jobsCompleted}
                </TableCell>
                {/* `sharePercent` arrives with at most one decimal, so a plain
                    template gives "41.7%" and "100%" with no trailing ".0". */}
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "truncate font-price")}
                >
                  {`${row.sharePercent}%`}
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "truncate font-price")}
                >
                  {formatGel(row.averagePerJobGel)}
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(
                    CELL_CLASSES,
                    "truncate text-right font-price font-semibold",
                  )}
                >
                  {formatGel(row.grossFaresGel)}
                </TableCell>
              </TableRow>
            ))}

            {unassigned.jobsCompleted > 0 ? (
              <TableRow
                role="row"
                className={cn(
                  ROW_CLASSES,
                  "border-b border-muted text-sm hover:bg-transparent",
                  COLUMNS,
                )}
              >
                {/* Deliberately not a name and not `font-medium`: this money is
                    the company's but belongs to no driver, and the row must not
                    be mistaken for one. */}
                <TableCell
                  role="cell"
                  className={cn(
                    CELL_CLASSES,
                    "truncate text-muted-foreground italic",
                  )}
                >
                  Not assigned to a driver
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "truncate font-price")}
                >
                  {unassigned.jobsCompleted}
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "truncate font-price")}
                >
                  {`${unassigned.sharePercent}%`}
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "truncate font-price")}
                >
                  {formatGel(unassignedAveragePerJobGel)}
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(
                    CELL_CLASSES,
                    "truncate text-right font-price font-semibold",
                  )}
                >
                  {formatGel(unassigned.grossFaresGel)}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border pt-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Fleet revenue</p>
          <p className="text-xs text-muted-foreground">
            All completed orders in the range.
          </p>
        </div>
        <p className="font-price text-xl font-semibold">{formatGel(total)}</p>
      </div>
    </HubCard>
  );
}
