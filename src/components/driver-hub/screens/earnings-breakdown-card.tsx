"use client";

import { HubCard, SampleNote } from "@/components/driver-hub/hub-primitives";
import {
  formatGel,
  pluralise,
} from "@/components/driver-hub/screens/earnings-format";
import type { SampleEarningsExtras } from "@/lib/dashboard/hub/sample";
import { cn } from "@/lib/utils";

/**
 * Where the range's money came from: trip fares, tips, incentives and
 * adjustments, then a total.
 *
 * ## Why the footer is the fares total and not "Range total"
 *
 * The design's footer is a single "Range total", and the loader offers exactly
 * that figure — `sampled.rangeTotal`, fares plus tips plus incentives plus
 * adjustments. It is not used here.
 *
 * Three of those four terms are invented (`sample.ts`), so `rangeTotal` is a
 * number in which real money and estimates have already been added together and
 * can no longer be separated by anyone reading it. Printed at 20px under a
 * "Range total" label it becomes the figure a driver quotes, budgets against,
 * and eventually disputes — and it will not match their bank statement, their
 * payout, or the Trip fares line two rows above it. A sample badge beside a
 * headline does not undo that: the number has still been asserted.
 *
 * So the footer totals only what the platform can actually stand behind — the
 * real `grossFares` — and says so, while the three estimated lines above stay
 * visible, individually marked, and deliberately not summed into it. A reader
 * who wants the mixed figure can add the marked lines themselves, which is the
 * point: doing it by hand is doing it knowingly. When `Order.tipAmount`, an
 * `Incentive` model and a `PayoutAdjustment` model land, this footer becomes
 * the design's "Range total" over four real lines and this comment goes with
 * them.
 */

/** The design's green for the incentives figure. */
const POSITIVE_VALUE_CLASSES = "text-[oklch(44.8%_0.119_151.328)]";

/**
 * The accent orange, spelled out rather than imported: `hub-primitives.tsx`
 * keeps its own copy private, and Tailwind scans source text, so a class built
 * from a shared variable would never be generated. Same idiom as
 * `vehicles-screen.tsx`.
 */
const ACCENT_DOT_CLASSES =
  "size-1.5 shrink-0 rounded-full bg-[oklch(64%_0.19_48)]";

const SAMPLED_LINES_NOTE =
  "Tips, incentives and adjustments are placeholders: Order has no tipAmount " +
  "column, nothing records that a bonus was earned, and no deduction is " +
  "stored against a payout. Retire with Order.tipAmount, an Incentive model " +
  "and a PayoutAdjustment model. Trip fares are real.";

type BreakdownLine = {
  label: string;
  note: string;
  amountGel: number;
  /** Fed by `sample.ts`, so it carries the accent marker. */
  sampled: boolean;
  /** Tone for the figure. Plain ink unless the design says otherwise. */
  valueClassName?: string;
};

export type EarningsBreakdownCardProps = {
  /**
   * Real: `SUM(driverPayout + overtimeDriverPayout)` over the range — the
   * driver's (or fulfilling company's) earned share after the platform's
   * commission, not the client's price. No `serviceLevelAdjustment` term
   * belongs in it: the Priority uplift and Pooling discount are already inside
   * the basis `driverPayout` was commissioned from at booking.
   *
   * The name stays `grossFares` because it mirrors `HubEarningsData.grossFares`
   * and because "gross" here has always meant *before the sampled tips,
   * incentives and adjustments below* — the three lines this card adds under
   * it — rather than before commission. It is not a pre-commission figure and
   * never should be read as one.
   */
  grossFares: number;
  /** Real: completed jobs in the range, the Trip fares line's note. */
  jobsCompleted: number;
  /** Sampled: tips, incentives and adjustments for the range. */
  extras: SampleEarningsExtras;
  /** Sampled: the caption under the Incentives line. */
  incentivesNote: string;
};

export function EarningsBreakdownCard({
  grossFares,
  jobsCompleted,
  extras,
  incentivesNote,
}: EarningsBreakdownCardProps) {
  const lines: readonly BreakdownLine[] = [
    {
      label: "Trip fares",
      note: pluralise(jobsCompleted, "completed job"),
      amountGel: grossFares,
      sampled: false,
    },
    {
      label: "Tips",
      note: pluralise(extras.tippingCustomers, "customer"),
      amountGel: extras.tipsGel,
      sampled: true,
    },
    {
      label: "Incentives",
      note: incentivesNote,
      amountGel: extras.incentivesGel,
      sampled: true,
      valueClassName: POSITIVE_VALUE_CLASSES,
    },
    {
      label: "Adjustments",
      note: extras.adjustmentsNote,
      amountGel: extras.adjustmentsGel,
      sampled: true,
      // The design paints a non-zero adjustment red. `sampleEarningsExtras`
      // returns zero always and always will — inventing a deduction would show
      // a driver money taken off them that never was — so this line is muted
      // rather than red, and there is no red branch to write for a value that
      // cannot occur.
      valueClassName: "text-muted-foreground",
    },
  ];

  return (
    <HubCard
      title="Breakdown"
      // One legend for the three marked lines rather than three badges in a
      // narrow card: the marker belongs to the lines, and repeating it three
      // times would drown the one line that is real.
      action={
        <SampleNote
          label="Tips · Incentives · Adjustments"
          note={SAMPLED_LINES_NOTE}
        />
      }
    >
      <div className="flex flex-col">
        {lines.map((line) => (
          <div
            key={line.label}
            className="flex items-center justify-between gap-3 border-t border-muted py-3"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm">
                {line.label}
                {line.sampled ? (
                  <>
                    <span
                      aria-hidden="true"
                      title={SAMPLED_LINES_NOTE}
                      className={ACCENT_DOT_CLASSES}
                    />
                    <span className="sr-only">
                      {" "}
                      — sample data. {SAMPLED_LINES_NOTE}
                    </span>
                  </>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">{line.note}</p>
            </div>
            <p
              className={cn(
                "font-price text-[15px] font-semibold",
                line.valueClassName,
              )}
            >
              {formatGel(line.amountGel)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border pt-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Range total</p>
          <p className="text-xs text-muted-foreground">
            Trip fares only — the estimated lines are not added in.
          </p>
        </div>
        <p className="font-price text-xl font-semibold">
          {formatGel(grossFares)}
        </p>
      </div>
    </HubCard>
  );
}
