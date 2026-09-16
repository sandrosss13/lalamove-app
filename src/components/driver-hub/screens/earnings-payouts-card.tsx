"use client";

import {
  HubCard,
  HubEmptyState,
  HubStatusBadge,
  SampleNote,
} from "@/components/driver-hub/hub-primitives";
import { formatGel } from "@/components/driver-hub/screens/earnings-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SamplePayoutRow } from "@/lib/dashboard/hub/sample";
import { cn } from "@/lib/utils";

/**
 * Payout history: the weekly settlement windows and what each one paid.
 *
 * Every cell is fictional — nothing persists that a settlement ever happened —
 * so the card carries a single `<SampleNote />` rather than marking columns or
 * rows. That is the honest granularity here: on the Vehicles table two columns
 * of six are placeholders and the markers belong to those columns, while this
 * table has no real cell to disown.
 *
 * The rows are also, deliberately, **not filtered by the range above**. A payout
 * period is a fixed weekly settlement window, not a slice of a driver-chosen
 * range, and re-cutting it to an arbitrary window would produce payouts nobody
 * was ever paid. It is why the breakdown card's footer says "Range total"
 * rather than "Payout total", and the caption below says so on screen so the
 * table is not read as a filtered view that is failing to filter.
 */

/**
 * The handoff's tracks, verbatim, as static class strings so Tailwind can see
 * them at build time — the same idiom as `vehicles-screen.tsx`. The min-width
 * is what makes `Table`'s own `overflow-x-auto` wrapper scroll on a narrow
 * pane instead of crushing the Period column.
 */
const COLUMNS = "grid-cols-[1.2fr_1fr_1fr_1fr_120px] min-w-[560px]";

/**
 * `font-normal` is stated rather than omitted: the design sets no weight on any
 * table header, but `TableHead` bakes `font-medium` into its own base classes,
 * so leaving the weight out here leaves tailwind-merge nothing to override and
 * the header renders at 500 anyway. Shared verbatim with every other hub table,
 * `earnings-fleet-card.tsx` included — the two share the earnings sections for
 * a BUSINESS account and must not disagree.
 */
const HEAD_CLASSES =
  "h-auto px-0 pb-2.5 text-[11px] font-normal tracking-[0.08em] uppercase text-muted-foreground";
/**
 * 13px, not the 14px every other hub table uses: the handoff gives its job,
 * driver and vehicle rows `padding:14px 0` and this one `padding:13px 0`, so
 * the odd figure is the design's and not a slip.
 */
const CELL_CLASSES = "min-w-0 px-0 py-[13px]";

const PAYOUTS_NOTE =
  "The whole table is a placeholder: order revenue is settled weekly, but " +
  "nothing records that a settlement happened. Retire with a Payout model " +
  "holding each period's order set, incentive total and transfer status.";

export type EarningsPayoutsCardProps = {
  payouts: readonly SamplePayoutRow[];
};

export function EarningsPayoutsCard({ payouts }: EarningsPayoutsCardProps) {
  return (
    <HubCard title="Payout history" action={<SampleNote note={PAYOUTS_NOTE} />}>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Fixed weekly settlement windows — not filtered by the range above.
      </p>

      {payouts.length === 0 ? (
        <HubEmptyState message="No payouts on record yet." />
      ) : (
        <Table role="table" className={cn("block", COLUMNS)}>
          <TableHeader role="rowgroup" className="block">
            <TableRow
              role="row"
              className={cn(
                "grid items-center gap-3 border-b border-border hover:bg-transparent",
                COLUMNS,
              )}
            >
              <TableHead role="columnheader" className={HEAD_CLASSES}>
                Period
              </TableHead>
              <TableHead role="columnheader" className={HEAD_CLASSES}>
                Jobs
              </TableHead>
              <TableHead role="columnheader" className={HEAD_CLASSES}>
                Incentives
              </TableHead>
              <TableHead role="columnheader" className={HEAD_CLASSES}>
                Amount
              </TableHead>
              <TableHead
                role="columnheader"
                className={cn(HEAD_CLASSES, "text-right")}
              >
                Status
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody role="rowgroup" className="block">
            {payouts.map((payout) => (
              <TableRow
                key={payout.period}
                role="row"
                // Nothing to open: there is no payout record to show a detail
                // panel for, so these rows are not clickable and do not
                // pretend to be.
                className={cn(
                  "grid items-center gap-3 border-b border-muted text-sm hover:bg-transparent",
                  COLUMNS,
                )}
              >
                {/* Not mono, per the handoff: it sets `IBM Plex Mono` on Jobs,
                    Incentives and Amount only. A settlement window is a phrase
                    — "18–24 Aug" — and nothing below it lines up digit for
                    digit, so the figures keep the mono column and this cell
                    reads as the label it is. */}
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "truncate font-medium")}
                >
                  {payout.period}
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "truncate font-price")}
                >
                  {payout.jobs}
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "truncate font-price")}
                >
                  {formatGel(payout.incentivesGel)}
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(
                    CELL_CLASSES,
                    "truncate font-price font-semibold",
                  )}
                >
                  {formatGel(payout.amountGel)}
                </TableCell>
                <TableCell
                  role="cell"
                  className={cn(CELL_CLASSES, "text-right")}
                >
                  <HubStatusBadge status={payout.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </HubCard>
  );
}
