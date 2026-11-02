/**
 * The load plan: what a client's item list adds up to, and which vehicle class
 * it should be booked on.
 *
 * Goods-first booking replaces four typed cargo figures with a list of items
 * (a sofa, a double fridge, twenty medium boxes). Something has to turn that
 * list back into the figures the rest of the platform already understands —
 * a weight and a largest-item envelope for `oversizeAxes`, a cargo category for
 * the `cargo_vehicle_mismatch` rule in `pricing.ts`, a body type for the load
 * board — and then say which class the client should pick. `planLoad` does the
 * first job and `recommendVehicles` the second.
 *
 * **One implementation, two callers.** The booking form runs this to recommend
 * a vehicle while the client is still listing items. `POST /api/orders` runs it
 * again to re-derive what goes on the order from the items that were actually
 * sent, so a client can never post a hand-edited weight that disagrees with its
 * own item list. Both reading the same functions is what keeps "the form said
 * it fits" and "the server agreed" the same sentence — the rule
 * `booking-fit.ts` and `dispatch-fit.ts` already follow, for the failure
 * `CARGO_MEASUREMENT_BOUNDS` documents from its own history.
 *
 * **Deliberately dependency-free**, exactly as `src/lib/orders/vehicle-fit.ts`
 * and `src/lib/orders/booking-fit.ts` are: no `import "server-only"`, no Prisma
 * import and no Prisma-generated type in any signature. The enum-valued fields
 * (cargo category, body, handling tags) are typed as plain string-literal
 * unions. Two of them are derived from the client-safe tables in
 * `src/lib/cargo.ts`, whose `Record` keys are checked against the Prisma enums
 * there, so a new enum member still fails typecheck somewhere rather than
 * slipping through; the body union is written out because no client-safe table
 * of bodies exists, and `tests/load-plan.spec.ts` checks it against
 * `ChassisType` at the type level. The property is worth the ceremony: the
 * form imports this module into the browser bundle, and the spec builds every
 * line and every vehicle class as an object literal — a Prisma import here
 * would turn each assertion into an integration test against a database.
 *
 * **Hard fit is not re-expressed here.** Whether a load cannot physically go
 * on a class is `oversizeAxes(load, specCapability(spec))`, the check the route
 * already refuses by; `assessFit` calls exactly that. In particular the
 * flatbed's `cargoHeightM: 0` "open bed" sentinel reaches this module only as
 * `Infinity` through `specCapability` → `capabilityOf`, never from the raw
 * column — reading the column directly would refuse every flatbed booking on
 * height (see `booking-fit.ts`).
 *
 * **Soft fit is new, and only steers.** Weight with a safety margin, packed
 * volume and floor area for non-stackable items are estimates of estimates —
 * catalogue weights are typical, not weighed, and nothing here does 3D bin
 * packing. They move the recommendation up a class and print a warning; they
 * never refuse a booking, because refusing on them would refuse loads that fit.
 *
 * **Non-goal: rotation**, inherited from `vehicle-fit.ts`. Items are sized as
 * carried (a wardrobe lying down, a fridge standing up), and the only
 * normalisation is length ≥ width on the floor plane, which is the conservative
 * reading `oversizeAxes` already expects of the envelope.
 */

import {
  CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES,
  CARGO_HANDLING_TAG_LABELS,
  CARGO_MEASUREMENT_BOUNDS,
  type CargoMeasurementBounds,
} from "@/lib/cargo";
import {
  oversizeAxes,
  specCapability,
  type CargoAxis,
  type SpecCapacitySlice,
} from "@/lib/orders/booking-fit";
import type {
  LoadDimensions,
  VehicleCapability,
} from "@/lib/orders/vehicle-fit";
import { vehicleOffersBody } from "@/lib/vehicle-body";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A `CargoCategory` value, as a plain string-literal union.
 *
 * Read off the keys of `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES` rather than
 * imported from `@prisma/client`: that table is already keyed exhaustively by
 * the enum, so the union cannot drift from it, and this module never names a
 * generated type.
 */
export type CargoCategoryKey =
  keyof typeof CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES;

/** A `CargoHandlingTag` value; derived the same way, from the label table. */
export type HandlingTagKey = keyof typeof CARGO_HANDLING_TAG_LABELS;

/**
 * A `ChassisType` value (the order's body / load space).
 *
 * Written out because `src/lib/cargo.ts` has no body table to derive it from.
 * `tests/load-plan.spec.ts` asserts at the type level that it equals the
 * Prisma enum both ways, so adding a body to the schema fails that spec's
 * typecheck until it is added here.
 */
export type ChassisTypeKey = "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS";

/**
 * Enum declaration order, as ranks. Tie-breaks and union orderings below are
 * "in enum order" so that the same list always yields the same plan, whatever
 * order the client happened to add items in.
 *
 * `Record`s rather than arrays so each table is exhaustive: a new enum member
 * fails typecheck here until it has been given a place. The ranks mirror
 * `prisma/schema.prisma`'s declaration order.
 */
const CARGO_CATEGORY_RANK: Record<CargoCategoryKey, number> = {
  FURNITURE_FURNISHINGS: 0,
  APPLIANCES: 1,
  RETAIL_STOCK: 2,
  EVENT_EQUIPMENT: 3,
  FULL_RELOCATION: 4,
  INDUSTRIAL_SUPPLIES: 5,
  CONSTRUCTION_MATERIALS: 6,
};

const HANDLING_TAG_RANK: Record<HandlingTagKey, number> = {
  FRAGILE: 0,
  COLD_CHAIN: 1,
  HAZMAT: 2,
  TIME_CRITICAL: 3,
  UPRIGHT_ONLY: 4,
  HEAVY_ITEM: 5,
};

const CHASSIS_TYPE_RANK: Record<ChassisTypeKey, number> = {
  DRY_BOX: 0,
  REFRIGERATED: 1,
  OPEN_CHASSIS: 2,
};

/** The body a load gets when no line forces one: an ordinary enclosed hold. */
const DEFAULT_BODY: ChassisTypeKey = "DRY_BOX";

/* -------------------------------------------------------------------------- */
/* Tunable estimates                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The recommendation wants the listed weight × this to be within payload.
 *
 * **A tunable estimate, not a rule.** Catalogue weights are typical figures
 * for a typical sofa, not a weighing; 10 % headroom keeps the recommended class
 * from being loaded to its exact rating on a guess. It is soft: the server's
 * hard weight check stays the raw total against payload, unchanged. Sign-off
 * on the figure is tracked in `specs/goods-first-booking/action-required.md`.
 */
export const WEIGHT_SAFETY_FACTOR = 1.1;

/**
 * Packed volume = summed item volume × this.
 *
 * **A tunable estimate, not a rule.** Real loads do not tessellate — a sofa
 * leaves dead space above it, boxes leave gaps around a fridge — and there is
 * no bin packing here. 1.4 is a first guess at that waste, to be tuned against
 * real orders; it only steers the recommendation and prints a warning. Owned
 * by `specs/goods-first-booking/action-required.md`.
 */
export const PACKING_FACTOR = 1.4;

/**
 * The height an open bed is treated as having, for its *volume* only.
 *
 * **A tunable estimate, not a rule.** A flatbed has no height limit
 * (`cargoHeightM: 0`, read through `specCapability` as `Infinity`), so its
 * volume is infinite and any load would "fit" it by volume. 2.0 m is a
 * practical stacking height for a secured open load. It never enters the hard
 * height check, which keeps the open bed unlimited. Owned by
 * `specs/goods-first-booking/action-required.md`.
 */
export const OPEN_BED_NOTIONAL_HEIGHT_M = 2.0;

/* -------------------------------------------------------------------------- */
/* Lines and the plan                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One listed line: a catalogue item, a custom item or a pallet line, already
 * resolved to figures. Per-unit figures; `quantity` multiplies them.
 *
 * Mirrors the snapshot columns of `OrderItem` plus the catalogue fields the
 * plan needs (`needsTwoPeople`, `requiredBody`, `handlingTags`,
 * `cargoCategory`), without importing either generated type.
 */
export type LoadLine = {
  quantity: number;
  unitWeightKg: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  /** `false` ⇒ the item's footprint counts towards floor area. */
  stackable: boolean;
  needsTwoPeople: boolean;
  /** Set only where the body is truly forced (chilled goods, forklift bulk). */
  requiredBody: ChassisTypeKey | null;
  handlingTags: readonly HandlingTagKey[];
  cargoCategory: CargoCategoryKey;
};

/**
 * The body a plan needs. `conflict` when two lines force different bodies —
 * chilled food and a rebar bundle cannot share one vehicle, and the client has
 * to split the booking or drop a line. `bodies` is in enum order.
 */
export type PlanBody =
  | { kind: "derived"; body: ChassisTypeKey }
  | { kind: "conflict"; bodies: ChassisTypeKey[] };

export type LoadPlan = {
  /** Σ quantity × unit weight. Not clamped — see `overMaximum`. */
  totalWeightKg: number;
  /** Σ quantity × L × W × H, before packing. Goes to `Order.cargoVolumeM3`. */
  itemVolumeM3: number;
  /** `itemVolumeM3 × PACKING_FACTOR`. */
  packedVolumeM3: number;
  /** Σ over non-stackable lines of quantity × L × W. */
  floorAreaM2: number;
  /**
   * The largest item, per axis, after normalising each line so length ≥
   * width — the meaning `Order.cargoLengthM/WidthM/HeightM` have always had.
   * `weightKg` carries the *total* weight, so the envelope is exactly the
   * `LoadDimensions` the order's four cargo columns and `oversizeAxes` take.
   */
  envelope: LoadDimensions;
  cargoCategory: CargoCategoryKey;
  body: PlanBody;
  /** Union of the lines' tags, in enum order. */
  handlingTags: HandlingTagKey[];
  /** 2 if any line needs two people to carry it. */
  suggestedCrew: 1 | 2;
  /**
   * `totalWeightKg` exceeds `CARGO_MEASUREMENT_BOUNDS.cargoWeightKg.max`, the
   * largest payload of any class on the platform. No single vehicle can take
   * it; the form asks the client to split the booking and the route refuses
   * it. Reachable: 33 heavy pallets weigh 26,400 kg.
   */
  overMaximum: boolean;
};

/**
 * The narrowest category present.
 *
 * Narrowest = fewest allowed vehicle categories in
 * `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES`: one bag of cement among a home
 * move still needs a heavy-duty vehicle, and taking anything wider would let
 * the order through the `cargo_vehicle_mismatch` rule on a van that cannot
 * legally carry it. Ties (most categories allow the same two vehicle
 * categories) go to the category carrying the most weight, so a sofa and a
 * paint bucket book as furniture, then to enum order so the answer never
 * depends on the order items were added in.
 */
function deriveCargoCategory(lines: readonly LoadLine[]): CargoCategoryKey {
  const weightByCategory = new Map<CargoCategoryKey, number>();
  for (const line of lines) {
    weightByCategory.set(
      line.cargoCategory,
      (weightByCategory.get(line.cargoCategory) ?? 0) +
        line.quantity * line.unitWeightKg,
    );
  }

  const ranked = [...weightByCategory.entries()].sort(
    ([a, weightA], [b, weightB]) =>
      CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[a].length -
        CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[b].length ||
      weightB - weightA ||
      CARGO_CATEGORY_RANK[a] - CARGO_CATEGORY_RANK[b],
  );

  // `planLoad` never calls this with an empty list.
  const [first] = ranked;
  if (!first) {
    throw new Error("deriveCargoCategory called with no lines");
  }
  return first[0];
}

/**
 * The body every line can travel in. No line forcing one ⇒ an ordinary dry
 * box. One forced body ⇒ that body (a chilled crate among boxes makes the
 * whole load refrigerated; the boxes travel cold). Two different forced
 * bodies ⇒ `conflict`, which nothing here tries to resolve: there is no vehicle
 * that is both a reefer and an open bed.
 */
function deriveBody(lines: readonly LoadLine[]): PlanBody {
  const forced = new Set<ChassisTypeKey>();
  for (const line of lines) {
    if (line.requiredBody !== null) {
      forced.add(line.requiredBody);
    }
  }

  const bodies = [...forced].sort(
    (a, b) => CHASSIS_TYPE_RANK[a] - CHASSIS_TYPE_RANK[b],
  );

  if (bodies.length > 1) {
    return { kind: "conflict", bodies };
  }
  return { kind: "derived", body: bodies[0] ?? DEFAULT_BODY };
}

/**
 * Turn a list of lines into a load plan. `null` for an empty list — there is
 * no plan for nothing, and a caller treating zero items as "a load of 0 kg"
 * would recommend the cheapest van for an order with no goods.
 *
 * Figures are summed exactly as given. Clamping to `CARGO_MEASUREMENT_BOUNDS`
 * is the job of whoever builds the lines (`palletLine`, `customLine`, the
 * catalogue's own bounds rule); the *total* weight is deliberately left
 * unclamped so an impossible load is reported as `overMaximum` rather than
 * silently shrunk to one that fits.
 */
export function planLoad(lines: readonly LoadLine[]): LoadPlan | null {
  if (lines.length === 0) {
    return null;
  }

  let totalWeightKg = 0;
  let itemVolumeM3 = 0;
  let floorAreaM2 = 0;
  let envelopeLengthM = 0;
  let envelopeWidthM = 0;
  let envelopeHeightM = 0;
  const tags = new Set<HandlingTagKey>();
  let needsTwoPeople = false;

  for (const line of lines) {
    const footprintM2 = line.lengthM * line.widthM;

    totalWeightKg += line.quantity * line.unitWeightKg;
    itemVolumeM3 += line.quantity * footprintM2 * line.heightM;
    if (!line.stackable) {
      floorAreaM2 += line.quantity * footprintM2;
    }

    // Normalised so length ≥ width: an item listed as 0.4 × 0.5 is the same
    // item as 0.5 × 0.4, and the envelope must not report a 0.5 m width for
    // it against a narrow hold. Height is never swapped — no rotation.
    envelopeLengthM = Math.max(
      envelopeLengthM,
      Math.max(line.lengthM, line.widthM),
    );
    envelopeWidthM = Math.max(
      envelopeWidthM,
      Math.min(line.lengthM, line.widthM),
    );
    envelopeHeightM = Math.max(envelopeHeightM, line.heightM);

    for (const tag of line.handlingTags) {
      tags.add(tag);
    }
    needsTwoPeople ||= line.needsTwoPeople;
  }

  return {
    totalWeightKg,
    itemVolumeM3,
    packedVolumeM3: itemVolumeM3 * PACKING_FACTOR,
    floorAreaM2,
    envelope: {
      weightKg: totalWeightKg,
      lengthM: envelopeLengthM,
      widthM: envelopeWidthM,
      heightM: envelopeHeightM,
    },
    cargoCategory: deriveCargoCategory(lines),
    body: deriveBody(lines),
    handlingTags: [...tags].sort(
      (a, b) => HANDLING_TAG_RANK[a] - HANDLING_TAG_RANK[b],
    ),
    suggestedCrew: needsTwoPeople ? 2 : 1,
    overMaximum: totalWeightKg > CARGO_MEASUREMENT_BOUNDS.cargoWeightKg.max,
  };
}

/* -------------------------------------------------------------------------- */
/* Building pallet and custom lines                                           */
/* -------------------------------------------------------------------------- */

/**
 * The most units one line may carry. Matches `OrderItem.quantity`'s 1–99 range
 * (pallets 1–33, a full trailer of EUR pallets). Here so the picker and the
 * route clamp a line the same way.
 */
export const MAX_LINE_QUANTITY = 99;
export const MAX_PALLET_COUNT = 33;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampTo(value: number, bounds: CargoMeasurementBounds): number {
  return clamp(value, bounds.min, bounds.max);
}

function clampQuantity(quantity: number, max: number): number {
  return clamp(Math.round(quantity), 1, max);
}

/** Standard pallet footprints, in metres. */
export const PALLET_TYPES = {
  EUR: { lengthM: 1.2, widthM: 0.8 },
  INDUSTRIAL: { lengthM: 1.2, widthM: 1.0 },
} as const;

export type PalletType = keyof typeof PALLET_TYPES;

/** Loaded height offered by default when the client does not know it. */
export const PALLET_DEFAULT_HEIGHT_M = 1.2;

/** Per-pallet weight presets, in kg. */
export const PALLET_WEIGHT_PRESETS = {
  LIGHT: 150,
  MEDIUM: 400,
  HEAVY: 800,
} as const;

/**
 * What is on the pallets, chosen per pallet line.
 *
 * Without this a pallet is just a size and a weight, and a pallet of cement
 * would book into a van while the catalogue's `BLOCKS_PALLET` needs a heavy
 * truck. The contents carry the cargo category (and for chilled goods the body
 * and the cold-chain tag) exactly as a catalogue entry does, so the plan's
 * category and body rules treat a pallet line like any other line.
 */
export const PALLET_CONTENTS = {
  GENERAL: {
    cargoCategory: "RETAIL_STOCK",
    requiredBody: null,
    handlingTags: [],
  },
  BUILDING: {
    cargoCategory: "CONSTRUCTION_MATERIALS",
    requiredBody: null,
    handlingTags: [],
  },
  INDUSTRIAL: {
    cargoCategory: "INDUSTRIAL_SUPPLIES",
    requiredBody: null,
    handlingTags: [],
  },
  CHILLED: {
    cargoCategory: "RETAIL_STOCK",
    requiredBody: "REFRIGERATED",
    handlingTags: ["COLD_CHAIN"],
  },
} as const satisfies Record<
  string,
  Pick<LoadLine, "cargoCategory" | "requiredBody" | "handlingTags">
>;

export type PalletContents = keyof typeof PALLET_CONTENTS;

/**
 * One pallet line. Pallets are never stackable (they are loaded by forklift
 * onto the deck, one layer), so every pallet counts towards floor area.
 * `weightKg` is per pallet. Every figure is clamped to
 * `CARGO_MEASUREMENT_BOUNDS` and the count to `MAX_PALLET_COUNT`.
 */
export function palletLine(
  type: PalletType,
  contents: PalletContents,
  count: number,
  heightM: number,
  weightKg: number,
): LoadLine {
  const { lengthM, widthM } = PALLET_TYPES[type];
  const contentsSpec = PALLET_CONTENTS[contents];

  return {
    quantity: clampQuantity(count, MAX_PALLET_COUNT),
    unitWeightKg: clampTo(weightKg, CARGO_MEASUREMENT_BOUNDS.cargoWeightKg),
    lengthM: clampTo(lengthM, CARGO_MEASUREMENT_BOUNDS.cargoLengthM),
    widthM: clampTo(widthM, CARGO_MEASUREMENT_BOUNDS.cargoWidthM),
    heightM: clampTo(heightM, CARGO_MEASUREMENT_BOUNDS.cargoHeightM),
    stackable: false,
    needsTwoPeople: false,
    requiredBody: contentsSpec.requiredBody,
    handlingTags: [...contentsSpec.handlingTags],
    cargoCategory: contentsSpec.cargoCategory,
  };
}

/** Size presets for an item not in the catalogue. L × W × H in metres. */
export const CUSTOM_SIZE_PRESETS = {
  S: { lengthM: 0.5, widthM: 0.4, heightM: 0.4, weightKg: 10 },
  M: { lengthM: 1.0, widthM: 0.6, heightM: 0.6, weightKg: 30 },
  L: { lengthM: 1.8, widthM: 0.9, heightM: 0.9, weightKg: 60 },
  XL: { lengthM: 2.2, widthM: 1.0, heightM: 1.2, weightKg: 120 },
} as const;

export type CustomSizePreset = keyof typeof CUSTOM_SIZE_PRESETS;

export type CustomLineInput = { quantity: number } & (
  | { preset: CustomSizePreset }
  | {
      exact: {
        lengthM: number;
        widthM: number;
        heightM: number;
        weightKg: number;
      };
    }
);

/**
 * One custom (non-catalogue) line, from a size preset or exact figures.
 *
 * Booked as `FURNITURE_FURNISHINGS`, the widest everyday category: a client
 * who could not find their item in the catalogue is most likely moving a
 * household object, and a custom line must never narrow the order to
 * heavy-duty on a guess. Stackable unless it is the XL preset, which is
 * sized like a wardrobe and is not something boxes go on. Exact figures are
 * normalised so length ≥ width (the catalogue's own storage rule) and every
 * figure is clamped to `CARGO_MEASUREMENT_BOUNDS`.
 */
export function customLine(input: CustomLineInput): LoadLine {
  const size =
    "preset" in input ? CUSTOM_SIZE_PRESETS[input.preset] : input.exact;
  const stackable = !("preset" in input && input.preset === "XL");

  return {
    quantity: clampQuantity(input.quantity, MAX_LINE_QUANTITY),
    unitWeightKg: clampTo(
      size.weightKg,
      CARGO_MEASUREMENT_BOUNDS.cargoWeightKg,
    ),
    lengthM: clampTo(
      Math.max(size.lengthM, size.widthM),
      CARGO_MEASUREMENT_BOUNDS.cargoLengthM,
    ),
    widthM: clampTo(
      Math.min(size.lengthM, size.widthM),
      CARGO_MEASUREMENT_BOUNDS.cargoWidthM,
    ),
    heightM: clampTo(size.heightM, CARGO_MEASUREMENT_BOUNDS.cargoHeightM),
    stackable,
    needsTwoPeople: false,
    requiredBody: null,
    handlingTags: [],
    cargoCategory: "FURNITURE_FURNISHINGS",
  };
}

/* -------------------------------------------------------------------------- */
/* Fit against a vehicle class                                                */
/* -------------------------------------------------------------------------- */

/**
 * What `assessFit` needs of a vehicle class: the capacity slice
 * `specCapability` accepts, plus the bodies it offers. Structural, so the
 * booking form's `OrderVehicleType`, the route's Prisma `select` and a test
 * literal all satisfy it unchanged.
 */
export type FitSpec = SpecCapacitySlice & {
  readonly bodyTypes: readonly string[];
};

/** A reason the recommendation would rather not use a class. Never a refusal. */
export type SoftFitReason = "weight_margin" | "volume" | "floor_area";

export type FitVerdict = "fits" | "may_not_fit" | "cannot_fit";

export type FitAssessment = {
  /** Axes the server would refuse on — `oversizeAxes`, unchanged. */
  hardAxes: CargoAxis[];
  soft: SoftFitReason[];
  /** Whether the class offers the body being booked. */
  bodyOk: boolean;
  /** `cannot_fit` on any hard axis or a body miss; else `may_not_fit` on any soft reason. */
  verdict: FitVerdict;
};

/**
 * A class's usable volume: L × W × H of its capability, with an open bed's
 * `Infinity` height replaced by `OPEN_BED_NOTIONAL_HEIGHT_M`. Takes the
 * *capability*, never the spec, so the open-bed sentinel arrives already
 * translated by `capabilityOf`.
 */
export function capabilityVolumeM3(capability: VehicleCapability): number {
  const heightM = Number.isFinite(capability.heightM)
    ? capability.heightM
    : OPEN_BED_NOTIONAL_HEIGHT_M;
  return capability.lengthM * capability.widthM * heightM;
}

/**
 * How well a plan fits one vehicle class, for a given body.
 *
 * `body` defaults to the plan's derived body. A plan in `conflict` has no
 * single body, so with no explicit `body` it is `bodyOk: false` against every
 * class — there is nothing to recommend until the client resolves it.
 *
 * The soft reasons are computed independently of the hard ones (a load over
 * payload is also over payload × 1.1); `verdict` gives the hard result
 * precedence, and a caller listing warnings for a `cannot_fit` class should
 * show `hardAxes`.
 */
export function assessFit(
  plan: LoadPlan,
  spec: FitSpec,
  body?: ChassisTypeKey,
): FitAssessment {
  const capability = specCapability(spec);
  const hardAxes = oversizeAxes(plan.envelope, capability);

  const soft: SoftFitReason[] = [];
  if (plan.totalWeightKg * WEIGHT_SAFETY_FACTOR > capability.payloadKg) {
    soft.push("weight_margin");
  }
  if (plan.packedVolumeM3 > capabilityVolumeM3(capability)) {
    soft.push("volume");
  }
  if (plan.floorAreaM2 > capability.lengthM * capability.widthM) {
    soft.push("floor_area");
  }

  const bookedBody =
    body ?? (plan.body.kind === "derived" ? plan.body.body : null);
  const bodyOk =
    bookedBody !== null && vehicleOffersBody<string>(spec, bookedBody);

  const verdict: FitVerdict =
    hardAxes.length > 0 || !bodyOk
      ? "cannot_fit"
      : soft.length > 0
        ? "may_not_fit"
        : "fits";

  return { hardAxes, soft, bodyOk, verdict };
}

/** One recommended class and the assessment it was chosen on. */
export type VehicleChoice<Spec extends FitSpec> = {
  spec: Spec;
  fit: FitAssessment;
};

export type VehicleRecommendation<Spec extends FitSpec> = {
  /**
   * The cheapest class that `fits`; failing that, the cheapest that
   * `may_not_fit` (its `fit.verdict` says so, and the form warns). `null` when
   * every class is `cannot_fit`.
   */
  recommended: VehicleChoice<Spec> | null;
  /**
   * The next class after `recommended` that also `fits` and is strictly
   * bigger — more payload or more volume. Never an equal class under another
   * name. `null` when there is none, or when `recommended` is only
   * `may_not_fit`.
   */
  oneSizeUp: VehicleChoice<Spec> | null;
};

/**
 * Which class to recommend for a plan, and the one above it.
 *
 * **`specs` must arrive sorted cheapest-first and already filtered** to
 * serviceable, cargo-category-eligible classes. This function does neither:
 * the form already holds both lists (`serviceable` on each vehicle type, and
 * the category's allowed vehicle categories), and the route has its own
 * authority for both. Keeping them out keeps this a pure fit ranking, and
 * keeps a test of fit from passing because a class was filtered for some
 * other reason.
 */
export function recommendVehicles<Spec extends FitSpec>(
  plan: LoadPlan,
  specs: readonly Spec[],
  body: ChassisTypeKey,
): VehicleRecommendation<Spec> {
  const judged = specs.map((spec) => ({
    spec,
    fit: assessFit(plan, spec, body),
  }));

  const recommendedIndex = judged.findIndex(
    ({ fit }) => fit.verdict === "fits",
  );

  if (recommendedIndex === -1) {
    const fallback =
      judged.find(({ fit }) => fit.verdict === "may_not_fit") ?? null;
    return { recommended: fallback, oneSizeUp: null };
  }

  const recommended = judged[recommendedIndex] ?? null;
  if (!recommended) {
    return { recommended: null, oneSizeUp: null };
  }

  const base = specCapability(recommended.spec);
  const baseVolumeM3 = capabilityVolumeM3(base);

  const oneSizeUp =
    judged.slice(recommendedIndex + 1).find(({ spec, fit }) => {
      if (fit.verdict !== "fits") {
        return false;
      }
      const capability = specCapability(spec);
      return (
        capability.payloadKg > base.payloadKg ||
        capabilityVolumeM3(capability) > baseVolumeM3
      );
    }) ?? null;

  return { recommended, oneSizeUp };
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The item list as one short line, for `Order.itemQuantity`:
 * `"1 × Fridge, double door, 15 × Box, medium"`.
 *
 * Truncated on a whole entry, never mid-label, with a trailing `…` standing for
 * whatever was dropped — "15 × Box, med…" reads as a different item. Only when
 * even the first entry cannot fit is it cut mid-label, since an empty summary
 * would say less than a cut one.
 */
export function summariseItems(
  lines: readonly { label: string; quantity: number }[],
  maxLength: number,
): string {
  const entries = lines.map(({ label, quantity }) => `${quantity} × ${label}`);
  const full = entries.join(", ");
  if (full.length <= maxLength) {
    return full;
  }

  const ellipsis = "…";
  let kept = "";
  for (const entry of entries) {
    const next = kept === "" ? entry : `${kept}, ${entry}`;
    // Room is needed for ", …" after the kept entries.
    if (next.length + 2 + ellipsis.length > maxLength) {
      break;
    }
    kept = next;
  }

  if (kept === "") {
    return `${full.slice(0, Math.max(0, maxLength - ellipsis.length))}${ellipsis}`;
  }
  return `${kept}, ${ellipsis}`;
}
