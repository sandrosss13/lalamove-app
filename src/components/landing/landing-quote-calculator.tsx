"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { CargoCategory } from "@prisma/client";

import {
  CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES,
  CARGO_CATEGORY_LABELS,
} from "@/lib/cargo";
import { useLandingVehicleTypes } from "@/components/landing/landing-vehicle-types";

/** Cargo categories in the order the taxonomy declares them. */
const CARGO_CATEGORY_OPTIONS = Object.entries(CARGO_CATEGORY_LABELS) as [
  CargoCategory,
  string,
][];

const DEFAULT_CARGO_CATEGORY: CargoCategory = "FURNITURE_FURNISHINGS";

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

/** The focus ring is spelled out here because `globals.css` only rings links
 *  and buttons — form controls on this page style their own. */
const FIELD_CLASSES =
  "w-full rounded-lg border border-line bg-ink px-3.5 py-2.5 text-sm text-paper " +
  "transition-colors placeholder:text-muted/70 focus:border-accent focus:outline-none " +
  "focus:ring-2 focus:ring-accent/20";

const FIELD_LABEL_CLASSES =
  "flex items-center gap-2 text-[0.8125rem] font-medium text-paper";

const PANEL_LABEL_CLASSES =
  "text-[0.6875rem] font-semibold tracking-[0.1em] text-muted uppercase";

const BREAKDOWN_TERM_CLASSES = "text-[0.8125rem] text-muted";

const BREAKDOWN_VALUE_CLASSES = "font-price text-[0.8125rem] text-paper";

/**
 * Live quote card on the marketing page: a visitor prices a load before they
 * have an account. Estimate-only — it never creates an order, and it calls the
 * public `/api/pricing/estimate` endpoint rather than the auth-gated
 * autocomplete, so the addresses are plain text fields geocoded once, on
 * submit.
 */
export function LandingQuoteCalculator() {
  const pickupId = useId();
  const dropoffId = useId();
  const cargoCategoryId = useId();
  const helperId = useId();

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
  const [requiresHelper, setRequiresHelper] = useState(false);

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
  // "from $X" price before configuring anything.
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setEstimate(null);

    if (!cheapestVehicleType) {
      setError("Could not price this load. Please try again.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/pricing/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          dropoffAddress,
          vehicleTypeCode: cheapestVehicleType.code,
          cargoCategory,
          requiresHelper,
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

  // The components are floored by the vehicle's minimum fare, so on a short hop
  // they sum to less than the total charged. Say so, rather than printing
  // arithmetic that doesn't add up. The half-cent margin keeps floating-point
  // dust from reading as a floor.
  const minimumFareApplied =
    estimate !== null &&
    estimate.baseFare +
      estimate.distanceFare +
      estimate.timeFare +
      estimate.helperFee <
      estimate.price - 0.005;

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-rise [animation-delay:520ms] rounded-2xl border border-line bg-ink p-5 shadow-[0_18px_48px_-24px_rgba(32,31,28,0.35)] sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base leading-none font-semibold text-paper">
            See your price now
          </h2>
          <p className="mt-2 text-[0.8125rem] leading-snug text-muted">
            Price a load before you create an account.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.1em] text-accent uppercase">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
          />
          Estimate
        </span>
      </div>

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
          <label htmlFor={cargoCategoryId} className={FIELD_LABEL_CLASSES}>
            What are you moving
          </label>
          <select
            id={cargoCategoryId}
            value={cargoCategory}
            onChange={(event) => updateCargoCategory(event.target.value)}
            required
            className={FIELD_CLASSES}
          >
            {CARGO_CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <label
          htmlFor={helperId}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3.5 py-3 text-[0.8125rem] leading-snug text-paper transition-colors hover:border-accent/40"
        >
          <input
            id={helperId}
            type="checkbox"
            checked={requiresHelper}
            onChange={(event) => {
              setRequiresHelper(event.target.checked);
              clearQuote();
            }}
            className="h-4 w-4 shrink-0 accent-accent"
          />
          Request a helper for loading and unloading
        </label>
      </div>

      {message ? (
        <p
          role="alert"
          className="mt-3.5 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-accent"
        >
          {message}
        </p>
      ) : null}

      {/* Rendered before the first quote too, so the card doesn't grow a whole
          new panel under the visitor's cursor when the estimate lands. */}
      <div
        aria-live="polite"
        className="mt-4 rounded-xl border border-accent/20 bg-accent/[0.06] px-4 py-4"
      >
        <dl className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <dt className={PANEL_LABEL_CLASSES}>Your estimate</dt>
            <dd className="mt-1.5 font-price text-[2.125rem] leading-none font-semibold tracking-[-0.03em] text-accent">
              {estimate ? `$${estimate.price.toFixed(2)}` : EMPTY_STAT}
            </dd>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 text-right">
            <div>
              <dt className={PANEL_LABEL_CLASSES}>Distance</dt>
              <dd className="mt-1 font-price text-[0.8125rem] font-medium text-paper">
                {estimate ? `${estimate.distanceKm.toFixed(1)} km` : EMPTY_STAT}
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
                <dt className={BREAKDOWN_TERM_CLASSES}>Base fare</dt>
                <dd className={BREAKDOWN_VALUE_CLASSES}>
                  ${estimate.baseFare.toFixed(2)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className={BREAKDOWN_TERM_CLASSES}>Distance fare</dt>
                <dd className={BREAKDOWN_VALUE_CLASSES}>
                  ${estimate.distanceFare.toFixed(2)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className={BREAKDOWN_TERM_CLASSES}>Time fare</dt>
                <dd className={BREAKDOWN_VALUE_CLASSES}>
                  ${estimate.timeFare.toFixed(2)}
                </dd>
              </div>
              {/* Only worth a line when one was actually requested. */}
              {estimate.helperFee > 0 ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className={BREAKDOWN_TERM_CLASSES}>Helper</dt>
                  <dd className={BREAKDOWN_VALUE_CLASSES}>
                    ${estimate.helperFee.toFixed(2)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {minimumFareApplied ? (
              <p className="mt-2.5 text-xs text-accent">Minimum fare applied</p>
            ) : null}
          </>
        ) : null}
      </div>

      <button
        type="submit"
        // Also disabled until a vehicle type is known to quote against — there
        // is no picker to hold the form open on anymore, so this is the only
        // gate against a premature submit racing the taxonomy fetch.
        disabled={submitting || loading || !cheapestVehicleType}
        className="mt-4 w-full rounded-lg bg-accent px-5 py-3.5 text-[0.9375rem] leading-none font-semibold text-ink transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
      >
        {submitting ? "Calculating…" : loading ? "Loading…" : "Calculate price"}
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
  );
}
