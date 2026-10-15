/**
 * Pricing model v1 — the PURE half of the freight quote.
 *
 * Source of truth for the formulas: `ZOMO_Full_Pricing_Model.xlsx` (sheet v1.0).
 * Every function here is a pure function of its arguments — no Prisma, no env,
 * no clock unless one is passed in — so the whole model is unit-tested in
 * `tests/pricing-model-v1.spec.ts` and can be imported from a browser bundle
 * (the booking form may preview a helper fee; admin may preview a tariff).
 *
 * The Prisma-reading half — loading the vehicle's `PricingRule`, the
 * `PricingConfig` singleton, the `HelperFloorBand` rows and the
 * `RouteAllowance` for a city pair, geocoding and routing — is
 * `estimateDelivery` in `src/lib/pricing.ts`, which feeds what it read into
 * `computeQuote` below. The commission/payout split is
 * `quotedOrderPayout` in `src/lib/orders/payout.ts`.
 *
 * ## The model, in one place (GEL; each final component rounded to 2 dp)
 *
 * ```text
 * trip type     INTERCITY when both ends resolve to different GeorgianCity
 *               values; otherwise (same city, or an end unresolved) distance <
 *               intercityThresholdKm (40) -> CITY, else INTERCITY.
 * rates         the v1 PricingRule columns only (city*, intercity*); a rule
 *               with intercityPricePerKm or cityMinimumFare <= 0 is refused.
 * city          transport = max(cityMin, cityBase + km*cityPerKm + min*cityPerMin)
 * intercity     transport = icBase + km*icPerKm + km*icPerKm*returnAllowance
 *               (no time charge, no minimum)
 * return        RouteAllowance for the unordered city pair, else the config
 *               default (0.35); 0 for a CITY trip.
 * helpers       per location: helpers * floorRate(floor) * (1 - elevatorDiscount
 *               if a cargo elevator is available); helperFee = pickup + dropoff
 * floor bands   0-3 -> 15, 4-6 -> 25, 7-9 -> 35, 10+ -> 50 (HelperFloorBand)
 * price         transport + helperFee  (the quoted total BEFORE the tier)
 * tier          serviceLevelAdjustment = tier% * transport (helpers excluded)
 * commission    round(transport + adj) * commissionRate(vehicle, tripType)
 * driverPayout  (transport + adj - commission) + helperFee
 * helper OT     per location, at completion: helpers * ceil(max(0, actualMin -
 *               60) / 30) * 10, never elevator-discounted, 100% to the driver
 * manual quote  distanceKm > manualQuoteThresholdKm (600) -> no automatic price;
 *               a straight-line fallback distance is first scaled by
 *               ROAD_DETOUR_FACTOR (1.3) for this check
 * ```
 */

import type { GeorgianCity, ServiceLevel, TripType } from "@prisma/client";

/** Round a currency amount to whole tetri — the same arithmetic as every other copy. */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------------------------- */
/* Configuration                                                             */
/* ------------------------------------------------------------------------- */

/**
 * The platform-wide knobs, as read from the `PricingConfig` singleton. Field
 * names match the Prisma model one-for-one so a row can be passed straight in.
 */
export type PricingConfigValues = {
  intercityThresholdKm: number;
  manualQuoteThresholdKm: number;
  defaultReturnAllowance: number;
  quoteValidityMinutes: number;
  tariffVersion: number;
  maxHelpers: number;
  helperIncludedMinutes: number;
  helperOvertimeIncrementMinutes: number;
  helperOvertimeFeePerIncrement: number;
  elevatorDiscount: number;
};

/**
 * The defaults the migration seeds. Used when the `PricingConfig` row is
 * missing (an unmigrated or unseeded database still quotes) and by tests.
 */
export const DEFAULT_PRICING_CONFIG: Readonly<PricingConfigValues> =
  Object.freeze({
    intercityThresholdKm: 40,
    manualQuoteThresholdKm: 600,
    defaultReturnAllowance: 0.35,
    quoteValidityMinutes: 20,
    tariffVersion: 1,
    maxHelpers: 4,
    helperIncludedMinutes: 60,
    helperOvertimeIncrementMinutes: 30,
    helperOvertimeFeePerIncrement: 10,
    elevatorDiscount: 0.3,
  });

/**
 * One `HelperFloorBand`: the rate per helper from `minFloor` up to the next
 * band's `minFloor - 1` (the highest band is open-ended).
 */
export type HelperFloorBandValues = { minFloor: number; ratePerHelper: number };

/** The sheet's four bands — what the migration seeds. */
export const DEFAULT_HELPER_FLOOR_BANDS: readonly HelperFloorBandValues[] =
  Object.freeze([
    { minFloor: 0, ratePerHelper: 15 },
    { minFloor: 4, ratePerHelper: 25 },
    { minFloor: 7, ratePerHelper: 35 },
    { minFloor: 10, ratePerHelper: 50 },
  ]);

/** One `RouteAllowance` row: an unordered city pair, stored with cityA < cityB. */
export type RouteAllowanceValues = {
  cityA: GeorgianCity;
  cityB: GeorgianCity;
  allowance: number;
};

/**
 * A vehicle's v1 rates, as read from its `PricingRule`. Field names match the
 * Prisma columns one-for-one. These are the v1-only columns: the legacy
 * `baseFare`/`pricePerKm`/`pricePerMinute`/`minimumFare` belong to the pre-v1
 * code still running against the same database and are never read here.
 */
export type VehicleRates = {
  cityBaseFare: number;
  cityPricePerKm: number;
  cityPricePerMinute: number;
  cityMinimumFare: number;
  intercityBaseFare: number;
  intercityPricePerKm: number;
  cityCommissionRate: number;
  intercityCommissionRate: number;
};

/**
 * Whether a vehicle's v1 rates can price a trip at all. A rule whose
 * `intercityPricePerKm` or `cityMinimumFare` is not a positive number has
 * unfilled v1 columns (they default to 0) and would quote an intercity haul or
 * a short city hop at next to nothing, so `estimateDelivery` refuses it as
 * `invalid_vehicle_type` instead.
 */
export function hasUsableRates(
  rates: Pick<VehicleRates, "intercityPricePerKm" | "cityMinimumFare">,
): boolean {
  return (
    Number.isFinite(rates.intercityPricePerKm) &&
    rates.intercityPricePerKm > 0 &&
    Number.isFinite(rates.cityMinimumFare) &&
    rates.cityMinimumFare > 0
  );
}

/** What the client asked for at one end of the job. */
export type LocationHelp = {
  /** Helpers beyond the driver, 0..`maxHelpers`. */
  helpers: number;
  /** Floor the load is on; 0 = ground floor. */
  floor: number;
  /** A cargo elevator can be used at this location. */
  cargoElevator: boolean;
};

/** No helpers, ground floor — the value an omitted location resolves to. */
export const NO_HELP: Readonly<LocationHelp> = Object.freeze({
  helpers: 0,
  floor: 0,
  cargoElevator: false,
});

/* ------------------------------------------------------------------------- */
/* Trip type and return allowance                                            */
/* ------------------------------------------------------------------------- */

/**
 * CITY or INTERCITY.
 *
 * - Both ends resolve to DIFFERENT cities: INTERCITY.
 * - Both resolve to the SAME city: CITY — unless the route is at least
 *   `intercityThresholdKm` long, which is INTERCITY. A stray ", Tbilisi" in a
 *   long-haul address (a company's registered office, a typo) must not price a
 *   300 km run on the city per-minute tariff.
 * - Either end unresolved (a village, a depot): the distance decides —
 *   `< thresholdKm` is CITY, anything else INTERCITY.
 */
export function classifyTrip(
  {
    pickupCity,
    dropoffCity,
    distanceKm,
  }: {
    pickupCity: GeorgianCity | null;
    dropoffCity: GeorgianCity | null;
    distanceKm: number;
  },
  intercityThresholdKm: number = DEFAULT_PRICING_CONFIG.intercityThresholdKm,
): TripType {
  if (
    pickupCity !== null &&
    dropoffCity !== null &&
    pickupCity !== dropoffCity
  ) {
    return "INTERCITY";
  }
  // Same city, or an unresolved end: the distance has the last word.
  return distanceKm < intercityThresholdKm ? "CITY" : "INTERCITY";
}

/**
 * An unordered city pair in its stored form: `cityA < cityB` by enum NAME
 * (plain string comparison, matching the migration's
 * `"cityA"::text < "cityB"::text` CHECK). Admin writes and lookups must both go
 * through this.
 */
export function normaliseCityPair(
  a: GeorgianCity,
  b: GeorgianCity,
): [GeorgianCity, GeorgianCity] {
  return a < b ? [a, b] : [b, a];
}

/**
 * The return allowance for a trip.
 *
 * - CITY trip: 0 (no return leg is charged).
 * - INTERCITY with both cities known and a matching `RouteAllowance` row: that
 *   row's allowance (pair order does not matter).
 * - Otherwise: `defaultAllowance` (an unresolved end or an unlisted pair).
 */
export function returnAllowanceFor(
  {
    tripType,
    pickupCity,
    dropoffCity,
  }: {
    tripType: TripType;
    pickupCity: GeorgianCity | null;
    dropoffCity: GeorgianCity | null;
  },
  routes: readonly RouteAllowanceValues[],
  defaultAllowance: number = DEFAULT_PRICING_CONFIG.defaultReturnAllowance,
): number {
  if (tripType === "CITY") {
    return 0;
  }
  if (pickupCity === null || dropoffCity === null) {
    return defaultAllowance;
  }
  const [cityA, cityB] = normaliseCityPair(pickupCity, dropoffCity);
  const route = routes.find(
    (row) => row.cityA === cityA && row.cityB === cityB,
  );
  return route ? route.allowance : defaultAllowance;
}

/**
 * How much longer a road route is than the straight line between its ends, for
 * the manual-quote check ONLY. When routing is unavailable the quote falls back
 * to the haversine (straight-line) distance, which understates a road trip —
 * in Georgia's mountain valleys by a lot. Without this factor a routing outage
 * would let a 550 km straight-line run (well over 600 km by road) auto-quote.
 * 1.3 is the usual road-network circuity for a country-scale network; it is
 * deliberately not applied to the price itself, which is quoted on the
 * distance actually used.
 */
export const ROAD_DETOUR_FACTOR = 1.3;

/**
 * Whether a route is too long for an automatic quote (strictly greater than
 * the threshold). `straightLine` marks a haversine fallback distance (no road
 * route), which is scaled by `ROAD_DETOUR_FACTOR` before the comparison.
 */
export function isManualQuoteRequired(
  distanceKm: number,
  manualQuoteThresholdKm: number = DEFAULT_PRICING_CONFIG.manualQuoteThresholdKm,
  { straightLine = false }: { straightLine?: boolean } = {},
): boolean {
  const checkedKm = straightLine ? distanceKm * ROAD_DETOUR_FACTOR : distanceKm;
  return checkedKm > manualQuoteThresholdKm;
}

/* ------------------------------------------------------------------------- */
/* Transport                                                                 */
/* ------------------------------------------------------------------------- */

/** The transport charge, itemised. Every figure is rounded to tetri. */
export type TransportBreakdown = {
  baseFare: number;
  distanceFare: number;
  /** Driving-time charge; always 0 for INTERCITY. */
  timeFare: number;
  /** `distanceFare * returnAllowance`; always 0 for CITY. */
  returnFare: number;
  /**
   * baseFare + distanceFare + timeFare + returnFare, floored at the vehicle's
   * `cityMinimumFare` for a CITY trip. Intercity has no minimum.
   */
  transportFare: number;
};

/**
 * The transport charge for one trip. Components are rounded individually and
 * the total is the sum of the rounded components (then floored for a city
 * trip), so the itemised lines always add up to the total a client is shown.
 */
export function computeTransport(
  {
    tripType,
    distanceKm,
    durationMinutes,
    returnAllowance,
  }: {
    tripType: TripType;
    distanceKm: number;
    /** Expected driving time; only priced on a CITY trip. */
    durationMinutes: number;
    /** Only applied on an INTERCITY trip. */
    returnAllowance: number;
  },
  rates: VehicleRates,
): TransportBreakdown {
  if (tripType === "CITY") {
    const baseFare = roundCurrency(rates.cityBaseFare);
    const distanceFare = roundCurrency(distanceKm * rates.cityPricePerKm);
    const timeFare = roundCurrency(durationMinutes * rates.cityPricePerMinute);
    const transportFare = roundCurrency(
      Math.max(rates.cityMinimumFare, baseFare + distanceFare + timeFare),
    );
    return { baseFare, distanceFare, timeFare, returnFare: 0, transportFare };
  }

  const baseFare = roundCurrency(rates.intercityBaseFare);
  const rawDistance = distanceKm * rates.intercityPricePerKm;
  const distanceFare = roundCurrency(rawDistance);
  const returnFare = roundCurrency(rawDistance * returnAllowance);
  const transportFare = roundCurrency(baseFare + distanceFare + returnFare);
  return { baseFare, distanceFare, timeFare: 0, returnFare, transportFare };
}

/** The platform's commission rate for a vehicle on a trip type. */
export function commissionRateFor(
  rates: Pick<VehicleRates, "cityCommissionRate" | "intercityCommissionRate">,
  tripType: TripType,
): number {
  return tripType === "CITY"
    ? rates.cityCommissionRate
    : rates.intercityCommissionRate;
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * The per-helper rate for a floor: the band with the greatest `minFloor` not
 * above `floor`. Bands need not be sorted. A floor below every band (only
 * possible if admin deleted the 0 band) uses the lowest band.
 */
export function helperFloorRate(
  floor: number,
  bands: readonly HelperFloorBandValues[] = DEFAULT_HELPER_FLOOR_BANDS,
): number {
  const effective = bands.length > 0 ? bands : DEFAULT_HELPER_FLOOR_BANDS;
  const sorted = [...effective].sort((a, b) => a.minFloor - b.minFloor);
  let rate = sorted[0]?.ratePerHelper ?? 0;
  for (const band of sorted) {
    if (band.minFloor <= floor) {
      rate = band.ratePerHelper;
    }
  }
  return rate;
}

/**
 * The quoted (standard, first `helperIncludedMinutes`) helper charge at one
 * location: helpers * floorRate * (1 - elevatorDiscount when a cargo elevator
 * is available).
 */
export function helperStandardFee(
  location: LocationHelp,
  bands: readonly HelperFloorBandValues[] = DEFAULT_HELPER_FLOOR_BANDS,
  elevatorDiscount: number = DEFAULT_PRICING_CONFIG.elevatorDiscount,
): number {
  if (location.helpers <= 0) {
    return 0;
  }
  const discount = location.cargoElevator ? elevatorDiscount : 0;
  return roundCurrency(
    location.helpers * helperFloorRate(location.floor, bands) * (1 - discount),
  );
}

/** The helper-overtime rules, a subset of `PricingConfigValues`. */
export type HelperOvertimeRules = Pick<
  PricingConfigValues,
  | "helperIncludedMinutes"
  | "helperOvertimeIncrementMinutes"
  | "helperOvertimeFeePerIncrement"
>;

/**
 * How many overtime increments `actualMinutes` at one location costs: every
 * STARTED increment beyond the included minutes counts (61 min -> 1, 90 -> 1,
 * 91 -> 2 at 60 included / 30 per increment).
 */
export function helperOvertimeIncrements(
  actualMinutes: number,
  rules: HelperOvertimeRules = DEFAULT_PRICING_CONFIG,
): number {
  const over = Math.max(0, actualMinutes - rules.helperIncludedMinutes);
  return Math.ceil(over / rules.helperOvertimeIncrementMinutes);
}

/**
 * Helper overtime at ONE location, charged at completion:
 * helpers * ceil(max(0, actualMin - 60) / 30) * 10. Never elevator-discounted.
 * Passed through 100% to the driver (folded into `Order.overtimeDriverPayout`,
 * see `overtimeDriverPayoutFor` in `src/lib/orders/payout.ts`).
 *
 * For the completion route: call it once for pickup and once for dropoff with
 * the order's stored `pickupHelpers`/`dropoffHelpers` and the reported
 * minutes, sum into `Order.helperOvertimeFee`.
 */
export function helperOvertimeFeeFor(
  { helpers, actualMinutes }: { helpers: number; actualMinutes: number },
  rules: HelperOvertimeRules = DEFAULT_PRICING_CONFIG,
): number {
  if (helpers <= 0) {
    return 0;
  }
  return roundCurrency(
    helpers *
      helperOvertimeIncrements(actualMinutes, rules) *
      rules.helperOvertimeFeePerIncrement,
  );
}

/**
 * Both locations' helper overtime, summed — `Order.helperOvertimeFee`. A null
 * minute count (not reported) is no overtime.
 */
export function orderHelperOvertimeFee(
  {
    pickupHelpers,
    pickupMinutes,
    dropoffHelpers,
    dropoffMinutes,
  }: {
    pickupHelpers: number;
    pickupMinutes: number | null;
    dropoffHelpers: number;
    dropoffMinutes: number | null;
  },
  rules: HelperOvertimeRules = DEFAULT_PRICING_CONFIG,
): number {
  return roundCurrency(
    helperOvertimeFeeFor(
      { helpers: pickupHelpers, actualMinutes: pickupMinutes ?? 0 },
      rules,
    ) +
      helperOvertimeFeeFor(
        { helpers: dropoffHelpers, actualMinutes: dropoffMinutes ?? 0 },
        rules,
      ),
  );
}

/**
 * `Order.helperCount` for a v1 order: the larger crew of the two ends. Kept so
 * dispatch and work-preference filtering ("can bring a helper") still work.
 */
export function crewHelperCount(
  pickup: LocationHelp,
  dropoff: LocationHelp,
): number {
  return Math.max(pickup.helpers, dropoff.helpers);
}

/* ------------------------------------------------------------------------- */
/* Service level                                                             */
/* ------------------------------------------------------------------------- */

// Priority adds a quarter, Pooling takes a tenth off — the rate owner's rule
// (2026-09-04). Since pricing model v1 the percentage applies to the TRANSPORT
// charge only: helpers are flat pass-through services and are not tiered.
export const PRIORITY_UPLIFT = 0.25;
export const POOLING_DISCOUNT = 0.1;

/**
 * The tier's effect, as a signed GEL amount, on `transportFare` (pass the
 * transport charge, NOT `price`, for a v1 order). Applied after the city
 * minimum, so Pooling may take a job below it — intended.
 */
export function serviceLevelAdjustment(
  level: ServiceLevel,
  transportFare: number,
): number {
  switch (level) {
    case "PRIORITY":
      return roundCurrency(transportFare * PRIORITY_UPLIFT);
    case "POOLING":
      return roundCurrency(-transportFare * POOLING_DISCOUNT);
    case "REGULAR":
      return 0;
    default: {
      // A fourth tier added to the schema fails to assign to `never` here.
      const exhaustive: never = level;
      throw new Error(`Unhandled service level: ${String(exhaustive)}`);
    }
  }
}

/**
 * What the client pays at `level` for a quote: transport + its tier
 * adjustment + helpers. The figure `POST /api/orders/[id]/pay` bills
 * (`price + serviceLevelAdjustment`).
 */
export function clientTotalForServiceLevel(
  level: ServiceLevel,
  { transportFare, helperFee }: { transportFare: number; helperFee: number },
): number {
  return roundCurrency(
    transportFare + serviceLevelAdjustment(level, transportFare) + helperFee,
  );
}

/* ------------------------------------------------------------------------- */
/* The whole quote                                                           */
/* ------------------------------------------------------------------------- */

/**
 * The itemised quote, as stored on the order and returned by the estimate
 * endpoint. Client-facing: contains no commission figure.
 */
export type PriceBreakdown = TransportBreakdown & {
  tripType: TripType;
  /** 0 for CITY. */
  returnAllowance: number;
  pickupHelperFee: number;
  dropoffHelperFee: number;
  /** pickupHelperFee + dropoffHelperFee — the pass-through helper charge. */
  helperFee: number;
  /** transportFare + helperFee — the quoted total before the tier. */
  price: number;
};

/** Everything `computeQuote` needs once the route and the data are in hand. */
export type QuoteComputationInput = {
  distanceKm: number;
  durationMinutes: number;
  pickupCity: GeorgianCity | null;
  dropoffCity: GeorgianCity | null;
  pickupHelp: LocationHelp;
  dropoffHelp: LocationHelp;
};

/**
 * The full itemised quote from resolved inputs: classify the trip, pick the
 * return allowance, price transport and helpers. Does NOT check the manual
 * quote threshold or helper limits — callers do (`estimateDelivery`).
 */
export function computeQuote(
  input: QuoteComputationInput,
  {
    rates,
    config = DEFAULT_PRICING_CONFIG,
    bands = DEFAULT_HELPER_FLOOR_BANDS,
    routes = [],
  }: {
    rates: VehicleRates;
    config?: PricingConfigValues;
    bands?: readonly HelperFloorBandValues[];
    routes?: readonly RouteAllowanceValues[];
  },
): PriceBreakdown {
  const tripType = classifyTrip(input, config.intercityThresholdKm);
  const returnAllowance = returnAllowanceFor(
    { tripType, pickupCity: input.pickupCity, dropoffCity: input.dropoffCity },
    routes,
    config.defaultReturnAllowance,
  );
  const transport = computeTransport(
    {
      tripType,
      distanceKm: input.distanceKm,
      durationMinutes: input.durationMinutes,
      returnAllowance,
    },
    rates,
  );
  const pickupHelperFee = helperStandardFee(
    input.pickupHelp,
    bands,
    config.elevatorDiscount,
  );
  const dropoffHelperFee = helperStandardFee(
    input.dropoffHelp,
    bands,
    config.elevatorDiscount,
  );
  const helperFee = roundCurrency(pickupHelperFee + dropoffHelperFee);

  return {
    tripType,
    returnAllowance,
    ...transport,
    pickupHelperFee,
    dropoffHelperFee,
    helperFee,
    price: roundCurrency(transport.transportFare + helperFee),
  };
}

/** When a quote computed at `quotedAt` stops being honoured. */
export function quoteExpiresAt(
  quotedAt: Date,
  quoteValidityMinutes: number = DEFAULT_PRICING_CONFIG.quoteValidityMinutes,
): Date {
  return new Date(quotedAt.getTime() + quoteValidityMinutes * 60_000);
}
