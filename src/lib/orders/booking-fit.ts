/**
 * Booking-time capacity checking: may this client's declared load be booked
 * against the vehicle *class* they picked? The question `src/lib/orders/vehicle-fit.ts`
 * answers for a driver's own truck, asked one step earlier — at the moment the
 * order is created, before any vehicle exists to ask about.
 *
 * **Why this exists as a separate module rather than a call to `loadFits`.** A
 * real order was booked declaring 15 m of length against `BOX_TRUCK`, whose
 * catalogue cargo length is 4.5 m. Nothing refused it: `CARGO_MEASUREMENT_BOUNDS`
 * (`src/lib/cargo.ts`) capped length at 20 m as a sanity ceiling and never
 * compares the figure against the selected class, and `estimateDelivery` prices
 * a load by distance and vehicle class without ever asking whether the load fits
 * the class it is priced against. So the booking succeeded: the order was
 * created, priced at ₾101.67 and reached `PENDING` — on-market, awaiting a
 * carrier — and then `GET /api/loads`, which filters every load by fit, hid it
 * from every carrier on the platform. No money moved (that order's `Payment` sat
 * at `PENDING` and was never captured), and that is not the mitigation it
 * sounds like: the order was accepted, quoted a price, and shown to its client
 * as live, while being unfulfillable by construction and invisible to everyone
 * who could have fulfilled it. It would have waited there until someone noticed.
 * An order the platform cannot serve is worse than a refused one — a refusal is
 * information the client can act on at the moment they can still act on it.
 *
 * **Why spec-based and not vehicle-based.** At booking time there is no
 * `Vehicle` row to check against — no driver has claimed the load, and which
 * specific truck eventually takes it is unknown and unknowable. The only
 * capacity fact in hand is the `VehicleTypeSpec` the client selected, so that is
 * what the load is measured against. This is a genuinely different question from
 * the load board's, not a duplicate of it, and the two can disagree without
 * either being wrong: a driver whose `Vehicle` declares a longer bed than its
 * class average may well be able to carry a load this module would have refused
 * at booking. That asymmetry is the safe direction. Refusing at booking against
 * the class figure guarantees the load is carryable by the *typical* member of
 * the class the client paid for, which is the promise the price was quoted on;
 * admitting it on one unusually large truck's say-so would be promising a
 * vehicle the platform cannot guarantee turns up.
 *
 * **`specCapability` MUST go through `capabilityOf`, and that is not stylistic.**
 * `VehicleTypeSpec.cargoHeightM` carries a sentinel — `0` means "open bed, no
 * height limit", which `prisma/seed.ts` seeds for `FLATBED_TRUCK` — and
 * `capabilityOf` is the one boundary in the codebase where that `0` becomes
 * `Infinity`. Reading the four spec columns straight into a `VehicleCapability`
 * here would look equivalent and would reject *every* flatbed booking, because
 * any declared height at all exceeds a limit of zero. The sentinel is translated
 * in exactly one place on purpose (see `capabilityOf`); this module consumes that
 * translation rather than re-deriving it.
 *
 * **Deliberately dependency-free**, for the same reason as `vehicle-fit.ts`: no
 * `import "server-only"` and no Prisma import, only client-safe modules. The
 * booking form imports this to refuse an oversized load before the request is
 * sent, and `POST /api/orders` imports it to refuse one that is sent anyway. The
 * server check is the authority — the form's copy is a courtesy that saves a
 * round-trip — and both reading the same functions is what stops the two drifting
 * into disagreeing about the same load, the failure `CARGO_MEASUREMENT_BOUNDS`
 * already documents from its own history.
 *
 * **Non-goal: rotation**, inherited unchanged from `vehicle-fit.ts` — a load too
 * long for the class is never re-checked against the class's width. See that
 * module for why.
 */

import { CARGO_MEASUREMENT_BOUNDS } from "@/lib/cargo";

import {
  capabilityOf,
  type LoadDimensions,
  type VehicleCapability,
} from "@/lib/orders/vehicle-fit";

/**
 * The capacity columns of a `VehicleTypeSpec`, as a plain slice.
 *
 * Structurally identical to the `spec` parameter `capabilityOf` accepts, and
 * named here so the route's Prisma `select` and the booking form's catalogue
 * lookup can both state what they must supply. All four are non-null: every
 * seeded vehicle type has a complete set of catalogue figures, which is the
 * whole reason a spec is a usable capacity source at booking time when a
 * partially declared `Vehicle` would not be.
 */
export type SpecCapacitySlice = {
  maxPayloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
};

/** One axis of the four a load is measured on. */
export type CargoAxis = "weight" | "length" | "width" | "height";

/**
 * How each axis is compared and how it is spoken about.
 *
 * The three facts about an axis travel together in one table because they are
 * only correct together: comparing `load.lengthM` against `capability.widthM`,
 * or reporting a length limit in kilograms, is precisely the mistake a pair of
 * parallel switch statements invites. The `Record<CargoAxis, …>` keying also
 * keeps the table exhaustive — a fifth axis fails typecheck here until it has
 * been given a comparison and a phrase.
 *
 * The load and capability field names differ per axis (`weightKg` against
 * `payloadKg`, `lengthM` against `lengthM`), which is why both are stated
 * explicitly rather than derived from the axis name.
 *
 * Units are read from `CARGO_MEASUREMENT_BOUNDS` rather than written out again:
 * that table is already the codebase's single statement of how these four
 * measurements are spelled to a client, and a refusal saying "4.5 m" while the
 * bounds message says "4.5 metres" is exactly the small drift it exists to stop.
 */
type CargoAxisDescriptor = {
  /** The `LoadDimensions` field carrying the client's declared figure. */
  loadField: keyof LoadDimensions;
  /** The `VehicleCapability` field carrying the limit it is compared against. */
  capabilityField: keyof VehicleCapability;
  /** How a refusal names this axis being exceeded ("too long"). */
  exceededPhrase: string;
  /** The unit the limit is quoted in, as the bounds table spells it. */
  unit: string;
};

const CARGO_AXIS_DESCRIPTORS: Record<CargoAxis, CargoAxisDescriptor> = {
  weight: {
    loadField: "weightKg",
    capabilityField: "payloadKg",
    exceededPhrase: "too heavy",
    unit: CARGO_MEASUREMENT_BOUNDS.cargoWeightKg.unit,
  },
  length: {
    loadField: "lengthM",
    capabilityField: "lengthM",
    exceededPhrase: "too long",
    unit: CARGO_MEASUREMENT_BOUNDS.cargoLengthM.unit,
  },
  width: {
    loadField: "widthM",
    capabilityField: "widthM",
    exceededPhrase: "too wide",
    unit: CARGO_MEASUREMENT_BOUNDS.cargoWidthM.unit,
  },
  height: {
    loadField: "heightM",
    capabilityField: "heightM",
    exceededPhrase: "too tall",
    unit: CARGO_MEASUREMENT_BOUNDS.cargoHeightM.unit,
  },
};

/**
 * The order axes are examined and reported in — the same order `LoadDimensions`
 * declares its fields and `loadFits` compares them, so a reader can line the two
 * modules up without holding a second ordering in their head.
 *
 * `cargoFitMessage` renders whatever order it is *handed*, so a caller wanting a
 * different emphasis can reorder the array without touching this constant. This
 * is the order `oversizeAxes` produces.
 */
const CARGO_AXIS_ORDER: readonly CargoAxis[] = [
  "weight",
  "length",
  "width",
  "height",
];

/**
 * A vehicle class's capability, for booking time when no `Vehicle` row exists
 * yet — the catalogue figures and nothing else.
 *
 * Implemented by handing `capabilityOf` an all-null vehicle slice, which is the
 * shape that means "no driver override on any axis" and so resolves every field
 * to its spec value. Deliberately *not* a hand-rolled object literal over the
 * four spec columns, even though that would be shorter and would look right:
 * `capabilityOf` is where `cargoHeightM === 0` is translated to `Infinity` for
 * an open bed, and a literal would silently drop that translation and refuse
 * every `FLATBED_TRUCK` booking on height. Routing through the existing function
 * also means a future change to how a capability is resolved — another sentinel,
 * a new axis — reaches booking without anyone remembering this file exists.
 */
export function specCapability(spec: SpecCapacitySlice): VehicleCapability {
  return capabilityOf(
    {
      payloadKg: null,
      cargoLengthM: null,
      cargoWidthM: null,
      cargoHeightM: null,
    },
    spec,
  );
}

/**
 * Which axes of `load` exceed `capability`. An empty array means the load fits —
 * or at least that nothing it declared does not fit, which is the same answer
 * for the purpose of refusing a booking.
 *
 * **`null` on the load side is UNKNOWN and is never reported as oversize.** This
 * is the deliberate opposite of `loadFits`, which folds unknown into `false`,
 * and the difference is the difference between the two questions. `loadFits` is
 * asked before committing a truck to a job, where an unmeasured load is a driver
 * stranded at a pickup, so unknown must resolve to "do not go". This function is
 * asked to justify *refusing a client's booking*, and "you did not tell us the
 * height" is not evidence that the cargo is too tall — refusing on it would
 * reject a load nobody has any reason to think oversized, with a message
 * claiming something untrue about it. Only axes the client actually declared are
 * compared. (`POST /api/orders` requires all four today, so the partial case is a
 * floor rather than a live path; it is the booking form, validating a
 * half-filled set of fields as the client types, that reaches it constantly.)
 *
 * An axis whose capability is `Infinity` is never reported either. Arithmetically
 * that is already true — nothing is greater than `Infinity` — but it is stated
 * explicitly because the consequence is not arithmetic: it keeps the `Infinity`
 * out of `cargoFitMessage`, which would otherwise be able to quote an open
 * flatbed a maximum height of "∞".
 *
 * Bounds are inclusive, matching `loadFits`: a load exactly at the class limit
 * fits and is not returned.
 */
export function oversizeAxes(
  load: LoadDimensions,
  capability: VehicleCapability,
): CargoAxis[] {
  return CARGO_AXIS_ORDER.filter((axis) => {
    const { loadField, capabilityField } = CARGO_AXIS_DESCRIPTORS[axis];

    const declared = load[loadField];
    if (declared === null) {
      return false;
    }

    const limit = capability[capabilityField];
    if (!Number.isFinite(limit)) {
      return false;
    }

    return declared > limit;
  });
}

/**
 * Join phrases the way a sentence does: "a", "a and b", "a, b and c".
 *
 * Written out rather than reached for `Intl.ListFormat` because the output of
 * this module is a stored, tested error string and not a localised UI label —
 * every other message in `POST /api/orders` is a plain English literal, and
 * `quoteFailureMessage` builds its own list with `.join(" or ")` for the same
 * reason. No Oxford comma, matching the house voice of those messages.
 */
function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) {
    return phrases.join("");
  }

  // Sliced rather than indexed: under `noUncheckedIndexedAccess` an element read
  // is `string | undefined`, and a one-element `join` says the same thing
  // without a non-null assertion.
  return `${phrases.slice(0, -1).join(", ")} and ${phrases.slice(-1).join("")}`;
}

/**
 * Format one limit for display: grouped thousands, no forced decimals — 3500
 * reads "3,500" and 4.5 reads "4.5".
 *
 * `toLocaleString("en-US")` with no options is the formatting the rest of the
 * codebase already applies to payload figures in client-facing copy (see
 * `src/lib/fleet-onboarding/vehicle-validation.ts` and the driver onboarding
 * submit route), and applying it to the dimensions too keeps one message from
 * mixing two number styles.
 */
function formatLimit(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * The refusal a client reads: which way their cargo is too big for the class
 * they picked, and what that class actually takes.
 *
 * Names every offending axis and every corresponding limit, in the order given,
 * so a client who is over on two axes fixes both in one edit instead of
 * discovering the second after resubmitting:
 *
 *     Cargo is too long for a Box Truck (max 4.5 m).
 *     Cargo is too heavy and too long for a Box Truck (max 3,500 kg, 4.5 m).
 *
 * Sentence case with a full stop, one sentence, no field map — the shape every
 * other rejection in `POST /api/orders` uses, because that handler answers with
 * a single `error` string and the booking form renders it as it arrives.
 *
 * **The indefinite article is a plain "a".** Every seeded label begins with a
 * consonant sound except "MPV / Estate", which reads "an MPV" aloud; an
 * article-choosing helper was considered and rejected, because getting that one
 * label right needs initialism awareness (a vowel-letter test still says "a
 * MPV") — real complexity for one character in a message a client sees only
 * when their booking is refused. Worth revisiting if a vowel-initial class is
 * ever seeded.
 *
 * An empty `axes` falls back to a bare "does not fit" sentence. By contract that
 * is unreachable — an empty array from `oversizeAxes` means the load fits and no
 * caller should be composing a refusal — but a truthful short sentence is a
 * better floor than the malformed "Cargo is  for a Box Truck (max )." that
 * naive interpolation would produce.
 */
export function cargoFitMessage(
  specLabel: string,
  axes: CargoAxis[],
  capability: VehicleCapability,
): string {
  if (axes.length === 0) {
    return `Cargo does not fit a ${specLabel}.`;
  }

  const phrases = joinPhrases(
    axes.map((axis) => CARGO_AXIS_DESCRIPTORS[axis].exceededPhrase),
  );

  const limits = axes
    .map((axis) => {
      const { capabilityField, unit } = CARGO_AXIS_DESCRIPTORS[axis];
      return `${formatLimit(capability[capabilityField])} ${unit}`;
    })
    .join(", ");

  return `Cargo is ${phrases} for a ${specLabel} (max ${limits}).`;
}
