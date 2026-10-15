/**
 * Validation rules for the admin Pricing section (`/admin/pricing/*`) —
 * pricing model v1's vehicle tariffs, helper tariffs, route allowances and
 * general config.
 *
 * **Pure on purpose**, like `src/app/api/admin/content/item-catalogue/validation.ts`:
 * no `server-only`, no Prisma runtime, no translator. `GeorgianCity` is
 * imported as a *type* only and its members restated below, pinned exhaustive
 * by a `Record`, so three callers share one copy of every rule:
 *
 * - the API routes under `src/app/api/admin/pricing/`, which are the real
 *   boundary;
 * - the pricing pages, which run the same parsers before saving purely for
 *   faster feedback;
 * - `tests/admin-pricing-validation.spec.ts`, which needs no browser, database
 *   or server.
 *
 * Errors come back as a message *path* plus values rather than as text, so a
 * route translates them into the request's language and a page into the
 * reader's, from the same `admin.pricingValidation.*` keys.
 *
 * Rates (commission, return allowance, elevator discount) are FRACTIONS 0..1
 * on the wire and in the database; the pages show and accept them as
 * percentages and convert at the edge (`percentToFraction`).
 */

import type { GeorgianCity } from "@prisma/client";

const K = "admin.pricingValidation";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The ceilings every figure is checked against. Not business rules — sanity
 * bounds that catch a slipped digit (a base fare of 1500 instead of 15.00)
 * before it reaches every quote on the platform.
 */
export const PRICING_BOUNDS = Object.freeze({
  /** Any single GEL figure: a fare, a per-km or per-minute rate, a band rate. */
  maxMoney: 10_000,
  /** Free waiting minutes / helper included minutes / increments. */
  maxMinutes: 1_440,
  /**
   * Most helpers per location. Mirrors `MAX_HELPER_COUNT` in
   * `src/lib/pricing.ts`, the booking parser's hard bound — a `maxHelpers`
   * above it could never take effect, so it is refused here rather than
   * stored as a setting that silently does nothing.
   */
  maxHelpers: 4,
  /** Mirrors `MAX_FLOOR` in `src/lib/pricing.ts`. */
  maxFloor: 100,
  /** Most floor bands — far more than any sane tariff needs. */
  maxBands: 20,
  /** Distance thresholds, km. */
  maxKm: 5_000,
  /** Quote validity, minutes (one day). */
  maxQuoteValidityMinutes: 1_440,
});

/* -------------------------------------------------------------------------- */
/* Enum members                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `GeorgianCity` members. The `Record` makes a new enum member a typecheck
 * failure here until it is added, so the route-allowance editor can never
 * reject a city the schema knows about.
 */
const GEORGIAN_CITY_SET: Record<GeorgianCity, true> = {
  TBILISI: true,
  BATUMI: true,
  KUTAISI: true,
  RUSTAVI: true,
  ZUGDIDI: true,
  GORI: true,
  POTI: true,
  SAMTREDIA: true,
  KHASHURI: true,
  SENAKI: true,
  ZESTAPONI: true,
  MARNEULI: true,
  TELAVI: true,
  AKHALTSIKHE: true,
  OZURGETI: true,
  KOBULETI: true,
  CHIATURA: true,
  TSKALTUBO: true,
  SAGAREJO: true,
  GARDABANI: true,
  BOLNISI: true,
  AKHALKALAKI: true,
  BORJOMI: true,
  KASPI: true,
  MTSKHETA: true,
  TKIBULI: true,
  KARELI: true,
  GURJAANI: true,
  KVARELI: true,
  LANCHKHUTI: true,
  SACHKHERE: true,
  TERJOLA: true,
  KHOBI: true,
  MARTVILI: true,
  TSALENJIKHA: true,
  ABASHA: true,
  AMBROLAURI: true,
  TSAGERI: true,
  ONI: true,
  MESTIA: true,
  SIGHNAGHI: true,
  DEDOPLISTSQARO: true,
  LAGODEKHI: true,
  AKHMETA: true,
  DUSHETI: true,
  TIANETI: true,
  TSALKA: true,
  DMANISI: true,
  TETRITSQARO: true,
  NINOTSMINDA: true,
  ADIGENI: true,
  ASPINDZA: true,
  VALE: true,
  BAGHDATI: true,
  VANI: true,
  KHARAGAULI: true,
  KHONI: true,
  CHKHOROTSQU: true,
  JVARI: true,
  KEDA: true,
  KHELVACHAURI: true,
  KHULO: true,
  SHUAKHEVI: true,
};

export function isGeorgianCity(value: unknown): value is GeorgianCity {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(GEORGIAN_CITY_SET, value)
  );
}

/* -------------------------------------------------------------------------- */
/* Result shapes                                                              */
/* -------------------------------------------------------------------------- */

export type ValidationError = {
  /** Full message path under `admin.pricingValidation`. */
  key: string;
  values?: Record<string, string | number>;
};

export type ParseResult<T> = { data: T } | { error: ValidationError };

type FieldResult<T> = { value: T } | { error: ValidationError };

/* -------------------------------------------------------------------------- */
/* Field readers                                                              */
/* -------------------------------------------------------------------------- */

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** A finite number in `[0, max]`. `field` names it in the message. */
function readAmount(
  record: Record<string, unknown>,
  field: string,
  max: number,
): FieldResult<number> {
  const value = record[field];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  ) {
    return {
      error: { key: `${K}.amountOutOfRange`, values: { field, max } },
    };
  }
  return { value };
}

/** A whole number in `[min, max]`. */
function readWhole(
  record: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): FieldResult<number> {
  const value = record[field];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    return {
      error: { key: `${K}.wholeOutOfRange`, values: { field, min, max } },
    };
  }
  return { value };
}

/** A fraction in `[0, 1]` (shown to admins as 0–100%). */
function readRate(
  record: Record<string, unknown>,
  field: string,
): FieldResult<number> {
  const value = record[field];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    return { error: { key: `${K}.rateOutOfRange`, values: { field } } };
  }
  return { value };
}

/** A strictly positive finite number up to `max`. */
function readPositive(
  record: Record<string, unknown>,
  field: string,
  max: number,
): FieldResult<number> {
  const value = record[field];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > max
  ) {
    return {
      error: { key: `${K}.positiveOutOfRange`, values: { field, max } },
    };
  }
  return { value };
}

const BODY_NOT_OBJECT: ValidationError = { key: `${K}.bodyMustBeObject` };

/* -------------------------------------------------------------------------- */
/* Vehicle tariffs                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One vehicle's editable `PricingRule` columns. `helperFee` is absent on
 * purpose: it is legacy and unused by the engine since v1 (see the model's
 * schema doc), so the editor neither shows nor writes it.
 */
export type VehicleTariffInput = {
  cityBaseFare: number;
  cityPricePerKm: number;
  cityPricePerMinute: number;
  cityMinimumFare: number;
  intercityBaseFare: number;
  intercityPricePerKm: number;
  cityCommissionRate: number;
  intercityCommissionRate: number;
  freeLoadingMinutes: number;
  overtimeRatePerMinute: number;
};

/** The money columns, in the order the table renders them. */
const VEHICLE_MONEY_FIELDS = [
  "cityBaseFare",
  "cityPricePerKm",
  "cityPricePerMinute",
  "cityMinimumFare",
  "intercityBaseFare",
  "intercityPricePerKm",
  "overtimeRatePerMinute",
] as const satisfies readonly (keyof VehicleTariffInput)[];

/** Money fields that must be strictly positive — see `hasUsableRates`. */
const MUST_BE_POSITIVE_FIELDS: ReadonlySet<keyof VehicleTariffInput> = new Set([
  "cityMinimumFare",
  "intercityPricePerKm",
]);

const VEHICLE_RATE_FIELDS = [
  "cityCommissionRate",
  "intercityCommissionRate",
] as const satisfies readonly (keyof VehicleTariffInput)[];

/** Every editable field, for audit before/after snapshots. */
export const VEHICLE_TARIFF_FIELDS: readonly (keyof VehicleTariffInput)[] = [
  ...VEHICLE_MONEY_FIELDS,
  ...VEHICLE_RATE_FIELDS,
  "freeLoadingMinutes",
];

/**
 * A full vehicle tariff — every field required. Whole-row rather than a patch
 * because the editor always shows (and so always sends) every figure, and a
 * row created for a vehicle with no `PricingRule` yet needs all of them.
 */
export function parseVehicleTariffBody(
  body: unknown,
): ParseResult<VehicleTariffInput> {
  const record = asRecord(body);
  if (!record) return { error: BODY_NOT_OBJECT };

  const data: Partial<VehicleTariffInput> = {};

  for (const field of VEHICLE_MONEY_FIELDS) {
    // The two rates the engine refuses at 0 (`hasUsableRates`): a tariff
    // without them would quote an intercity haul or a city hop at ~nothing,
    // so the editor cannot save one.
    const result = MUST_BE_POSITIVE_FIELDS.has(field)
      ? readPositive(record, field, PRICING_BOUNDS.maxMoney)
      : readAmount(record, field, PRICING_BOUNDS.maxMoney);
    if ("error" in result) return result;
    data[field] = result.value;
  }

  for (const field of VEHICLE_RATE_FIELDS) {
    const result = readRate(record, field);
    if ("error" in result) return result;
    data[field] = result.value;
  }

  const freeMinutes = readWhole(
    record,
    "freeLoadingMinutes",
    0,
    PRICING_BOUNDS.maxMinutes,
  );
  if ("error" in freeMinutes) return freeMinutes;
  data.freeLoadingMinutes = freeMinutes.value;

  return { data: data as VehicleTariffInput };
}

/* -------------------------------------------------------------------------- */
/* Helper tariffs                                                             */
/* -------------------------------------------------------------------------- */

export type HelperBandInput = { minFloor: number; ratePerHelper: number };

/** The helper columns of the `PricingConfig` singleton. */
export type HelperRulesInput = {
  maxHelpers: number;
  helperIncludedMinutes: number;
  helperOvertimeIncrementMinutes: number;
  helperOvertimeFeePerIncrement: number;
  elevatorDiscount: number;
};

export type HelperTariffInput = {
  /** Sorted by `minFloor`, first one always 0. */
  bands: HelperBandInput[];
  rules: HelperRulesInput;
};

/**
 * The floor bands, replaced wholesale. Rules:
 *
 * - 1..`maxBands` bands, each `{ minFloor: whole 0..maxFloor, ratePerHelper:
 *   0..maxMoney }`;
 * - no two bands share a `minFloor` (it is `@unique` in the table);
 * - a band at floor 0 must exist — without it a ground-floor job would fall
 *   through to whatever the lowest band is, which is never what an admin
 *   deleting "0" meant.
 *
 * Rates are NOT required to rise with the floor: an unusual tariff is the
 * owner's call, not a validation error.
 */
export function parseHelperBands(
  value: unknown,
): ParseResult<HelperBandInput[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: { key: `${K}.bandsRequired` } };
  }
  if (value.length > PRICING_BOUNDS.maxBands) {
    return {
      error: {
        key: `${K}.tooManyBands`,
        values: { max: PRICING_BOUNDS.maxBands },
      },
    };
  }

  const bands: HelperBandInput[] = [];
  const seen = new Set<number>();

  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) return { error: { key: `${K}.bandMalformed` } };

    const minFloor = readWhole(record, "minFloor", 0, PRICING_BOUNDS.maxFloor);
    if ("error" in minFloor) return minFloor;
    const rate = readAmount(record, "ratePerHelper", PRICING_BOUNDS.maxMoney);
    if ("error" in rate) return rate;

    if (seen.has(minFloor.value)) {
      return {
        error: {
          key: `${K}.duplicateBandFloor`,
          values: { floor: minFloor.value },
        },
      };
    }
    seen.add(minFloor.value);
    bands.push({ minFloor: minFloor.value, ratePerHelper: rate.value });
  }

  if (!seen.has(0)) {
    return { error: { key: `${K}.groundFloorBandRequired` } };
  }

  bands.sort((a, b) => a.minFloor - b.minFloor);
  return { data: bands };
}

/** The helper rules: crew size, included time, overtime and elevator discount. */
export function parseHelperRules(
  value: unknown,
): ParseResult<HelperRulesInput> {
  const record = asRecord(value);
  if (!record) return { error: BODY_NOT_OBJECT };

  const maxHelpers = readWhole(
    record,
    "maxHelpers",
    1,
    PRICING_BOUNDS.maxHelpers,
  );
  if ("error" in maxHelpers) return maxHelpers;
  const included = readWhole(
    record,
    "helperIncludedMinutes",
    0,
    PRICING_BOUNDS.maxMinutes,
  );
  if ("error" in included) return included;
  // At least 1: the engine divides the overtime minutes by it.
  const increment = readWhole(
    record,
    "helperOvertimeIncrementMinutes",
    1,
    PRICING_BOUNDS.maxMinutes,
  );
  if ("error" in increment) return increment;
  const fee = readAmount(
    record,
    "helperOvertimeFeePerIncrement",
    PRICING_BOUNDS.maxMoney,
  );
  if ("error" in fee) return fee;
  const discount = readRate(record, "elevatorDiscount");
  if ("error" in discount) return discount;

  return {
    data: {
      maxHelpers: maxHelpers.value,
      helperIncludedMinutes: included.value,
      helperOvertimeIncrementMinutes: increment.value,
      helperOvertimeFeePerIncrement: fee.value,
      elevatorDiscount: discount.value,
    },
  };
}

/** `{ bands, rules }` — what `PUT /api/admin/pricing/helpers` accepts. */
export function parseHelperTariffBody(
  body: unknown,
): ParseResult<HelperTariffInput> {
  const record = asRecord(body);
  if (!record) return { error: BODY_NOT_OBJECT };

  const bands = parseHelperBands(record.bands);
  if ("error" in bands) return bands;
  const rules = parseHelperRules(record.rules);
  if ("error" in rules) return rules;

  return { data: { bands: bands.data, rules: rules.data } };
}

/* -------------------------------------------------------------------------- */
/* Route allowances                                                           */
/* -------------------------------------------------------------------------- */

export type RouteAllowanceInput = {
  /** Two different cities; NOT yet normalised — the route does that. */
  cityA: GeorgianCity;
  cityB: GeorgianCity;
  allowance: number;
};

/**
 * One city pair's return allowance. The pair is accepted in either order (the
 * route stores it through `normaliseCityPair`); the two cities must differ,
 * since a same-city job is a CITY trip and never charged a return.
 */
export function parseRouteAllowanceBody(
  body: unknown,
): ParseResult<RouteAllowanceInput> {
  const record = asRecord(body);
  if (!record) return { error: BODY_NOT_OBJECT };

  const { cityA, cityB } = record;
  if (!isGeorgianCity(cityA) || !isGeorgianCity(cityB)) {
    return { error: { key: `${K}.unknownCity` } };
  }
  if (cityA === cityB) {
    return { error: { key: `${K}.citiesMustDiffer` } };
  }

  const allowance = readRate(record, "allowance");
  if ("error" in allowance) return allowance;

  return { data: { cityA, cityB, allowance: allowance.value } };
}

/**
 * The quick presets offered beside the allowance field, from the pricing
 * sheet: a busy corridor where a return load is likely costs little extra, a
 * remote one where the truck almost surely drives back empty costs a lot.
 */
export const ROUTE_ALLOWANCE_PRESETS = Object.freeze([
  { id: "high", allowance: 0.15 },
  { id: "medium", allowance: 0.35 },
  { id: "low", allowance: 0.65 },
  { id: "empty", allowance: 1 },
] as const);

/* -------------------------------------------------------------------------- */
/* General config                                                             */
/* -------------------------------------------------------------------------- */

/** The non-helper, editable columns of the `PricingConfig` singleton. */
export type GeneralConfigInput = {
  intercityThresholdKm: number;
  manualQuoteThresholdKm: number;
  quoteValidityMinutes: number;
  defaultReturnAllowance: number;
};

export const GENERAL_CONFIG_FIELDS: readonly (keyof GeneralConfigInput)[] = [
  "intercityThresholdKm",
  "manualQuoteThresholdKm",
  "quoteValidityMinutes",
  "defaultReturnAllowance",
];

/**
 * A PATCH of the general config: any non-empty subset of its four fields
 * (the Routes tab saves only `defaultReturnAllowance`, the General tab the
 * other three). `current` is the stored row, so the cross-field rule — the
 * manual-quote threshold must lie above the intercity threshold, or every
 * intercity trip would need a manual quote — is checked against the values
 * that will be in force after the save, not just the ones this patch carries.
 */
export function parseGeneralConfigBody(
  body: unknown,
  current: GeneralConfigInput,
): ParseResult<Partial<GeneralConfigInput>> {
  const record = asRecord(body);
  if (!record) return { error: BODY_NOT_OBJECT };

  const data: Partial<GeneralConfigInput> = {};

  if (record.intercityThresholdKm !== undefined) {
    const result = readPositive(
      record,
      "intercityThresholdKm",
      PRICING_BOUNDS.maxKm,
    );
    if ("error" in result) return result;
    data.intercityThresholdKm = result.value;
  }
  if (record.manualQuoteThresholdKm !== undefined) {
    const result = readPositive(
      record,
      "manualQuoteThresholdKm",
      PRICING_BOUNDS.maxKm,
    );
    if ("error" in result) return result;
    data.manualQuoteThresholdKm = result.value;
  }
  if (record.quoteValidityMinutes !== undefined) {
    const result = readWhole(
      record,
      "quoteValidityMinutes",
      1,
      PRICING_BOUNDS.maxQuoteValidityMinutes,
    );
    if ("error" in result) return result;
    data.quoteValidityMinutes = result.value;
  }
  if (record.defaultReturnAllowance !== undefined) {
    const result = readRate(record, "defaultReturnAllowance");
    if ("error" in result) return result;
    data.defaultReturnAllowance = result.value;
  }

  if (Object.keys(data).length === 0) {
    return { error: { key: `${K}.nothingToUpdate` } };
  }

  const intercity = data.intercityThresholdKm ?? current.intercityThresholdKm;
  const manual = data.manualQuoteThresholdKm ?? current.manualQuoteThresholdKm;
  if (manual <= intercity) {
    return { error: { key: `${K}.manualBelowIntercity` } };
  }

  return { data };
}

/* -------------------------------------------------------------------------- */
/* Percent <-> fraction                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A percentage typed by an admin ("12.5") as the stored fraction (0.125),
 * rounded to 4 dp so float dust (`0.07 * 100`) never reaches the database.
 * Returns `NaN` for a blank or non-numeric input so the parser rejects it.
 */
export function percentToFraction(input: string): number {
  if (input.trim() === "") return Number.NaN;
  const value = Number(input);
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round(value * 100) / 10_000;
}

/** A stored fraction as the percentage string an input shows (0.125 -> "12.5"). */
export function fractionToPercent(value: number): string {
  return String(Math.round(value * 1_000_000) / 10_000);
}

/** A typed number, or `NaN` for a blank input (so `Number("")` = 0 never slips through). */
export function numberFromInput(input: string): number {
  return input.trim() === "" ? Number.NaN : Number(input);
}

/* -------------------------------------------------------------------------- */
/* Translation                                                                */
/* -------------------------------------------------------------------------- */

/** Any `next-intl` translator, server or client — only the call shape matters. */
type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * An error as text in the translator's language. A `field` value is a column
 * name (`cityPricePerKm`), so it is first swapped for its own label from
 * `admin.adminPricing.fields` — the message then names the column the admin
 * sees in the table, not the database's spelling of it.
 */
export function translatePricingError(
  t: Translator,
  error: ValidationError,
): string {
  const values = error.values ? { ...error.values } : undefined;
  if (values && typeof values.field === "string") {
    values.field = t(`admin.adminPricing.fields.${values.field}`);
  }
  return t(error.key, values);
}
