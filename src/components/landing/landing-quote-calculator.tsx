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

/** Placeholder shown in the stat footer before the first estimate. */
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

const FIELD_CLASSES =
  "w-full border border-line bg-ink px-3 py-2.5 text-sm text-paper " +
  "placeholder:text-muted/60 focus:border-accent focus:outline-none " +
  "disabled:opacity-60";

const FIELD_LABEL_CLASSES =
  "text-[0.6875rem] font-semibold tracking-[0.18em] text-muted uppercase";

const STAT_LABEL_CLASSES =
  "text-[0.625rem] font-semibold tracking-[0.18em] text-muted uppercase";

/** Colour is left to each stat, since two utilities on one element would
 *  otherwise race on CSS source order rather than the order written here. */
const STAT_VALUE_CLASSES = "mt-1 font-display text-xl leading-none uppercase";

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
  const vehicleTypeId = useId();
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
  const [vehicleTypeCode, setVehicleTypeCode] = useState("");
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

  /**
   * Changing the cargo re-filters the vehicle list, so a selection the new
   * category cannot use is dropped rather than left showing under a list that
   * no longer offers it.
   */
  function updateCargoCategory(value: string) {
    const next = value as CargoCategory;
    setCargoCategory(next);
    clearQuote();

    const allowed = CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[next];
    const selected = vehicleTypes.find(
      (vehicleType) => vehicleType.code === vehicleTypeCode,
    );

    if (!selected || !allowed.includes(selected.category)) {
      setVehicleTypeCode("");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setEstimate(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/pricing/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          dropoffAddress,
          vehicleTypeCode,
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

      const selected = availableVehicleTypes.find(
        (vehicleType) => vehicleType.code === vehicleTypeCode,
      );

      setEstimate({
        ...(payload as EstimateResponse),
        // Captured now so the footer keeps matching the quote even if the
        // visitor changes the selector afterwards.
        vehicleLabel: selected?.label ?? "Vehicle",
      });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // A quote failure is the more urgent of the two, and a visitor can only hit
  // one of them at a time anyway: the picker is disabled while the list is
  // missing, so the form cannot be submitted then.
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
    <div className="animate-rise [animation-delay:520ms] relative lg:rotate-2">
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-2 translate-y-2 border border-line"
      />
      <form
        onSubmit={handleSubmit}
        className="landing-grain relative border border-line bg-surface"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="font-display text-lg leading-none tracking-[0.14em] text-muted uppercase">
            Price a load
          </span>
          <span className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.18em] text-accent uppercase">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
            />
            Estimate
          </span>
        </header>

        <div className="flex gap-4 px-5 py-6">
          <div aria-hidden="true" className="flex flex-col items-center pt-7">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-accent" />
            <span className="my-1 w-px flex-1 bg-line" />
            <span className="h-2.5 w-2.5 bg-accent" />
          </div>

          <div className="flex flex-1 flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={pickupId} className={FIELD_LABEL_CLASSES}>
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
                Cargo
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor={vehicleTypeId} className={FIELD_LABEL_CLASSES}>
                Vehicle
              </label>
              <select
                id={vehicleTypeId}
                value={vehicleTypeCode}
                onChange={(event) =>
                  updateField(setVehicleTypeCode, event.target.value)
                }
                required
                // Disabled until the taxonomy is on screen, so the form can't be
                // submitted with a type the picker hasn't offered yet.
                disabled={loading || vehicleTypesError !== null}
                className={FIELD_CLASSES}
              >
                <option value="" disabled>
                  {loading ? "Loading vehicles…" : "Select a vehicle…"}
                </option>
                {availableVehicleTypes.map((vehicleType) => (
                  <option key={vehicleType.code} value={vehicleType.code}>
                    {vehicleType.label} · {vehicleType.maxPayloadKg} kg
                  </option>
                ))}
              </select>
            </div>

            <label
              htmlFor={helperId}
              className="flex items-center gap-3 text-[0.8125rem] leading-snug text-muted"
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

            {message ? (
              <p
                role="alert"
                className="border border-accent/40 bg-accent/10 px-3 py-2 text-[0.8125rem] leading-snug text-accent"
              >
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="bg-accent px-5 py-3 font-display text-xl leading-none tracking-[0.06em] text-ink uppercase transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
            >
              {submitting ? "Calculating…" : "Calculate"}
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-3 border-t border-line">
          <div className="border-r border-line px-5 py-4">
            <dt className={STAT_LABEL_CLASSES}>Vehicle</dt>
            <dd className={`${STAT_VALUE_CLASSES} text-paper`}>
              {estimate ? estimate.vehicleLabel : EMPTY_STAT}
            </dd>
          </div>
          <div className="border-r border-line px-5 py-4">
            <dt className={STAT_LABEL_CLASSES}>Distance</dt>
            <dd className={`${STAT_VALUE_CLASSES} text-paper`}>
              {estimate ? `${estimate.distanceKm.toFixed(1)} km` : EMPTY_STAT}
            </dd>
          </div>
          <div className="px-5 py-4">
            <dt className={STAT_LABEL_CLASSES}>Total</dt>
            <dd className={`${STAT_VALUE_CLASSES} text-accent`}>
              {estimate ? `$${estimate.price.toFixed(2)}` : EMPTY_STAT}
            </dd>
          </div>
        </dl>

        {estimate ? (
          <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <li>Base ${estimate.baseFare.toFixed(2)}</li>
              <li>Distance ${estimate.distanceFare.toFixed(2)}</li>
              <li>Time ${estimate.timeFare.toFixed(2)}</li>
              {/* Only worth a line when one was actually requested. */}
              {estimate.helperFee > 0 ? (
                <li>Helper ${estimate.helperFee.toFixed(2)}</li>
              ) : null}
              {minimumFareApplied ? (
                <li className="text-accent">Minimum fare applied</li>
              ) : null}
            </ul>

            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 text-sm font-semibold text-paper transition-colors hover:text-accent"
            >
              Sign up to book this load
              <span
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
          </div>
        ) : null}
      </form>
    </div>
  );
}
