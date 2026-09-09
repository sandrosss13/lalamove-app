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
 * **Where the figures come from.** Three of the four ceilings are *fleet-derived*
 * rather than round numbers: weight, length and width are the largest figures
 * anywhere in the seeded `VehicleTypeSpec` catalogue — 24,000 kg and 13.6 m from
 * `TRAILER_TRUCK`, 2.5 m of width from `LARGE_FREIGHT_TRUCK`. Above those, no
 * vehicle class on this platform could carry the load at all, so there is no
 * such thing as accepting the figure: the order is created, priced, put
 * on-market, and then hidden from every carrier by the load board's fit filter,
 * which compares against the same catalogue. They were previously round sanity
 * numbers with deliberate headroom (30,000 kg, 20 m, 3 m) left "in case a bigger
 * type is seeded later", and that headroom is precisely the hole a real 15 m
 * booking went through. Headroom for a vehicle that does not exist buys nothing
 * and costs an unfulfillable order.
 *
 * **So this table is now coupled to `prisma/seed.ts`, knowingly.** Seed a larger
 * class and these three maxima must be raised with it, or the new class is
 * unbookable at its own limits — a client could not declare the load the new
 * vehicle was bought to carry. Deriving them from the catalogue at runtime
 * instead was considered and rejected: it would mean a database read in the one
 * module that must stay plain data (see above), and would put `@prisma/client`'s
 * runtime into the browser bundle the moment the booking form imported it.
 *
 * **They are still a coarse filter and still not the real check.** What decides
 * whether a load is bookable is `src/lib/orders/booking-fit.ts`, which compares
 * the declared load against the *class the client actually selected*; a 13.6 m
 * load clears this table and is rightly refused for a `BOX_TRUCK`, whose
 * catalogue length is 4.5 m. All this table does is reject figures **no** class
 * could satisfy, early and without needing to know which class was picked — the
 * job the booking form needs done while the client is still typing, before a
 * vehicle has been chosen.
 *
 * **Height is the exception, and stays a pure sanity ceiling at 4 m.** The
 * tallest *enclosed* hold in the catalogue is `TRAILER_TRUCK`'s 2.7 m, but
 * tightening to it would refuse loads that are genuinely bookable:
 * `FLATBED_TRUCK` is seeded with `cargoHeightM: 0`, the documented "open bed, no
 * height limit" sentinel, which `capabilityOf`
 * (`src/lib/orders/vehicle-fit.ts`) translates to `Infinity`. An open flatbed
 * really does have no height ceiling, so a 3 m load on a flatbed is a booking
 * the platform can serve, and a fleet-derived height bound would be the same
 * "hidden from a carrier who could carry it" failure in reverse — refused before
 * anyone was asked. Height therefore keeps its original job: catching a negative
 * number or a stray extra zero, nothing more.
 *
 * Keyed by the request-body field name rather than a friendly label, so a
 * reader can line each entry up against the JSON the form posts and the parser
 * reads without a translation step.
 */
export const CARGO_MEASUREMENT_BOUNDS = {
  cargoWeightKg: { min: 1, max: 24_000, unit: "kg" },
  cargoLengthM: { min: 0.1, max: 13.6, unit: "m" },
  cargoWidthM: { min: 0.1, max: 2.5, unit: "m" },
  // Not 2.7 (the tallest enclosed hold) — the flatbed sentinel, above.
  cargoHeightM: { min: 0.1, max: 4, unit: "m" },
} as const satisfies Record<string, CargoMeasurementBounds>;
