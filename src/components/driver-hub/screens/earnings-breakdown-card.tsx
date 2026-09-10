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
 * ## The footer sums the four lines above it
 *
 * "Range total" is the sum of the card's own four rows — `sampled.rangeTotal`
 * from the loader, fares plus tips plus incentives plus adjustments — because a
 * total under four lines that did not add up to them would be read as an error
 * long before it was read as a scruple.
 *
 * Three of those four terms are invented (`sample.ts`), so the total is a
 * figure in which real money and estimates have been added together and cannot
 * be separated again by anyone reading it. That is exactly what the card's one
 * `<SampleNote />` is for, and why the three sampled rows keep their accent
 * markers: the reader is told which of the lines under the total are estimates
 * before they reach it. Until `Order.tipAmount`, an `Incentive` model and a
 * `PayoutAdjustment` model land, this number is not a payout figure and must
 * not be quoted as one — the Payout history card below is where settled money
 * will eventually be read.
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
  "and a PayoutAdjustment model. Trip fares are real, and the range total " +
  "adds all four lines together — so it is part estimate too.";

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
  /**
   * The footer figure: `grossFares` plus the three sampled `extras`, summed by
   * the loader so this card is not the second place that arithmetic lives. Part
   * real and part invented, which is what the card's sample note and the accent
   * markers on the three sampled rows above the footer exist to say.
   */
  rangeTotal: number;
  /** Sampled: tips, incentives and adjustments for the range. */
  extras: SampleEarningsExtras;
  /** Sampled: the caption under the Incentives line. */
  incentivesNote: string;
};

export function EarningsBreakdownCard({
  grossFares,
  jobsCompleted,
  rangeTotal,
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
      // times would drown the one line that is real. It covers the footer as
      // well — the total sums all four rows, so it inherits their estimates —
      // which is why the note says so and the label names only the sources.
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
        <p className="text-sm font-semibold">Range total</p>
        <p className="font-price text-xl font-semibold">
          {formatGel(rangeTotal)}
        </p>
      </div>
    </HubCard>
  );
}
