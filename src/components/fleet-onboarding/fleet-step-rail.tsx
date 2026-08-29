"use client";

/**
 * The five steps, verbatim from the design's own `RAIL` array.
 *
 * Exported because the welcome screen's outline list is the same five entries;
 * it lives here rather than in the shell so the shell can import it without the
 * rail having to import back from the shell.
 */
export const FLEET_RAIL = [
  {
    step: 1,
    label: "Company & authorisation",
    sub: "Phone, legal entity, contact, payouts",
  },
  {
    step: 2,
    label: "Fleet composition",
    sub: "How many of each body type and class",
  },
  {
    step: 3,
    label: "Vehicle specifications",
    sub: "Plate, model, capacity per vehicle",
  },
  {
    step: 4,
    label: "Drivers & assignment",
    sub: "A named driver behind every vehicle",
  },
  {
    step: 5,
    label: "Review & status",
    sub: "Submit, per-vehicle verdicts, activation",
  },
] as const;

/** One row of the fleet tally card, computed by the shell. */
export type FleetTallyRow = {
  key: string;
  value: string;
  tone: "default" | "success" | "muted";
};

/**
 * Success green has no token in `globals.css` — it is a design value used in a
 * handful of places rather than part of the shadcn palette — so it is written
 * as an arbitrary value here, the same call `step-1-auth-personal.tsx` makes
 * for its uploaded-slot green.
 */
const SUCCESS_TEXT_CLASS = "text-[oklch(0.5_0.13_145)]";

/** The tally row's text colour for each tone. */
const TALLY_TONE_CLASS: Record<FleetTallyRow["tone"], string> = {
  default: "text-foreground",
  success: SUCCESS_TEXT_CLASS,
  muted: "text-muted-foreground",
};

/**
 * The wizard's left rail: the five steps, their sub-copy, which one is current,
 * and the live fleet tally pinned to the bottom. Purely presentational — it
 * neither reads the draft context nor decides where a click goes, so the shell
 * stays the single place navigation and derived numbers are defined.
 */
export function FleetStepRail({
  currentStep,
  onSelect,
  tally,
}: {
  currentStep: number;
  onSelect: (step: number) => void;
  tally: FleetTallyRow[];
}) {
  return (
    <nav
      aria-label="Application progress"
      className="flex w-full flex-col gap-4 border-b border-border bg-card p-6 md:h-full md:w-[300px] md:shrink-0 md:border-r md:border-b-0 md:px-[22px] md:py-[26px]"
    >
      <h2 className="font-price text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
        Application progress
      </h2>

      {FLEET_RAIL.map((entry) => {
        const done = currentStep > entry.step;
        const active = currentStep === entry.step;

        return (
          <button
            key={entry.step}
            type="button"
            onClick={() => onSelect(entry.step)}
            aria-current={active ? "step" : undefined}
            className="flex cursor-pointer items-start gap-3 rounded-lg text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span
              aria-hidden="true"
              className={`mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full font-price text-[11px] font-bold ${
                active
                  ? "bg-onboarding-accent text-white"
                  : done
                    ? "bg-primary text-primary-foreground"
                    : "bg-border text-muted-foreground"
              }`}
            >
              {entry.step}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-[13.5px] font-semibold ${
                  active ? "text-onboarding-accent" : "text-foreground"
                }`}
              >
                {entry.label}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-muted-foreground">
                {entry.sub}
              </span>
            </span>
          </button>
        );
      })}

      {/* The fleet tally replaces the driver rail's static footnote: on this
          wizard the numbers the company is building up are the thing worth
          keeping in view. */}
      <div className="mt-auto rounded-xl border border-border bg-muted/40 p-[13px]">
        <p className="font-price text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Fleet
        </p>
        <dl className="mt-[9px] flex flex-col gap-1.5">
          {tally.map((row) => (
            <div
              key={row.key}
              className="flex items-baseline justify-between gap-2.5"
            >
              <dt className={`text-[12.5px] ${TALLY_TONE_CLASS[row.tone]}`}>
                {row.key}
              </dt>
              <dd
                className={`font-price text-[12.5px] font-semibold ${TALLY_TONE_CLASS[row.tone]}`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </nav>
  );
}
