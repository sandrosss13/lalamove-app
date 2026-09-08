/**
 * Cargo taxonomy: what each `CargoCategory` is called in the UI, and which
 * vehicle categories it may be booked with.
 *
 * Plain data only. The Prisma enums are imported as *types* (erased at compile
 * time) and the values are written as string literals, so importing this module
 * from a client component never pulls `@prisma/client`'s runtime into the
 * browser bundle — the same reason the vehicle option list this replaces
 * duplicated its enum values instead of importing them. The `Record` keys keep
 * the tables exhaustive: adding an enum member fails typecheck until it is
 * listed here.
 */

import type {
  CargoCategory,
  CargoHandlingTag,
  VehicleCategory,
} from "@prisma/client";

export const CARGO_CATEGORY_LABELS: Record<CargoCategory, string> = {
  FURNITURE_FURNISHINGS: "Furniture & Furnishings",
  APPLIANCES: "Home & Office Appliances",
  RETAIL_STOCK: "Store & Retail Stock",
  EVENT_EQUIPMENT: "Event & Exhibition Equipment",
  FULL_RELOCATION: "Full Relocation",
  INDUSTRIAL_SUPPLIES: "Industrial & Commercial Supplies",
  CONSTRUCTION_MATERIALS: "Construction & Hardware Materials",
};

/**
 * What each handling requirement is called in the UI.
 *
 * A sibling of `CARGO_CATEGORY_LABELS` above and deliberately the same shape: a
 * `Record` keyed by the enum, so a tag added to `CargoHandlingTag` fails
 * typecheck here until it has been given copy, and plain string-literal keys, so
 * this module still never pulls `@prisma/client`'s runtime into the browser
 * bundle (see the note at the top of this file).
 *
 * Copy only. What a tag *means* operationally is written down nowhere in this
 * table and should not be: cold chain is checked against the booked body type by
 * the booking form, and hazmat is a warning rather than a control because
 * `DriverLicence` carries no certification field — see
 * `specs/driver-load-board/action-required.md`. Both of those rules live where
 * they are enforced, not next to their labels.
 */
export const CARGO_HANDLING_TAG_LABELS: Record<CargoHandlingTag, string> = {
  FRAGILE: "Fragile",
  COLD_CHAIN: "Cold chain",
  HAZMAT: "Hazmat",
  TIME_CRITICAL: "Time critical",
  UPRIGHT_ONLY: "Upright only",
  HEAVY_ITEM: "Heavy item",
};

/**
 * Which vehicle categories a cargo category may be booked with. The heavy
 * categories (a full relocation, industrial supplies, construction materials)
 * are heavy-duty only: no medium-duty van can legally or physically take them.
 */
export const CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES: Record<
  CargoCategory,
  VehicleCategory[]
> = {
  FURNITURE_FURNISHINGS: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  APPLIANCES: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  RETAIL_STOCK: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  EVENT_EQUIPMENT: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  FULL_RELOCATION: ["HEAVY_DUTY"],
  INDUSTRIAL_SUPPLIES: ["HEAVY_DUTY"],
  CONSTRUCTION_MATERIALS: ["HEAVY_DUTY"],
};

/** The accepted range for one declared load measurement, and how to say it. */
export type CargoMeasurementBounds = {
  /**
   * The smallest value the *booking form* offers. Deliberately not the server's
   * floor: `POST /api/orders` accepts anything strictly greater than zero, which
   * is a garbage check rather than a usability one. The form's floor is the
   * tighter of the two, so a value the form produces can never fail the server's
   * — the containment runs one way on purpose, and must keep running that way.
   */
  min: number;
  /**
   * The ceiling, enforced identically on both sides. This is the number that
   * actually has to agree, because a client ceiling *above* the server's is the
   * failure this table exists to prevent: it enables a submit button on a value
   * the endpoint answers with a 400.
   */
  max: number;
  /** The unit, as both sides spell it in the message they show. */
  unit: string;
};

/**
 * The bounds on a load's declared weight and dimensions — the single definition
 * both the booking form and `POST /api/orders` read.
 *
 * **Why this lives here rather than beside either enforcement point.** These
 * four numbers are one half of a contract with two enforcers: the form uses them
 * to decide whether the submit button lights up, and the endpoint uses them to
 * decide whether the body is accepted. Written out twice they drifted almost
 * immediately — the form allowed 15 m of width and height against the endpoint's
 * 3 m and 4 m, so a 5 m width passed every client check, enabled the button, and
 * came back a 400 with no field to blame. Nothing about that failure is visible
 * in either file on its own, which is exactly why the numbers are stated once.
 *
 * `src/lib/cargo.ts` is the right home because it is already the client-safe
 * cargo module: Prisma is imported here as *types only*, so a client component
 * importing this never drags `@prisma/client`'s runtime into the browser bundle,
 * and there is no `server-only` marker to break the form's import. Keep it that
 * way — plain data and types, nothing that touches a database or a request.
 *
 * **Where the figures come from.** They are sanity bounds, not capability
 * checks: what actually decides whether a load suits a vehicle is the load
 * board's fit comparison against `VehicleTypeSpec`, and these only exist to
 * catch obvious garbage (a negative number, a stray extra zero). The ceilings
 * sit above the largest seeded `VehicleTypeSpec` (`SEMI_TRAILER`: 24,000 kg,
 * 13.6 × 2.48 × 2.7 m) with room for a bigger type to be seeded later, while
 * staying close enough to reality to catch a typo. Width and height are the
 * tight pair on purpose — the widest seeded vehicle is 2.5 m, so a 15 m width
 * was never a load anyone could carry, it was a mis-keyed 1.5.
 *
 * Keyed by the request-body field name rather than a friendly label, so a
 * reader can line each entry up against the JSON the form posts and the parser
 * reads without a translation step.
 */
export const CARGO_MEASUREMENT_BOUNDS = {
  cargoWeightKg: { min: 1, max: 30_000, unit: "kg" },
  cargoLengthM: { min: 0.1, max: 20, unit: "m" },
  cargoWidthM: { min: 0.1, max: 3, unit: "m" },
  cargoHeightM: { min: 0.1, max: 4, unit: "m" },
} as const satisfies Record<string, CargoMeasurementBounds>;
