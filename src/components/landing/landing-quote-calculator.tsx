"use client";

import { useId, useState } from "react";
import Link from "next/link";

/**
 * Selectable package types. Values mirror the `PackageType` Prisma enum; they
 * are duplicated here (rather than imported from `@prisma/client`) to keep the
 * server-only Prisma client out of the browser bundle.
 */
const PACKAGE_TYPE_OPTIONS = [
  { value: "DOCUMENT", label: "Document" },
  { value: "SMALL_PARCEL", label: "Small parcel" },
  { value: "MEDIUM_PARCEL", label: "Medium parcel" },
  { value: "LARGE_PARCEL", label: "Large parcel" },
] as const;

const DEFAULT_PACKAGE_TYPE = "SMALL_PARCEL";

/** Placeholder shown in the stat footer before the first estimate. */
const EMPTY_STAT = "—";

/** A finished estimate, with the package label captured alongside it. */
type Estimate = {
  distanceKm: number;
  price: number;
  packageLabel: string;
};

/** Shape of a successful `/api/pricing/estimate` response. */
type EstimateResponse = {
  distanceKm: number;
  price: number;
};

const FIELD_CLASSES =
  "w-full border border-line bg-ink px-3 py-2.5 text-sm text-paper " +
  "placeholder:text-muted/60 focus:border-accent focus:outline-none";

const FIELD_LABEL_CLASSES =
  "text-[0.6875rem] font-semibold tracking-[0.18em] text-muted uppercase";

const STAT_LABEL_CLASSES =
  "text-[0.625rem] font-semibold tracking-[0.18em] text-muted uppercase";

/** Colour is left to each stat, since two utilities on one element would
 *  otherwise race on CSS source order rather than the order written here. */
const STAT_VALUE_CLASSES = "mt-1 font-display text-xl leading-none uppercase";

/**
 * Live quote card on the marketing page: a visitor prices a route before they
 * have an account. Estimate-only — it never creates an order, and it calls the
 * public `/api/pricing/estimate` endpoint rather than the auth-gated
 * autocomplete, so the addresses are plain text fields geocoded once, on
 * submit.
 */
export function LandingQuoteCalculator() {
  const pickupId = useId();
  const dropoffId = useId();

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [packageType, setPackageType] = useState<string>(DEFAULT_PACKAGE_TYPE);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);

  /**
   * Any edit invalidates the quote on screen, so clear it — otherwise a price
   * for the previous route would sit under the new inputs.
   */
  function updateField(setter: (value: string) => void, value: string) {
    setter(value);
    setEstimate(null);
    setError(null);
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
        body: JSON.stringify({ pickupAddress, dropoffAddress, packageType }),
      });

      const payload = (await response.json()) as
        EstimateResponse | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : "Could not price this delivery. Please try again.";
        setError(message);
        return;
      }

      const { distanceKm, price } = payload as EstimateResponse;
      const selected = PACKAGE_TYPE_OPTIONS.find(
        (option) => option.value === packageType,
      );

      setEstimate({
        distanceKm,
        price,
        // Captured now so the footer keeps matching the quote even if the
        // visitor changes the selector afterwards.
        packageLabel: selected?.label ?? "Parcel",
      });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
            Price a delivery
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

            <fieldset className="flex flex-col gap-1.5">
              <legend className={FIELD_LABEL_CLASSES}>Package</legend>
              <div className="mt-1.5 grid grid-cols-2 gap-px bg-line">
                {PACKAGE_TYPE_OPTIONS.map((option) => {
                  const selected = option.value === packageType;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => updateField(setPackageType, option.value)}
                      className={`px-3 py-2.5 text-xs font-semibold tracking-[0.08em] uppercase transition-colors ${
                        selected
                          ? "bg-accent text-ink"
                          : "bg-ink text-muted hover:text-paper"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {error ? (
              <p
                role="alert"
                className="border border-accent/40 bg-accent/10 px-3 py-2 text-[0.8125rem] leading-snug text-accent"
              >
                {error}
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
            <dt className={STAT_LABEL_CLASSES}>Package</dt>
            <dd className={`${STAT_VALUE_CLASSES} text-paper`}>
              {estimate ? estimate.packageLabel : EMPTY_STAT}
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
          <div className="border-t border-line px-5 py-4">
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 text-sm font-semibold text-paper transition-colors hover:text-accent"
            >
              Sign up to book this delivery
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
