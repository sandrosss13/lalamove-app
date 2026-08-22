"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { CargoCategory } from "@prisma/client";

import { AddressAutocomplete } from "@/components/address-autocomplete";
import { CARGO_OPTIONS } from "@/components/home/order-cargo-options";
import {
  formatVehicleDimensions,
  formatVehiclePayload,
  useOrderVehicleTypes,
  type OrderVehicleType,
} from "@/components/home/order-vehicle-types";
import { RoutePreviewMap } from "@/components/home/route-preview-map";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES } from "@/lib/cargo";

/** A single map coordinate, as `AddressAutocomplete` reports it. Mirrors
 *  `LatLng` from `@/lib/geo`, duplicated here so this client component never
 *  imports the server-only geo module — the same reflex as
 *  `route-preview-map.tsx` and `address-autocomplete.tsx`. */
type LatLng = {
  lat: number;
  lng: number;
};

/**
 * The fare breakdown both `/api/pricing/estimate` and `/api/orders` return.
 * The estimate endpoint returns exactly this; the orders endpoint returns it
 * alongside the created order's id (see `CreatedOrder`).
 */
type Quote = {
  distanceKm: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  helperFee: number;
  price: number;
};

/**
 * Fields of the created order the form surfaces back to the user — the itemised
 * quote it was booked at, not just the total.
 */
type CreatedOrder = Quote & { id: string };

/**
 * The first cargo category the taxonomy declares, used as the initial
 * selection so the vehicle step always has something to filter against.
 *
 * The `??` is not dead code to TypeScript: `noUncheckedIndexedAccess` types an
 * indexed read as possibly `undefined`, and there is no type-level guarantee
 * that `CARGO_OPTIONS` is non-empty. The fallback names the category the form
 * defaulted to before this rewrite, so an (impossible) empty taxonomy degrades
 * to the previous behavior rather than to a crash.
 */
const DEFAULT_CARGO_CATEGORY: CargoCategory =
  CARGO_OPTIONS[0]?.category ?? "FURNITURE_FURNISHINGS";

/**
 * Tolerance, in currency units, for comparing a total against the sum of its
 * parts: half a cent absorbs floating-point drift without ever masking a real
 * difference, which is at least one whole cent.
 */
const CURRENCY_EPSILON = 0.005;

/** Placeholder for a figure that isn't known yet. */
const EMPTY_STAT = "—";

const QUOTE_FAILED_MESSAGE = "Could not price this load. Please try again.";

const ORDER_FAILED_MESSAGE = "Could not create the order. Please try again.";

const NETWORK_ERROR_MESSAGE =
  "Network error. Please check your connection and try again.";

const PANEL_LABEL_CLASSES =
  "text-[0.6875rem] font-semibold tracking-[0.1em] text-muted uppercase";

const BREAKDOWN_TERM_CLASSES = "text-[0.8125rem] text-muted";

const BREAKDOWN_VALUE_CLASSES = "font-price text-[0.8125rem] text-paper";

/** Shared geometry for the two pickable card grids (goods and vehicles). */
const PICK_CARD_BASE_CLASSES =
  "relative flex flex-col rounded-xl border p-3.5 text-left transition-colors";

const PICK_CARD_SELECTED_CLASSES = "border-accent bg-accent/[0.06]";

const PICK_CARD_IDLE_CLASSES =
  "border-line hover:border-accent/40 hover:bg-surface";

/**
 * Line-art glyphs for the two duty classes.
 *
 * Written fresh here rather than imported from `landing-vehicles.tsx`: that
 * module is the marketing page's, and these are sized and coloured for a
 * picker card. Small duplicated SVG helpers are this codebase's existing
 * convention (`landing-vehicles.tsx` keeps its own pair for the same reason).
 */
function VanGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path d="M1 18V6h28l11 7v5" />
      <path d="M1 18h4M14 18h13M37 18h10" />
      <path d="M22 6v7h17" />
      <circle cx="9" cy="18" r="3" />
      <circle cx="32" cy="18" r="3" />
    </svg>
  );
}

function TruckGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path d="M1 18V4h25v14" />
      <path d="M26 9h9l6 6v3" />
      <path d="M1 18h4M15 18h13M38 18h9" />
      <circle cx="10" cy="18" r="3" />
      <circle cx="33" cy="18" r="3" />
    </svg>
  );
}

/**
 * Which glyph stands for which duty class. A `Record` keyed by the category
 * union keeps this exhaustive: adding a duty class fails typecheck until it is
 * given a glyph here.
 */
const VEHICLE_CATEGORY_GLYPHS: Record<
  OrderVehicleType["category"],
  (props: { className?: string }) => React.ReactElement
> = {
  MEDIUM_DUTY: VanGlyph,
  HEAVY_DUTY: TruckGlyph,
};

/**
 * One numbered step of the form. The number is a decoration — the title
 * carries the meaning — so the badge is hidden from assistive tech.
 */
function StepCard({
  step,
  title,
  description,
  children,
}: {
  /** Omitted for the unnumbered "Additional details" card. */
  step?: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-4 bg-ink text-paper ring-line">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 font-display text-base font-semibold text-paper">
          {step === undefined ? null : (
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[0.6875rem] font-semibold text-ink"
            >
              {step}
            </span>
          )}
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="text-[0.8125rem] leading-snug text-muted">
            {description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** The orange tick that marks the selected card in either picker grid. */
function SelectedTick() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-2.5 right-2.5 flex size-4 items-center justify-center rounded-full bg-accent text-ink"
    >
      <Check className="size-2.5" strokeWidth={3} />
    </span>
  );
}

/** One `dt`/`dd` pair of the fare breakdown. */
function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={BREAKDOWN_TERM_CLASSES}>{label}</dt>
      <dd className={BREAKDOWN_VALUE_CLASSES}>{value}</dd>
    </div>
  );
}

/**
 * The client booking form: route, goods, vehicle and extras on the left, a
 * route preview on the right. Priced on demand — the user presses Calculate to
 * quote against `/api/pricing/estimate`, and any further edit to the route,
 * goods, vehicle or helper choice invalidates that quote until it's
 * recalculated — then booked through `POST /api/orders`.
 *
 * Prop-less by design — it owns all of its own state and is only ever rendered
 * from `HomeEntry`'s signed-in-client branch.
 *
 * Deliberately absent, because the backend has no concept of either: a service
 * level (there is one flat price) and a scheduled pickup time (dispatch is
 * immediate). Multi-stop routes are absent for the same reason — an `Order` has
 * exactly one pickup and one dropoff.
 */
export function BookingForm(): React.ReactElement {
  const helperId = useId();
  const descriptionId = useId();
  const formId = useId();

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  // Null until the matching address is *selected* from the autocomplete: these
  // gate the live estimate, so typing alone never spends a request.
  const [pickupLocation, setPickupLocation] = useState<LatLng | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<LatLng | null>(null);

  const [cargoCategory, setCargoCategory] = useState<CargoCategory>(
    DEFAULT_CARGO_CATEGORY,
  );
  const [vehicleTypeCode, setVehicleTypeCode] = useState("");
  const [requiresHelper, setRequiresHelper] = useState(false);
  const [description, setDescription] = useState("");

  const [estimate, setEstimate] = useState<Quote | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedOrder | null>(null);

  // The map is a companion to the form on desktop and an opt-in panel on
  // mobile. This only drives a `hidden`/`block` swap — the map is never
  // conditionally unmounted, or it would re-mount (and re-bill) the Google Maps
  // script every time it was toggled.
  const [mapVisible, setMapVisible] = useState(false);

  // A remount key for the two address fields. Booking clears the addresses, but
  // each field also owns a structured breakdown of the place behind it; without
  // this the sub-form would linger under a now-empty input.
  const [addressFieldsKey, setAddressFieldsKey] = useState(0);

  const {
    vehicleTypes,
    loading: loadingVehicleTypes,
    error: vehicleTypesError,
  } = useOrderVehicleTypes();

  /**
   * The vehicle types this cargo may legally travel in, cheapest first.
   *
   * Cheapest-first is what makes `[0]` the best fit — the same heuristic the
   * landing page's quote calculator already uses to pick a vehicle on the
   * visitor's behalf.
   */
  const eligibleVehicleTypes = useMemo(() => {
    const allowed = CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory];

    return vehicleTypes
      .filter((vehicleType) => allowed.includes(vehicleType.category))
      .sort((a, b) => a.pricingRule.baseFare - b.pricingRule.baseFare);
  }, [vehicleTypes, cargoCategory]);

  const bestFitVehicleType = eligibleVehicleTypes[0] ?? null;

  const selectedVehicleType =
    eligibleVehicleTypes.find(
      (vehicleType) => vehicleType.code === vehicleTypeCode,
    ) ?? null;

  /**
   * Keep the picker on a vehicle the current cargo is actually allowed in.
   *
   * Runs on mount (once the taxonomy lands) and whenever the cargo category
   * changes. A selection that is no longer eligible is replaced by the best fit
   * rather than cleared: an empty picker would just be a dead end the user has
   * to resolve, and the cheapest eligible type is the one they would be offered
   * anyway. Setting the code makes the selection valid, so this settles after
   * one extra render rather than looping.
   */
  useEffect(() => {
    const bestFit = eligibleVehicleTypes[0];
    if (!bestFit) {
      return;
    }

    const stillEligible = eligibleVehicleTypes.some(
      (vehicleType) => vehicleType.code === vehicleTypeCode,
    );

    if (!stillEligible) {
      setVehicleTypeCode(bestFit.code);
    }
  }, [eligibleVehicleTypes, vehicleTypeCode]);

  // The in-flight estimate request, if any — kept in a ref (not state) since
  // it's only ever read from event handlers and cleanup, never rendered.
  const estimateAbortRef = useRef<AbortController | null>(null);

  /**
   * A quote is only ever valid for the exact inputs it was computed from.
   * Rather than let a stale price sit under a since-changed route, goods,
   * vehicle or helper choice, any change to one of them invalidates it —
   * dropping any in-flight request too — so "Book delivery" disappears back
   * into "Calculate" until the user asks for a fresh number.
   */
  useEffect(() => {
    estimateAbortRef.current?.abort();
    setEstimate(null);
    setEstimateError(null);
    setEstimating(false);
  }, [
    pickupAddress,
    dropoffAddress,
    pickupLocation,
    dropoffLocation,
    vehicleTypeCode,
    cargoCategory,
    requiresHelper,
  ]);

  // Deliberately keyed off the raw address *text*, not `pickupLocation`/
  // `dropoffLocation`: those only populate once a suggestion is picked from
  // the browser-side Google Places autocomplete, but `/api/pricing/estimate`
  // geocodes whatever address string it's given itself, server-side, through
  // a separate provider (LocationIQ) — it needs no client-side resolution at
  // all. Gating on the resolved location would leave Calculate permanently
  // disabled on any deployment where the Places key isn't configured, even
  // though pricing works fine. (Requiring resolved coordinates made sense for
  // the old *automatic* per-keystroke estimate, to avoid spending a request
  // per character typed — it doesn't apply to an explicit button click.)
  const canCalculate =
    !estimating &&
    pickupAddress.trim().length > 0 &&
    dropoffAddress.trim().length > 0 &&
    vehicleTypeCode !== "";

  /**
   * Quote the current inputs on demand. The `AbortController` guards against
   * the input changing (and so invalidating this very request, see above)
   * while it's in flight — the same pattern `address-autocomplete.tsx` uses
   * for its suggestion lookups.
   */
  async function handleCalculate() {
    if (!canCalculate) {
      return;
    }

    estimateAbortRef.current?.abort();
    const controller = new AbortController();
    estimateAbortRef.current = controller;

    setEstimating(true);
    setEstimateError(null);

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
        signal: controller.signal,
      });

      const payload = (await response.json()) as Quote | { error?: string };

      // Superseded by an input change (and so already invalidated above) or
      // by a newer calculation — either way, this result has nothing to add.
      if (controller.signal.aborted) {
        return;
      }

      if (!response.ok) {
        setEstimateError(
          "error" in payload && payload.error
            ? payload.error
            : QUOTE_FAILED_MESSAGE,
        );
        return;
      }

      setEstimate(payload as Quote);
    } catch {
      if (!controller.signal.aborted) {
        setEstimateError(NETWORK_ERROR_MESSAGE);
      }
    } finally {
      if (!controller.signal.aborted) {
        setEstimating(false);
      }
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          dropoffAddress,
          cargoCategory,
          vehicleTypeCode,
          requiresHelper,
          description: description.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as
        CreatedOrder | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : ORDER_FAILED_MESSAGE;
        setError(message);
        return;
      }

      setResult(payload as CreatedOrder);

      // The booked order is now the record of what was requested, so the form
      // goes back to empty rather than inviting an accidental re-submit of the
      // same route. The cargo and vehicle choices are kept: they describe the
      // kind of work this client does, not this one job.
      setPickupAddress("");
      setDropoffAddress("");
      setPickupLocation(null);
      setDropoffLocation(null);
      setDescription("");
      setRequiresHelper(false);
      setEstimate(null);
      setEstimateError(null);
      setAddressFieldsKey((key) => key + 1);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Enter, pressed anywhere in the form other than the multi-line
   * description, does the same thing clicking the visible primary action
   * would — Calculate if there isn't a current quote yet, otherwise nothing.
   *
   * Without this, the browser's own implicit-submission behavior takes over:
   * a lone text `<input>` inside a `<form>` submits that form on Enter even
   * with no visible submit button on screen, because "Book delivery" is still
   * form-associated (via `form={formId}`) the moment it exists at all. Before
   * a quote exists it isn't rendered — so that implicit submit had nothing to
   * click, and Chrome fell back to just running constraint validation, which
   * surfaces as a confusing "Please fill in this field" bubble on whichever
   * required field is empty, for someone who never touched a submit button.
   * Explicitly handling Enter here — and always calling `preventDefault()` —
   * removes that native behavior entirely rather than trying to out-guess it.
   */
  function handleFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") {
      return;
    }

    // Enter inserts a newline in the description field; let it.
    if (event.target instanceof HTMLTextAreaElement) {
      return;
    }

    event.preventDefault();

    if (estimate === null) {
      void handleCalculate();
    }

    // A quote already exists: Enter deliberately does nothing rather than
    // booking. Placing a real order isn't a side effect a stray Enter
    // keypress should be able to trigger — that stays a deliberate click on
    // "Book delivery".
  }

  /**
   * The quoted total is floored at the vehicle type's minimum fare, so it can
   * come out above the sum of the components — worth saying, or the breakdown
   * reads as bad arithmetic. The half-cent margin keeps floating-point dust
   * from reading as a floor.
   */
  function minimumFareApplied(quote: Quote): boolean {
    return (
      quote.price - CURRENCY_EPSILON >
      quote.baseFare + quote.distanceFare + quote.timeFare + quote.helperFee
    );
  }

  // Booking requires a calculated price for the exact inputs being booked —
  // the whole point of the Calculate step — plus a valid vehicle type, so the
  // submit cannot race the fetch that supplies one. The address fields keep
  // their own native `required` validation, which still runs because the
  // button is only disabled for reasons the user cannot fix by filling the
  // form in.
  const canSubmit =
    !submitting && selectedVehicleType !== null && estimate !== null;

  return (
    <main className="min-h-screen bg-ink text-paper">
      <div className="mx-auto max-w-7xl px-5 pt-8 pb-28 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.24em] text-accent uppercase">
              New delivery
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-none font-semibold tracking-[-0.025em] text-paper">
              Book a delivery
            </h1>
          </div>
          <Link
            href="/orders"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-paper transition-colors hover:text-accent"
          >
            My orders
            <span
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </header>

        {result ? (
          <div
            role="status"
            className="mt-6 rounded-xl border border-emerald-600/30 bg-emerald-50 p-4"
          >
            <p className="font-display text-base font-semibold text-emerald-900">
              Order booked
            </p>
            <p className="mt-1 text-[0.8125rem] leading-snug text-emerald-800">
              We&rsquo;re matching your delivery with a driver now.
            </p>

            <dl className="mt-3.5 flex flex-col gap-1.5 border-t border-emerald-600/20 pt-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[0.8125rem] text-emerald-800">Distance</dt>
                <dd className="font-price text-[0.8125rem] text-emerald-900">
                  {result.distanceKm.toFixed(2)} km
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[0.8125rem] text-emerald-800">Base fare</dt>
                <dd className="font-price text-[0.8125rem] text-emerald-900">
                  ${result.baseFare.toFixed(2)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[0.8125rem] text-emerald-800">
                  Distance fare
                </dt>
                <dd className="font-price text-[0.8125rem] text-emerald-900">
                  ${result.distanceFare.toFixed(2)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[0.8125rem] text-emerald-800">Time fare</dt>
                <dd className="font-price text-[0.8125rem] text-emerald-900">
                  ${result.timeFare.toFixed(2)}
                </dd>
              </div>
              {/* Only worth a line when one was actually requested. */}
              {result.helperFee > 0 ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[0.8125rem] text-emerald-800">Helper</dt>
                  <dd className="font-price text-[0.8125rem] text-emerald-900">
                    ${result.helperFee.toFixed(2)}
                  </dd>
                </div>
              ) : null}
              <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-emerald-600/20 pt-2.5">
                <dt className="text-[0.8125rem] font-semibold text-emerald-900">
                  Total
                </dt>
                <dd className="font-price text-base font-semibold text-emerald-900">
                  ${result.price.toFixed(2)}
                </dd>
              </div>
            </dl>

            {minimumFareApplied(result) ? (
              <p className="mt-2.5 text-xs text-emerald-800">
                Minimum fare applied for this vehicle type.
              </p>
            ) : null}

            <Link
              href="/orders"
              className="mt-3.5 inline-flex items-center gap-2 text-[0.8125rem] font-semibold text-emerald-900 underline underline-offset-4 hover:opacity-70"
            >
              View your orders
            </Link>
          </div>
        ) : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]">
          <form
            id={formId}
            onSubmit={handleSubmit}
            onKeyDown={handleFormKeyDown}
            className="flex flex-col gap-5"
          >
            <StepCard step={1} title="Route">
              <div className="flex flex-col gap-4">
                <AddressAutocomplete
                  // Remounted after a booking so the structured breakdown each
                  // field owns is cleared along with the address string.
                  key={`pickup-${addressFieldsKey}`}
                  id="pickup-address"
                  label="Pickup address"
                  value={pickupAddress}
                  onChange={setPickupAddress}
                  onLocationChange={setPickupLocation}
                  placeholder="e.g. Rustaveli Ave 12, Tbilisi"
                  required
                />

                <AddressAutocomplete
                  key={`dropoff-${addressFieldsKey}`}
                  id="dropoff-address"
                  label="Dropoff address"
                  value={dropoffAddress}
                  onChange={setDropoffAddress}
                  onLocationChange={setDropoffLocation}
                  placeholder="e.g. Aghmashenebeli Ave 88, Tbilisi"
                  required
                />
              </div>
            </StepCard>

            <StepCard
              step={2}
              title="What are you moving?"
              description="Pick the closest match — it decides which vehicles can take the job."
            >
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {CARGO_OPTIONS.map((option) => {
                  const { category, label, Icon } = option;
                  const selected = category === cargoCategory;

                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setCargoCategory(category)}
                      className={`${PICK_CARD_BASE_CLASSES} gap-1.5 ${
                        selected
                          ? PICK_CARD_SELECTED_CLASSES
                          : PICK_CARD_IDLE_CLASSES
                      }`}
                    >
                      <Icon
                        aria-hidden="true"
                        className={`size-5 ${selected ? "text-accent" : "text-muted"}`}
                      />
                      <span className="pr-4 text-[0.8125rem] leading-snug font-semibold text-paper">
                        {label}
                      </span>
                      <span className="text-xs leading-snug text-muted">
                        {option.description}
                      </span>
                      {selected ? <SelectedTick /> : null}
                    </button>
                  );
                })}
              </div>
            </StepCard>

            <StepCard
              step={3}
              title="Recommended vehicle"
              description="Only vehicles cleared for your goods are shown, cheapest first."
            >
              {vehicleTypesError ? (
                <p role="alert" className="text-[0.8125rem] text-accent">
                  {vehicleTypesError}
                </p>
              ) : loadingVehicleTypes ? (
                <p aria-busy="true" className="text-[0.8125rem] text-muted">
                  Loading vehicle types…
                </p>
              ) : eligibleVehicleTypes.length === 0 ? (
                <p role="alert" className="text-[0.8125rem] text-accent">
                  No vehicle is currently available for these goods. Please pick
                  a different category.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {eligibleVehicleTypes.map((vehicleType) => {
                    const selected = vehicleType.code === vehicleTypeCode;
                    const isBestFit =
                      bestFitVehicleType?.code === vehicleType.code;
                    const Glyph = VEHICLE_CATEGORY_GLYPHS[vehicleType.category];

                    return (
                      <button
                        key={vehicleType.code}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setVehicleTypeCode(vehicleType.code)}
                        className={`${PICK_CARD_BASE_CLASSES} ${
                          selected
                            ? PICK_CARD_SELECTED_CLASSES
                            : PICK_CARD_IDLE_CLASSES
                        }`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <Glyph
                            className={`h-6 w-12 shrink-0 ${
                              selected ? "text-accent" : "text-muted"
                            }`}
                          />
                          {/* Teal, never orange: "cheapest option" is a
                              different signal from "what you picked". */}
                          {isBestFit ? (
                            <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[0.5625rem] font-semibold tracking-[0.1em] text-emerald-700 uppercase">
                              Best
                            </span>
                          ) : null}
                        </span>

                        <span className="mt-2.5 pr-4 text-[0.8125rem] leading-snug font-semibold text-paper">
                          {vehicleType.label}
                        </span>
                        <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-price text-[0.6875rem] text-muted">
                          <span>
                            {formatVehicleDimensions(
                              vehicleType.cargoLengthM,
                              vehicleType.cargoWidthM,
                              vehicleType.cargoHeightM,
                            )}
                          </span>
                          <span>
                            up to{" "}
                            {formatVehiclePayload(vehicleType.maxPayloadKg)}
                          </span>
                        </span>

                        {selected ? <SelectedTick /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </StepCard>

            <StepCard title="Additional details">
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={helperId}
                    checked={requiresHelper}
                    onCheckedChange={(checked) =>
                      setRequiresHelper(checked === true)
                    }
                    className="mt-0.5 border-line data-checked:border-accent data-checked:bg-accent data-checked:text-ink"
                  />
                  <Label
                    htmlFor={helperId}
                    className="flex flex-col items-start gap-1 leading-snug"
                  >
                    <span className="text-[0.8125rem] font-medium text-paper">
                      Request a helper / mover
                    </span>
                    <span className="text-xs leading-snug font-normal text-muted">
                      An extra pair of hands for loading and unloading, charged
                      as a flat fee on top of the fare.
                    </span>
                  </Label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={descriptionId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    Description (optional)
                  </Label>
                  <Textarea
                    id={descriptionId}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    placeholder="Anything the driver should know"
                    className="border-line text-sm focus-visible:border-accent focus-visible:ring-accent/20"
                  />
                </div>
              </div>
            </StepCard>

            {/* Rendered before the first estimate too, so the column doesn't
                grow a whole new panel under the user's cursor when one lands. */}
            <section
              aria-live="polite"
              className="rounded-xl border border-line bg-surface px-4 py-4"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className={PANEL_LABEL_CLASSES}>Price breakdown</h2>
                <p className="text-[0.6875rem] text-muted">
                  {estimating ? "Calculating…" : null}
                </p>
              </div>

              {estimate ? (
                <>
                  <dl className="mt-3 flex flex-col gap-1.5">
                    <BreakdownRow
                      label="Distance"
                      value={`${estimate.distanceKm.toFixed(1)} km`}
                    />
                    <BreakdownRow
                      label="Base fare"
                      value={`$${estimate.baseFare.toFixed(2)}`}
                    />
                    <BreakdownRow
                      label="Distance fare"
                      value={`$${estimate.distanceFare.toFixed(2)}`}
                    />
                    <BreakdownRow
                      label="Time fare"
                      value={`$${estimate.timeFare.toFixed(2)}`}
                    />
                    {/* Only worth a line when one was actually requested. */}
                    {estimate.helperFee > 0 ? (
                      <BreakdownRow
                        label="Helper"
                        value={`$${estimate.helperFee.toFixed(2)}`}
                      />
                    ) : null}
                  </dl>

                  {minimumFareApplied(estimate) ? (
                    <p className="mt-2.5 text-xs text-accent">
                      Minimum fare applied for this vehicle type.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-[0.8125rem] leading-snug text-muted">
                  {canCalculate
                    ? "Press Calculate to see your price."
                    : "Fill in both addresses and choose a vehicle, then press Calculate to see your price."}
                </p>
              )}

              {estimateError ? (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-accent"
                >
                  {estimateError}
                </p>
              ) : null}
            </section>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-accent"
              >
                {error}
              </p>
            ) : null}

          </form>

          <div className="lg:sticky lg:top-6">
            <button
              type="button"
              onClick={() => setMapVisible((visible) => !visible)}
              aria-expanded={mapVisible}
              aria-controls="route-preview"
              className="w-full rounded-xl border border-line px-4 py-3 text-[0.8125rem] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent lg:hidden"
            >
              {mapVisible ? "Hide route map" : "Show route map"}
            </button>

            <div
              id="route-preview"
              // A class swap rather than a conditional render: the map must
              // mount exactly once, whatever the viewport or the toggle state,
              // or the Google Maps script would load twice.
              className={`mt-3 lg:mt-0 lg:block ${mapVisible ? "block" : "hidden"}`}
            >
              <RoutePreviewMap
                pickup={pickupLocation}
                pickupLabel={pickupAddress}
                dropoff={dropoffLocation}
                dropoffLabel={dropoffAddress}
                distanceKm={estimate?.distanceKm ?? null}
                vehicleLabel={selectedVehicleType?.label ?? null}
              />
            </div>
          </div>
        </div>
      </div>

      {/* A genuinely `fixed` bar, not a `sticky` one: this form is several
          screens tall, and `position: sticky` pins an element to the viewport
          edge for the entire scroll of a tall container, not just once the
          user nears its natural position — which permanently buried the
          vehicle picker and everything below it under this bar. `fixed`
          floats it above the page instead, outside the scrolling column
          entirely; `formId` is what still lets its submit button act on the
          form even though it's no longer one of its descendants. The content
          column keeps `pb-28` above so the true end of the page always clears
          this bar once scrolled all the way down. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 backdrop-blur supports-[backdrop-filter]:bg-ink/85">
        <div className="mx-auto max-w-7xl px-5 py-3.5 sm:px-8">
          <div className="flex items-end justify-between gap-4 lg:max-w-[40rem]">
            <div className="min-w-0">
              <p className={PANEL_LABEL_CLASSES}>Estimated total</p>
              <p className="mt-1.5 font-price text-[2.125rem] leading-none font-semibold tracking-[-0.03em] text-accent">
                {estimate ? `$${estimate.price.toFixed(2)}` : EMPTY_STAT}
              </p>
            </div>

            {estimate ? (
              <Button
                type="submit"
                form={formId}
                disabled={!canSubmit}
                className="h-12 shrink-0 gap-2 rounded-full bg-accent px-6 text-[0.9375rem] font-semibold text-ink transition-transform hover:bg-accent hover:-translate-y-0.5 disabled:translate-y-0"
              >
                {submitting ? "Booking…" : "Book delivery"}
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handleCalculate()}
                disabled={!canCalculate}
                className="h-12 shrink-0 gap-2 rounded-full bg-accent px-6 text-[0.9375rem] font-semibold text-ink transition-transform hover:bg-accent hover:-translate-y-0.5 disabled:translate-y-0"
              >
                {estimating ? "Calculating…" : "Calculate"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
