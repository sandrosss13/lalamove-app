"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { CargoCategory } from "@prisma/client";

import {
  CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES,
  CARGO_CATEGORY_LABELS,
} from "@/lib/cargo";
import { formatGel } from "@/components/landing/landing-format";
import { useLandingVehicleTypes } from "@/components/landing/landing-vehicle-types";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type QuoteCalculatorContent,
} from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

/** Cargo categories in the order the taxonomy declares them. */
const CARGO_CATEGORY_OPTIONS = Object.entries(CARGO_CATEGORY_LABELS) as [
  CargoCategory,
  string,
][];

const DEFAULT_CARGO_CATEGORY: CargoCategory = "FURNITURE_FURNISHINGS";

/**
 * Crew sizes the visitor may price, counted as **total people including the
 * driver**. The wire field is `helperCount` — the *extras* beyond the driver,
 * which is what the vehicle's flat per-helper fee multiplies — so everything
 * below is one more than what gets posted, and the copy has to say so or "1"
 * reads as "one helper" rather than "nobody but the driver".
 */
const CREW_SIZE_OPTIONS = [1, 2, 3, 4] as const;

/** A driver working the load alone: the common case, so it is the default. */
const DEFAULT_CREW_SIZE = 1;

/** Placeholder shown in the price panel before the first estimate. */
const EMPTY_STAT = "—";

/** A finished estimate, with the vehicle label captured alongside it. */
type Estimate = {
  distanceKm: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  helperFee: number;
  price: number;
  vehicleLabel: string;
};

/** Shape of a successful `/api/pricing/estimate` response. */
type EstimateResponse = {
  distanceKm: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  helperFee: number;
  price: number;
};

const CARD_CLASSES =
  "rounded-3xl border border-line bg-surface p-[clamp(24px,2.6vw,32px)]";

/** The focus ring is spelled out here because `globals.css` only rings links
 *  and buttons — form controls on this page style their own. The field sits on
 *  `surface-sunken` so it reads as recessed inside the `surface` card in both
 *  themes; the old `bg-ink` only worked while `ink` meant "white". */
const FIELD_CLASSES =
  "w-full rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5 text-sm text-paper " +
  "transition-colors placeholder:text-faint focus:border-accent focus:outline-none " +
  "focus:ring-2 focus:ring-accent/25";

/** The native dropdown list is painted by the browser, not by us: `color-scheme`
 *  (set per theme in `globals.css`) gives it the right base, and the `option`
 *  rules pin an opaque ground on the platforms that paint each row with the
 *  element's own colours instead — `surface-sunken` is translucent, which is
 *  exactly the case that comes out unreadable there. */
const SELECT_CLASSES = `${FIELD_CLASSES} appearance-none pr-10 [&>option]:bg-ink [&>option]:text-paper`;

const FIELD_LABEL_CLASSES =
  "flex items-center gap-2 text-[0.8125rem] font-medium text-paper";

const PANEL_LABEL_CLASSES =
  "font-price text-[10.5px] tracking-[.1em] text-faint uppercase";

const BREAKDOWN_TERM_CLASSES = "text-[0.8125rem] text-muted";

const BREAKDOWN_VALUE_CLASSES = "font-price text-[0.8125rem] text-paper";

/**
 * Everything the visitor is charged for moving the load, as one figure: the
 * single line that stands in for the old base / distance / time itemisation.
 *
 * Derived by subtracting the helper fee from the quoted total rather than by
 * adding the three components it replaces, and the difference is not academic:
 * `price` is floored at the pricing rule's minimum fare, so on a short hop
 * those components sum to *less* than the total. Adding them would print two
 * lines that visibly fail to reach the headline figure directly above them;
 * subtracting makes the breakdown reconcile at every distance.
 */
function transportationCost(estimate: Estimate): number {
  return estimate.price - estimate.helperFee;
}

/**
 * Live quote card on the marketing page: a visitor prices a load before they
 * have an account. Estimate-only — it never creates an order, and it calls the
 * public `/api/pricing/estimate` endpoint rather than the auth-gated
 * autocomplete, so the addresses are plain text fields geocoded once, on
 * submit.
 *
 * Only the section's framing copy is authored; every label, placeholder and
 * message below is tied to a specific request/response shape and stays here.
 */
export function LandingQuoteCalculator({
  content = DEFAULT_HOME_PAGE_CONTENT.quote_calculator,
}: {
  content?: QuoteCalculatorContent;
}) {
  const pickupId = useId();
  const dropoffId = useId();
  const cargoCategoryId = useId();
  // Radios are grouped by `name`, not by id, and the group has to be unique to
  // this instance — two calculators on one page would otherwise share a single
  // selection between them.
  const crewSizeGroupName = useId();

  const {
    vehicleTypes,
    loading,
    error: vehicleTypesError,
  } = useLandingVehicleTypes();

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [cargoCategory, setCargoCategory] = useState<CargoCategory>(
    DEFAULT_CARGO_CATEGORY,
  );
  // Total people on the job, 1-4 — see `CREW_SIZE_OPTIONS`.
  const [crewSize, setCrewSize] = useState<number>(DEFAULT_CREW_SIZE);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);

  // Only the vehicles this cargo may legally travel in are offered, so the
  // server's mismatch rejection is unreachable from this form.
  const allowedVehicleCategories =
    CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory];
  const availableVehicleTypes = vehicleTypes.filter((vehicleType) =>
    allowedVehicleCategories.includes(vehicleType.category),
  );

  // A visitor prices a load, not a specific truck — asking them to pick a
  // vehicle type before they even have an account was friction the marketing
  // page doesn't need, and it made this form's quote depend on a required
  // picker staying in sync with a background fetch. The cheapest type
  // eligible for the chosen cargo is used instead, same as a shopper sees a
  // "from ₾X" price before configuring anything.
  const cheapestVehicleType =
    availableVehicleTypes.length > 0
      ? availableVehicleTypes.reduce((cheapest, vehicleType) =>
          vehicleType.pricingRule.baseFare < cheapest.pricingRule.baseFare
            ? vehicleType
            : cheapest,
        )
      : null;

  /**
   * Any edit invalidates the quote on screen, so clear it — otherwise a price
   * for the previous route would sit under the new inputs.
   */
  function clearQuote() {
    setEstimate(null);
    setError(null);
  }

  function updateField(setter: (value: string) => void, value: string) {
    setter(value);
    clearQuote();
  }

  function updateCargoCategory(value: string) {
    setCargoCategory(value as CargoCategory);
    clearQuote();
  }

  function updateCrewSize(value: number) {
    setCrewSize(value);
    clearQuote();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setEstimate(null);

    if (!cheapestVehicleType) {
      setError("Could not price this load. Please try again.");
      return;
    }

    setSubmitting(true);

    // The picker counts the driver; the wire field counts only the extras the
    // per-helper fee is charged for.
    const helperCount = crewSize - 1;

    try {
      const response = await fetch("/api/pricing/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          dropoffAddress,
          vehicleTypeCode: cheapestVehicleType.code,
          cargoCategory,
          helperCount,
        }),
      });

      const payload = (await response.json()) as
        EstimateResponse | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : "Could not price this load. Please try again.";
        setError(message);
        return;
      }

      setEstimate({
        ...(payload as EstimateResponse),
        // Captured now so the panel keeps matching the quote even if the
        // visitor edits the form afterwards.
        vehicleLabel: cheapestVehicleType.label,
      });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // A quote failure is the more urgent of the two, and a visitor can only hit
  // one of them at a time anyway: the submit button is disabled while the
  // list is missing, so the form cannot be submitted then.
  const message = error ?? vehicleTypesError;

  // The fare components are floored by the vehicle's minimum fare, so on a
  // short hop they sum to less than the total charged. The breakdown no longer
  // prints them — `transportationCost` is derived from the total, so the lines
  // always add up — but the floor is still worth naming: it is why a two-block
  // hop costs what a longer one does. The half-cent margin keeps floating-point
  // dust from reading as a floor.
  const minimumFareApplied =
    estimate !== null &&
    estimate.baseFare +
      estimate.distanceFare +
      estimate.timeFare +
      estimate.helperFee <
      estimate.price - 0.005;

  return (
    <section
      id="price-a-load"
      className="scroll-mt-28 px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]"
    >
      <div data-reveal className="mx-auto w-full max-w-[1200px]">
        {/* `auto-fit` rather than a breakpoint prefix: the framing copy and the
            card sit side by side while both fit, and stack on their own below
            that. The whole page is fluid — no media queries anywhere. */}
        <div className="grid items-start gap-[clamp(28px,3.4vw,56px)] [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          <div className="flex flex-col gap-4">
            <p className="font-price text-[11px] tracking-[.18em] text-accent uppercase">
              {content.eyebrow}
            </p>
            <h2 className="max-w-[20ch] text-[clamp(30px,4.6vw,62px)] leading-none font-semibold tracking-[-.045em] text-balance text-paper">
              {content.heading}
            </h2>
            <p className="max-w-[44ch] text-[16px] leading-[1.6] text-pretty text-muted">
              {content.intro}
            </p>
          </div>

          <form onSubmit={handleSubmit} className={CARD_CLASSES}>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.1em] text-accent uppercase">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
              />
              Estimate
            </span>

            <div className="mt-5 flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={pickupId} className={FIELD_LABEL_CLASSES}>
                  {/* Hollow ring, then filled square below: the two ends of the
                      route, kept as marks so the pair reads as one journey. */}
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full border-[1.5px] border-accent"
                  />
                  Pickup
                </label>
                <input
                  id={pickupId}
                  type="text"
                  value={pickupAddress}
                  onChange={(event) =>
                    updateField(setPickupAddress, event.target.value)
                  }
                  placeholder="Rustaveli Ave 12, Tbilisi"
                  autoComplete="off"
                  required
                  className={FIELD_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={dropoffId} className={FIELD_LABEL_CLASSES}>
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-[2px] bg-accent"
                  />
                  Dropoff
                </label>
                <input
                  id={dropoffId}
                  type="text"
                  value={dropoffAddress}
                  onChange={(event) =>
                    updateField(setDropoffAddress, event.target.value)
                  }
                  placeholder="Aghmashenebeli Ave 88, Tbilisi"
                  autoComplete="off"
                  required
                  className={FIELD_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={cargoCategoryId}
                  className={FIELD_LABEL_CLASSES}
                >
                  What are you moving
                </label>
                {/* `appearance-none` drops the platform arrow, so the wrapper
                    draws the replacement as an inline SVG — a token stroke,
                    which a `background-image` data URI could not be. */}
                <div className="relative">
                  <select
                    id={cargoCategoryId}
                    value={cargoCategory}
                    onChange={(event) =>
                      updateCargoCategory(event.target.value)
                    }
                    required
                    className={SELECT_CLASSES}
                  >
                    {CARGO_CATEGORY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 12 12"
                    className="pointer-events-none absolute top-1/2 right-3.5 h-3 w-3 -translate-y-1/2 text-faint"
                  >
                    <path
                      d="M2.5 4.5 6 8l3.5-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              {/* A `fieldset`/`legend` rather than a `label`, because the
                  control is four inputs answering one question: the legend is
                  what names the group to a screen reader, and native radios
                  give the row arrow-key navigation for free. The fieldset is
                  left as a block — a `legend` inside a flex container renders
                  inconsistently across engines — so the rhythm below is set by
                  margins instead of the column's `gap`. */}
              <fieldset>
                <legend className="text-[0.8125rem] font-medium text-paper">
                  How many people
                </legend>
                <div className="mt-1.5 grid grid-cols-4 gap-1.5 rounded-xl border border-line bg-surface-sunken p-1.5">
                  {CREW_SIZE_OPTIONS.map((option) => {
                    const selected = option === crewSize;

                    return (
                      <label
                        key={option}
                        className={cn(
                          // `relative` is load-bearing: `sr-only` positions the
                          // input absolutely, and without a containing block
                          // here it would be laid out against the page, which
                          // is what makes a hidden control scroll the viewport
                          // when it takes focus.
                          "relative flex cursor-pointer items-center justify-center rounded-lg py-2 text-sm font-medium transition-colors",
                          // The input is visually hidden, so its focus ring has
                          // to be borrowed by the thing that *is* visible —
                          // otherwise tabbing into the row shows nothing.
                          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/50",
                          selected
                            ? "bg-accent text-on-accent"
                            : "text-muted hover:text-paper",
                        )}
                      >
                        <input
                          type="radio"
                          name={crewSizeGroupName}
                          value={option}
                          checked={selected}
                          onChange={() => updateCrewSize(option)}
                          // The visible label is a bare numeral, which says
                          // nothing on its own; this spells out what the number
                          // counts. It still opens with that numeral, so the
                          // accessible name contains the visible one.
                          aria-label={
                            option === 1
                              ? "1 person — the driver alone"
                              : `${option} people — the driver plus ${option - 1} helper${option > 2 ? "s" : ""}`
                          }
                          className="sr-only"
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs leading-snug text-faint">
                  1 is the driver alone. Each extra person helps load and
                  unload, and adds a flat fee.
                </p>
              </fieldset>
            </div>

            {message ? (
              <p
                role="alert"
                className="mt-3.5 rounded-xl border border-line-accent-strong bg-accent/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-accent"
              >
                {message}
              </p>
            ) : null}

            {/* Rendered before the first quote too, so the card doesn't grow a
                whole new panel under the visitor's cursor when the estimate
                lands. */}
            <div
              aria-live="polite"
              className="mt-4 rounded-2xl border border-line-accent bg-accent/8 px-5 py-5"
            >
              <dl className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <dt className={PANEL_LABEL_CLASSES}>Your estimate</dt>
                  <dd className="mt-1.5 font-price text-[2.125rem] leading-none font-semibold tracking-[-0.03em] text-accent">
                    {estimate ? formatGel(estimate.price) : EMPTY_STAT}
                  </dd>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                  <div>
                    <dt className={PANEL_LABEL_CLASSES}>Distance</dt>
                    <dd className="mt-1 font-price text-[0.8125rem] font-medium text-paper">
                      {estimate
                        ? `${estimate.distanceKm.toFixed(1)} km`
                        : EMPTY_STAT}
                    </dd>
                  </div>
                  <div>
                    <dt className={PANEL_LABEL_CLASSES}>Vehicle</dt>
                    <dd className="mt-1 text-[0.8125rem] font-medium text-paper">
                      {estimate ? estimate.vehicleLabel : EMPTY_STAT}
                    </dd>
                  </div>
                </div>
              </dl>

              {estimate ? (
                <>
                  <dl className="mt-4 flex flex-col gap-1.5 border-t border-accent/15 pt-3.5">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className={BREAKDOWN_TERM_CLASSES}>
                        Transportation cost
                      </dt>
                      <dd className={BREAKDOWN_VALUE_CLASSES}>
                        {formatGel(transportationCost(estimate))}
                      </dd>
                    </div>
                    {/* Only worth a line when at least one was requested. */}
                    {estimate.helperFee > 0 ? (
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className={BREAKDOWN_TERM_CLASSES}>Helper Fee</dt>
                        <dd className={BREAKDOWN_VALUE_CLASSES}>
                          {formatGel(estimate.helperFee)}
                        </dd>
                      </div>
                    ) : null}
                    {/* The total these two add up to is the "Your estimate"
                        figure at the head of this very panel, a few lines up
                        and set four times this size. Repeating it under them
                        would only print the same number twice. */}
                  </dl>

                  {minimumFareApplied ? (
                    <p className="mt-2.5 text-xs text-accent">
                      Minimum fare applied
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>

            <button
              type="submit"
              // Also disabled until a vehicle type is known to quote against —
              // there is no picker to hold the form open on anymore, so this is
              // the only gate against a premature submit racing the taxonomy
              // fetch.
              disabled={submitting || loading || !cheapestVehicleType}
              className="mt-5 w-full rounded-full bg-accent px-5 py-3.5 text-[15px] leading-none font-semibold text-on-accent transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
            >
              {submitting
                ? "Calculating…"
                : loading
                  ? "Loading…"
                  : "Calculate price"}
            </button>

            {estimate ? (
              <Link
                href="/sign-up"
                className="group mt-4 inline-flex items-center gap-2 text-sm font-semibold text-paper transition-colors hover:text-accent"
              >
                Sign up to book this load
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
