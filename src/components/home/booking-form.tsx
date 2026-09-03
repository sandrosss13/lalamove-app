"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import type { CargoCategory } from "@prisma/client";

import { AddressAutocomplete } from "@/components/address-autocomplete";
import {
  formatBookedDistanceKm,
  formatDistanceKm,
  formatGel,
} from "@/components/home/booking-format";
import {
  BreakdownRow,
  PICK_CARD_BASE_CLASSES,
  PICK_CARD_IDLE_CLASSES,
  PICK_CARD_SELECTED_CLASSES,
  SelectedTick,
  StepCard,
  TruckGlyph,
  VanGlyph,
} from "@/components/home/booking-form-primitives";
import { CARGO_OPTIONS } from "@/components/home/order-cargo-options";
import {
  formatVehicleDimensions,
  formatVehiclePayload,
  useOrderVehicleTypes,
  type OrderVehicleType,
} from "@/components/home/order-vehicle-types";
import { RoutePreviewMap } from "@/components/home/route-preview-map";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
 *
 * `routePath`, `durationMinutes`, `pickup` and `dropoff` are optional because
 * only the estimate endpoint carries them: `/api/orders` answers with the
 * persisted `Order` row, which stores the price and the distance it was booked
 * at but has no column for the route geometry, its duration, or the resolved
 * points themselves (those live on the row as separate `pickupLat`/`pickupLng`
 * fields, not this shape).
 */
type Quote = {
  distanceKm: number;
  /**
   * The road geometry of the quoted route, or `null` when the server could not
   * route and priced on straight-line distance instead.
   */
  routePath?: LatLng[] | null;
  /** Driving time for the quoted route, on whichever of those two bases. */
  durationMinutes?: number | null;
  /**
   * The pickup/dropoff points LocationIQ resolved the addresses to — the exact
   * coordinates the route and the price are based on, which is not always what
   * Google's Places autocomplete pinned for the same address (a long street can
   * resolve to a different point along it). Once an estimate exists, the map
   * should show its markers here rather than at the Places pin, so the route
   * line drawn between them actually touches both markers.
   */
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
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

/**
 * Geometry for one cell of the crew-size row. Narrower than a pick card — it
 * holds a single numeral — but borrows that grid's border and fill states so
 * the two pickers read as the same control at different sizes.
 *
 * The radio inside each cell is `sr-only` (see the picker itself), so the cell
 * has to draw the focus ring on its behalf — the same `has-[:focus-visible]:`
 * stand-in the driver hub's radio rows use, in this palette's accent.
 */
const CREW_OPTION_CLASSES =
  "relative flex h-11 cursor-pointer items-center justify-center rounded-xl border font-price text-sm font-semibold transition-colors has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20";

/**
 * Total people on the job, the driver included: 1 is the driver working alone
 * and 4 is the driver plus the three helpers pricing allows. Written out as a
 * literal tuple rather than derived from a range so `CrewSize` stays a union of
 * exactly these four numbers.
 */
const CREW_SIZE_OPTIONS = [1, 2, 3, 4] as const;

type CrewSize = (typeof CREW_SIZE_OPTIONS)[number];

/** Every booking starts with nobody but the driver. */
const DEFAULT_CREW_SIZE: CrewSize = 1;

/** Shared geometry for a native `<select>`/date-trigger styled to match the
 *  rest of this form's fields — the same treatment `account-profile-form.tsx`
 *  uses for its own native Gender `<select>`, and for the same reason: a
 *  small fixed option set isn't worth the shadcn `Select`'s portal, which
 *  renders outside this page's palette. */
const NATIVE_FIELD_CLASSES =
  "h-10 w-full rounded-lg border border-line bg-ink px-2.5 text-left text-sm text-paper transition-colors outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

/** "Sat, Aug 22" — compact enough for the date trigger button. */
const scheduledDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** Selectable pickup times, half-hour apart across a normal working day. */
const TIME_SLOT_START_HOUR = 8;
const TIME_SLOT_END_HOUR = 20;
const TIME_SLOT_STEP_MINUTES = 30;

type TimeSlot = { value: string; label: string };

/**
 * Every half-hour from 08:00 to 20:00, as both a sortable "HH:MM" value (what
 * gets combined with the chosen date) and a 12-hour display label. Built once
 * at module scope — the slot list itself never changes, only which of them are
 * still selectable (see `availableTimeSlots` in the component, which filters
 * this for a same-day pick).
 */
const TIME_SLOTS: TimeSlot[] = (() => {
  const slots: TimeSlot[] = [];

  for (
    let minutes = TIME_SLOT_START_HOUR * 60;
    minutes <= TIME_SLOT_END_HOUR * 60;
    minutes += TIME_SLOT_STEP_MINUTES
  ) {
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const paddedMinute = String(minute).padStart(2, "0");

    const period = hour24 < 12 ? "AM" : "PM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

    slots.push({
      value: `${String(hour24).padStart(2, "0")}:${paddedMinute}`,
      label: `${hour12}:${paddedMinute} ${period}`,
    });
  }

  return slots;
})();

/** Local midnight for `date` — the boundary the calendar disables before. */
function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Whether `a` and `b` fall on the same local calendar day. */
function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/**
 * `date` at the wall-clock time named by a `TIME_SLOTS` value ("14:30"), or
 * `null` if `time` isn't one of that shape — defensive against nothing more
 * exotic than a stale/cleared selection, since the dropdown only ever offers
 * valid values itself.
 */
function combineDateAndTime(date: Date, time: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    return null;
  }

  const combined = new Date(date);
  combined.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return combined;
}

/**
 * What a crew size means, spelled out for assistive tech: the picker shows a
 * bare numeral, which on its own never says what is being counted — or that
 * the first of those people is the driver rather than a helper.
 */
function crewSizeDescription(size: CrewSize): string {
  if (size === 1) {
    return "1 person — the driver alone";
  }

  const helpers = size - 1;
  return `${size} people — the driver and ${helpers} helper${helpers === 1 ? "" : "s"}`;
}

/**
 * Everything the customer is charged for moving the load, as one figure: the
 * single line that stands in for the old base / distance / time itemisation.
 *
 * Derived by subtracting the helper fee from the quoted total rather than by
 * adding the three components it replaces, and the difference is not academic:
 * `price` is floored at the pricing rule's minimum fare, so on a short hop
 * those components sum to *less* than the total. Adding them would print two
 * lines that visibly fail to reach the total shown alongside them; subtracting
 * makes the breakdown reconcile at every distance.
 */
function transportationCost(quote: Quote): number {
  return quote.price - quote.helperFee;
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
 * The client booking form: route, goods, vehicle and extras on the left, a
 * route preview on the right. Priced on demand — the user presses Calculate to
 * quote against `/api/pricing/estimate`, and any further edit to the route,
 * goods, vehicle or crew size invalidates that quote until it's recalculated —
 * then booked through `POST /api/orders`.
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
  // Not an element id but a shared radio `name`: it is what binds the four
  // crew-size inputs into one group for the browser's own arrow-key handling.
  const crewSizeName = useId();
  const descriptionId = useId();
  const formId = useId();
  const dateTriggerId = useId();
  const timeSelectId = useId();
  const weightSelectId = useId();

  // Null until both a day and a time slot are chosen — see `scheduledDateTime`,
  // the combined value everything downstream (submission, validation) reads.
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [scheduledTime, setScheduledTime] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Null until the taxonomy hands back at least one eligible vehicle to size
  // this against — see `weightOptions`.
  const [maxWeightKg, setMaxWeightKg] = useState<number | null>(null);

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
  // Total people for loading and unloading, driver included — see
  // `helperCount` below for the figure the API is actually told.
  const [crewSize, setCrewSize] = useState<CrewSize>(DEFAULT_CREW_SIZE);
  const [description, setDescription] = useState("");

  const [estimate, setEstimate] = useState<Quote | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedOrder | null>(null);

  /**
   * Extra helpers beyond the driver — the crew size the user picked, minus the
   * driver who is always there. This, not the crew size, is what both the
   * pricing and the orders endpoint take: the driver is not a line item.
   */
  const helperCount = crewSize - 1;

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
   * visitor's behalf. This is the *cargo*-eligible set; `eligibleVehicleTypes`
   * below narrows it further by the weight step.
   */
  const cargoEligibleVehicleTypes = useMemo(() => {
    const allowed = CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory];

    return vehicleTypes
      .filter((vehicleType) => allowed.includes(vehicleType.category))
      .sort((a, b) => a.pricingRule.baseFare - b.pricingRule.baseFare);
  }, [vehicleTypes, cargoCategory]);

  /**
   * The weight dropdown's options: every payload capacity actually present
   * among the cargo-eligible vehicles, smallest first — so each option reads
   * as "up to what this vehicle can carry" and every option is guaranteed to
   * leave at least one vehicle standing once picked.
   */
  const weightOptions = useMemo(() => {
    const capacities = cargoEligibleVehicleTypes.map(
      (vehicleType) => vehicleType.maxPayloadKg,
    );
    return [...new Set(capacities)].sort((a, b) => a - b);
  }, [cargoEligibleVehicleTypes]);

  /**
   * Default (and re-default, on a goods change) to the smallest capacity —
   * the least restrictive option, so an untouched weight step never hides a
   * vehicle the goods step alone would have shown. Mirrors the vehicle
   * auto-select effect below: replace a selection that's no longer one of the
   * current options rather than clear it to empty.
   */
  useEffect(() => {
    const smallest = weightOptions[0];
    if (smallest === undefined) {
      return;
    }

    if (maxWeightKg === null || !weightOptions.includes(maxWeightKg)) {
      setMaxWeightKg(smallest);
    }
  }, [weightOptions, maxWeightKg]);

  /** Cargo-eligible vehicles that can also carry the declared weight. */
  const eligibleVehicleTypes = useMemo(() => {
    if (maxWeightKg === null) {
      return cargoEligibleVehicleTypes;
    }

    return cargoEligibleVehicleTypes.filter(
      (vehicleType) => vehicleType.maxPayloadKg >= maxWeightKg,
    );
  }, [cargoEligibleVehicleTypes, maxWeightKg]);

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
   * vehicle or crew size, any change to one of them invalidates it —
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
    helperCount,
  ]);

  /** Local midnight today — the calendar's disabled-before boundary. */
  const todayStart = useMemo(() => startOfDay(new Date()), []);

  /**
   * `TIME_SLOTS`, narrowed to the ones still in the future when the chosen day
   * is today. A future day has no such constraint — every slot is available.
   */
  const availableTimeSlots = useMemo(() => {
    if (!scheduledDate || !isSameDay(scheduledDate, new Date())) {
      return TIME_SLOTS;
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    return TIME_SLOTS.filter((slot) => {
      const [hours, minutes] = slot.value.split(":").map(Number);
      // Both halves always exist — `slot.value` is always this module's own
      // well-formed "HH:MM" — but `noUncheckedIndexedAccess` can't know that.
      return (hours ?? 0) * 60 + (minutes ?? 0) >= nowMinutes;
    });
  }, [scheduledDate]);

  // A slot picked for a future day can be stranded by switching back to today
  // once the clock has passed it — drop it rather than let a submit combine a
  // day and a time into a moment that's already gone.
  useEffect(() => {
    if (
      scheduledTime &&
      !availableTimeSlots.some((slot) => slot.value === scheduledTime)
    ) {
      setScheduledTime("");
    }
  }, [availableTimeSlots, scheduledTime]);

  const scheduledDateTime =
    scheduledDate && scheduledTime
      ? combineDateAndTime(scheduledDate, scheduledTime)
      : null;

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
          helperCount,
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

    // Guards the type, not the UX: "Book delivery" is disabled without a
    // scheduled time (see `canSubmit`), so this only ever fires if that
    // somehow raced — same defensive shape as the vehicle-type check the
    // landing page's calculator uses before its own submit.
    if (!scheduledDateTime) {
      setError("Please choose a delivery date and time.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: scheduledDateTime.toISOString(),
          pickupAddress,
          dropoffAddress,
          cargoCategory,
          vehicleTypeCode,
          helperCount,
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
      setScheduledDate(null);
      setScheduledTime("");
      setPickupAddress("");
      setDropoffAddress("");
      setPickupLocation(null);
      setDropoffLocation(null);
      setDescription("");
      setCrewSize(DEFAULT_CREW_SIZE);
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
   * Whether the quoted total came out above the sum of the fare components,
   * which only happens when the vehicle type's minimum fare floored it. The
   * breakdown no longer prints those components — `transportationCost` is
   * derived from the total, so the lines always add up — but the floor is
   * still worth naming: it is why a two-block hop costs what a longer one
   * does. The half-cent margin keeps floating-point dust from reading as a
   * floor.
   */
  function minimumFareApplied(quote: Quote): boolean {
    return (
      quote.price - CURRENCY_EPSILON >
      quote.baseFare + quote.distanceFare + quote.timeFare + quote.helperFee
    );
  }

  // Booking requires a calculated price for the exact inputs being booked —
  // the whole point of the Calculate step — plus a valid vehicle type and a
  // chosen delivery time, so the submit cannot race the fetch that supplies
  // the vehicle, or reach the server with nothing scheduled. The address
  // fields keep their own native `required` validation, which still runs
  // because the button is only disabled for reasons the user cannot fix by
  // filling the form in.
  const canSubmit =
    !submitting &&
    selectedVehicleType !== null &&
    estimate !== null &&
    scheduledDateTime !== null;

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
                  {formatBookedDistanceKm(result.distanceKm)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[0.8125rem] text-emerald-800">
                  Transportation cost
                </dt>
                <dd className="font-price text-[0.8125rem] text-emerald-900">
                  {formatGel(transportationCost(result))}
                </dd>
              </div>
              {/* Only worth a line when at least one was actually requested. */}
              {result.helperFee > 0 ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[0.8125rem] text-emerald-800">
                    Helper Fee
                  </dt>
                  <dd className="font-price text-[0.8125rem] text-emerald-900">
                    {formatGel(result.helperFee)}
                  </dd>
                </div>
              ) : null}
              <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-emerald-600/20 pt-2.5">
                <dt className="text-[0.8125rem] font-semibold text-emerald-900">
                  Total
                </dt>
                <dd className="font-price text-base font-semibold text-emerald-900">
                  {formatGel(result.price)}
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
            <StepCard
              step={1}
              title="Delivery date & time"
              description="When should the driver come by?"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={dateTriggerId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    Date
                  </Label>
                  <Popover
                    open={datePickerOpen}
                    onOpenChange={setDatePickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <button
                        id={dateTriggerId}
                        type="button"
                        className={`flex items-center gap-2 ${NATIVE_FIELD_CLASSES}`}
                      >
                        <CalendarDays
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted"
                        />
                        <span
                          className={
                            scheduledDate ? "text-paper" : "text-muted"
                          }
                        >
                          {scheduledDate
                            ? scheduledDateFormatter.format(scheduledDate)
                            : "Select a date"}
                        </span>
                      </button>
                    </PopoverTrigger>

                    <PopoverContent
                      align="start"
                      className="w-auto border-line bg-ink p-0 text-paper ring-line"
                    >
                      {/* Retints the calendar's selected-day highlight from
                          shadcn's default near-black `--primary` to this app's
                          orange accent, scoped to just this popover rather
                          than touching the token globally. */}
                      <div
                        style={
                          {
                            "--primary": "var(--landing-accent)",
                            "--primary-foreground": "var(--landing-ink)",
                          } as React.CSSProperties
                        }
                      >
                        <Calendar
                          mode="single"
                          selected={scheduledDate ?? undefined}
                          onSelect={(date) => {
                            setScheduledDate(date ?? null);
                            setDatePickerOpen(false);
                          }}
                          disabled={{ before: todayStart }}
                          autoFocus
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={timeSelectId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    Time
                  </Label>
                  <select
                    id={timeSelectId}
                    value={scheduledTime}
                    onChange={(event) => setScheduledTime(event.target.value)}
                    required
                    className={NATIVE_FIELD_CLASSES}
                  >
                    <option value="" disabled>
                      {scheduledDate ? "Select a time" : "Pick a date first"}
                    </option>
                    {availableTimeSlots.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                  {scheduledDate && availableTimeSlots.length === 0 ? (
                    <p className="text-xs text-muted">
                      No slots left today — pick a later date.
                    </p>
                  ) : null}
                </div>
              </div>
            </StepCard>

            <StepCard step={2} title="Route">
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
              step={3}
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
              step={4}
              title="Total weight"
              description="Roughly how much is being moved — we'll only recommend vehicles that can carry it."
            >
              {weightOptions.length === 0 ? (
                <p className="text-[0.8125rem] text-muted">
                  Pick what you&rsquo;re moving first — weight options depend on
                  the vehicles cleared for it.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 sm:max-w-xs">
                  <Label
                    htmlFor={weightSelectId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    Total weight
                  </Label>
                  <select
                    id={weightSelectId}
                    value={maxWeightKg ?? ""}
                    onChange={(event) =>
                      setMaxWeightKg(Number(event.target.value))
                    }
                    className={NATIVE_FIELD_CLASSES}
                  >
                    {weightOptions.map((capacity) => (
                      <option key={capacity} value={capacity}>
                        Up to {formatVehiclePayload(capacity)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </StepCard>

            <StepCard
              step={5}
              title="Recommended vehicle"
              description="Only vehicles cleared for your goods and weight are shown, cheapest first."
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

            <StepCard step={6} title="Additional details">
              <div className="flex flex-col gap-4">
                {/* Native radios, one per crew size, each visually replaced by
                    the cell wrapping it. Keeping the real inputs — `sr-only`
                    rather than removed — is what gives the group its arrow-key
                    handling and its "3 of 4" announcement for free, the same
                    trade the driver hub's radio rows make. */}
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-[0.8125rem] font-medium text-paper">
                    People for loading / unloading
                  </legend>

                  <div className="grid grid-cols-4 gap-2 sm:max-w-[17rem]">
                    {CREW_SIZE_OPTIONS.map((size) => {
                      const selected = size === crewSize;

                      return (
                        <label
                          key={size}
                          className={`${CREW_OPTION_CLASSES} ${
                            selected
                              ? `${PICK_CARD_SELECTED_CLASSES} text-accent`
                              : `${PICK_CARD_IDLE_CLASSES} text-paper`
                          }`}
                        >
                          <input
                            type="radio"
                            name={crewSizeName}
                            value={size}
                            checked={selected}
                            onChange={() => setCrewSize(size)}
                            aria-label={crewSizeDescription(size)}
                            className="sr-only"
                          />
                          <span aria-hidden="true">{size}</span>
                        </label>
                      );
                    })}
                  </div>

                  <p className="text-xs leading-snug text-muted">
                    1 is the driver on their own. Every person after that is a
                    helper for loading and unloading, charged as a flat fee on
                    top of the fare.
                  </p>
                </fieldset>

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
                      value={formatDistanceKm(estimate.distanceKm)}
                    />
                    <BreakdownRow
                      label="Transportation cost"
                      value={formatGel(transportationCost(estimate))}
                    />
                    {/* Only worth a line when at least one was actually
                        requested. */}
                    {estimate.helperFee > 0 ? (
                      <BreakdownRow
                        label="Helper Fee"
                        value={formatGel(estimate.helperFee)}
                      />
                    ) : null}
                    {/* The total these two add up to is the "Estimated total"
                        stat in the bar pinned to the bottom of the viewport —
                        on screen alongside this panel at every scroll
                        position, and set in the price face at four times this
                        size. Repeating it here would only give the same figure
                        twice over. */}
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
                // Once an estimate has resolved, its LocationIQ-geocoded points
                // are what the route line and the price are actually based on —
                // preferred here over the Places autocomplete pin so the
                // markers and the route line agree. Before that (or if pricing
                // fell back and returned none), the Places pin is the best
                // coordinate available.
                pickup={estimate?.pickup ?? pickupLocation}
                pickupLabel={pickupAddress}
                dropoff={estimate?.dropoff ?? dropoffLocation}
                dropoffLabel={dropoffAddress}
                distanceKm={estimate?.distanceKm ?? null}
                routePath={estimate?.routePath ?? null}
                durationMinutes={estimate?.durationMinutes ?? null}
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
                {estimate ? formatGel(estimate.price) : EMPTY_STAT}
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
