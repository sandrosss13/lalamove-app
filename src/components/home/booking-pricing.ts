/**
 * The booking form's pricing-model-v1 logic that does not need React: the
 * per-location helper inputs (helpers, floor, passenger and cargo elevator at
 * the pickup and at the drop-off), how they are sent to `/api/pricing/estimate` and
 * `/api/orders`, how a quote's breakdown is read back for display, and how the
 * form tells a "contact support for a quote" refusal or a "prices changed"
 * refusal apart from an ordinary error.
 *
 * Shared by the booking form, the checkout summary and the client's order page,
 * so the line a client reads as "Transport" is derived by one function
 * wherever it appears.
 *
 * Only pure imports (`pricing-engine.ts` imports nothing but Prisma *types*),
 * so this is safe in any client component and in the Playwright pure specs
 * (`tests/booking-pricing.spec.ts`).
 */

import {
  DEFAULT_PRICING_CONFIG,
  NO_HELP,
  type LocationHelp,
} from "@/lib/pricing-engine";

export type { LocationHelp };

/** Helpers a client may ask for at one location (0 = the driver alone). */
export const HELPER_COUNT_OPTIONS = [0, 1, 2, 3, 4] as const;

export type HelperCountOption = (typeof HELPER_COUNT_OPTIONS)[number];

/**
 * The highest floor the form accepts — the same bound `parseQuoteFields`
 * enforces (`MAX_FLOOR` in `src/lib/pricing.ts`, which is server-only and so
 * cannot be imported here). A spec pins the two together.
 */
export const MAX_BOOKING_FLOOR = 100;

/**
 * The helper-time rules a client is told about up front, read from the engine's
 * defaults: 60 included minutes per location, then 10 GEL per helper per
 * started 30 minutes, charged after completion. The fallback only: once a
 * quote is in hand the note uses the live rules it carries
 * (`helperTimeNoteValues`); what is actually billed is settled server-side
 * from the live `PricingConfig` row.
 */
export const HELPER_TIME_NOTE_VALUES = {
  includedMinutes: DEFAULT_PRICING_CONFIG.helperIncludedMinutes,
  incrementMinutes: DEFAULT_PRICING_CONFIG.helperOvertimeIncrementMinutes,
  fee: DEFAULT_PRICING_CONFIG.helperOvertimeFeePerIncrement,
} as const;

/** The values the helper-time note is formatted with. */
export type HelperTimeNoteValues = {
  includedMinutes: number;
  incrementMinutes: number;
  fee: number;
};

/**
 * The note's values from the live rules `/api/pricing/estimate` returns
 * (`helperRules`), falling back to `HELPER_TIME_NOTE_VALUES` before the first
 * quote lands or when a response omits them. A rule that is not a finite,
 * non-negative number is ignored rather than printed.
 */
export function helperTimeNoteValues(
  rules:
    | {
        includedMinutes?: unknown;
        overtimeIncrementMinutes?: unknown;
        overtimeFeePerIncrement?: unknown;
      }
    | null
    | undefined,
): HelperTimeNoteValues {
  const pick = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : fallback;

  return {
    includedMinutes: pick(
      rules?.includedMinutes,
      HELPER_TIME_NOTE_VALUES.includedMinutes,
    ),
    incrementMinutes: pick(
      rules?.overtimeIncrementMinutes,
      HELPER_TIME_NOTE_VALUES.incrementMinutes,
    ),
    fee: pick(rules?.overtimeFeePerIncrement, HELPER_TIME_NOTE_VALUES.fee),
  };
}

/** Nobody but the driver, ground floor, no elevator — where a booking starts. */
export const NO_LOCATION_HELP: LocationHelp = { ...NO_HELP };

function clampWhole(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(value), 0), max);
}

/**
 * A location's inputs as they are sent: whole numbers in range and real
 * booleans. The floor and the elevators are kept even when no helper is booked
 * there: they are also the stop's Contact Info (an individual's floor is typed
 * in the Contact Info dialog, the elevator ticks are always shown) and the
 * driver reads them. They only PRICE helpers — `helperStandardFee` is 0 for a
 * stop with none — so keeping them never changes a quote.
 */
export function normaliseLocationHelp(help: LocationHelp): LocationHelp {
  return {
    helpers: clampWhole(help.helpers, HELPER_COUNT_OPTIONS.length - 1),
    floor: clampWhole(help.floor, MAX_BOOKING_FLOOR),
    cargoElevator: help.cargoElevator === true,
    passengerElevator: help.passengerElevator === true,
  };
}

/** The eight body fields `parseQuoteFields` reads, from the two locations. */
export function locationHelpBody(
  pickup: LocationHelp,
  dropoff: LocationHelp,
): {
  pickupHelpers: number;
  pickupFloor: number;
  pickupCargoElevator: boolean;
  pickupPassengerElevator: boolean;
  dropoffHelpers: number;
  dropoffFloor: number;
  dropoffCargoElevator: boolean;
  dropoffPassengerElevator: boolean;
} {
  const p = normaliseLocationHelp(pickup);
  const d = normaliseLocationHelp(dropoff);
  return {
    pickupHelpers: p.helpers,
    pickupFloor: p.floor,
    pickupCargoElevator: p.cargoElevator,
    pickupPassengerElevator: p.passengerElevator,
    dropoffHelpers: d.helpers,
    dropoffFloor: d.floor,
    dropoffCargoElevator: d.cargoElevator,
    dropoffPassengerElevator: d.passengerElevator,
  };
}

/**
 * The floor field's text as a floor number: digits only, clamped to the
 * accepted range, `0` for an empty field (the ground floor).
 */
export function parseFloorInput(text: string): number {
  const digits = text.replace(/\D/g, "").slice(0, 3);
  if (digits === "") {
    return 0;
  }
  return Math.min(Number(digits), MAX_BOOKING_FLOOR);
}

/**
 * A stored order's two locations, for re-opening it in the form. A pre-v1
 * order (`tariffVersion === null`) recorded only one crew size, `helperCount`,
 * which was charged at both ends — so it re-opens with that many helpers at
 * each, which is how `parseQuoteFields` maps the legacy field too.
 */
export function locationHelpFromOrder(order: {
  helperCount: number;
  pickupHelpers: number;
  pickupFloor: number;
  pickupCargoElevator: boolean;
  pickupPassengerElevator: boolean;
  dropoffHelpers: number;
  dropoffFloor: number;
  dropoffCargoElevator: boolean;
  dropoffPassengerElevator: boolean;
  tariffVersion: number | null;
}): { pickup: LocationHelp; dropoff: LocationHelp } {
  if (
    order.tariffVersion === null &&
    order.pickupHelpers === 0 &&
    order.dropoffHelpers === 0 &&
    order.helperCount > 0
  ) {
    const legacy = normaliseLocationHelp({
      ...NO_HELP,
      helpers: order.helperCount,
    });
    return { pickup: legacy, dropoff: { ...legacy } };
  }
  return {
    pickup: normaliseLocationHelp({
      helpers: order.pickupHelpers,
      floor: order.pickupFloor,
      cargoElevator: order.pickupCargoElevator,
      passengerElevator: order.pickupPassengerElevator,
    }),
    dropoff: normaliseLocationHelp({
      helpers: order.dropoffHelpers,
      floor: order.dropoffFloor,
      cargoElevator: order.dropoffCargoElevator,
      passengerElevator: order.dropoffPassengerElevator,
    }),
  };
}

/**
 * A location read back out of untrusted storage (the booking draft), or `null`
 * when the value is not one. Parsed field by field rather than cast.
 */
export function readLocationHelp(value: unknown): LocationHelp | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { helpers, floor, cargoElevator, passengerElevator } = value as Record<
    string,
    unknown
  >;
  if (typeof helpers !== "number" || typeof floor !== "number") {
    return null;
  }
  return normaliseLocationHelp({
    helpers,
    floor,
    cargoElevator: cargoElevator === true,
    passengerElevator: passengerElevator === true,
  });
}

/* ------------------------------------------------------------------------- */
/* Reading a quote back                                                      */
/* ------------------------------------------------------------------------- */

/**
 * The fare fields a quote (a live estimate or a stored order) carries. The v1
 * fields are optional/nullable: an order booked before pricing model v1 has no
 * `transportFare` and no `tripType`.
 */
export type QuoteFigures = {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  returnFare?: number | null;
  transportFare?: number | null;
  tripType?: "CITY" | "INTERCITY" | null;
  helperFee: number;
  price: number;
};

/** Half a tetri: absorbs floating-point dust, never a real one-tetri gap. */
const CURRENCY_EPSILON = 0.005;

/**
 * The transport charge — everything billed for moving the load. The server's
 * own `transportFare` when it sent one; for a pre-v1 order, the quoted total
 * less the helper fee, which is what that order's "Transportation" line has
 * always shown.
 */
export function transportCharge(quote: QuoteFigures): number {
  if (typeof quote.transportFare === "number") {
    return quote.transportFare;
  }
  return quote.price - quote.helperFee;
}

/**
 * Whether the transport charge was floored at the vehicle's city minimum. Only
 * a city trip has a minimum (an intercity fare is never floored), so an
 * intercity quote never carries the note.
 */
export function minimumFareApplied(quote: QuoteFigures): boolean {
  if (quote.tripType === "INTERCITY") {
    return false;
  }
  const components =
    quote.baseFare +
    quote.distanceFare +
    quote.timeFare +
    (quote.returnFare ?? 0);
  return transportCharge(quote) - CURRENCY_EPSILON > components;
}

/**
 * Whether a quote's validity has run out at `now` (ms since epoch). A missing
 * or unreadable expiry is treated as expired — re-quoting costs one request,
 * booking on a quote of unknown age could cost the client a surprise.
 */
export function isQuoteExpired(
  quoteExpiresAt: string | null | undefined,
  now: number,
): boolean {
  if (!quoteExpiresAt) {
    return true;
  }
  const at = Date.parse(quoteExpiresAt);
  return Number.isNaN(at) || at <= now;
}

/**
 * The two pricing refusals the form handles in their own way rather than as a
 * plain error line:
 *
 * - `manual_quote` — the route is over the manual-quote distance: no price, no
 *   Book, a "contact support" panel instead.
 * - `tariff_changed` — the order endpoint refused the tariff version the client
 *   was shown: re-quote and show the new price before they book again.
 *
 * Read from the machine-readable `reason` both endpoints send.
 */
export type PricingRefusal = "manual_quote" | "tariff_changed" | null;

export function pricingRefusalOf(payload: unknown): PricingRefusal {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const { reason } = payload as { reason?: unknown };
  if (reason === "manual_quote_required") {
    return "manual_quote";
  }
  if (reason === "tariff_changed") {
    return "tariff_changed";
  }
  return null;
}

/**
 * Whether a fresh quote would charge the client something other than what the
 * previous one showed them, at the tier they picked. Compared to the tetri.
 */
export function quotedTotalChanged(
  previousTotal: number,
  nextTotal: number,
): boolean {
  return Math.abs(previousTotal - nextTotal) >= CURRENCY_EPSILON;
}
