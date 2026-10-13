/**
 * The order-booking request body: its shape, how it is validated, and the one
 * derived field (the Georgian city an address names) that is resolved from it
 * rather than read off it.
 *
 * **Why this lives here and not in `src/app/api/orders/route.ts`.** That route
 * used to own all of it, which was fine while booking was the only way an
 * order's details were ever written. It no longer is: `PATCH /api/orders/[id]`
 * lets a client edit an order they have not paid for yet, and an edit is a
 * re-booking — the same form posts the same JSON, and the order that comes out
 * of it has to satisfy exactly the rules a fresh booking does. Two parsers would
 * be two rulebooks, and the first time one of them was tightened the other would
 * quietly start accepting what the first refuses: an edit could then smuggle in
 * a load a booking would have bounced. One parser, two callers, no drift — the
 * same reasoning `CARGO_MEASUREMENT_BOUNDS` (`src/lib/cargo.ts`) records for
 * the bounds this file reads.
 *
 * The moved code is otherwise unchanged, message for message, so
 * `POST /api/orders` answers every malformed body exactly as it did before the
 * split. Where a comment below says "this route", read "whichever of the two
 * order-writing routes called in".
 *
 * **Not marked `server-only`, deliberately**, though nothing in the browser has
 * any business importing it. The parser is a pure function of its input and a
 * translator, and `tests/order-input.spec.ts` exercises it with neither a
 * browser nor a database — the same property `src/lib/orders/vehicle-fit.ts`
 * keeps for the same reason. The one transitive Prisma import (through
 * `parseQuoteFields` in `src/lib/pricing.ts`) is a client instance that is never
 * queried on this path. The database-bound half of a booking — vehicle checks,
 * serviceability, pricing — is `src/lib/orders/order-write.ts`, and *that* is
 * `server-only`.
 */

import {
  CargoHandlingTag,
  ChassisType,
  GeorgianCity,
  PaymentMethodType,
  ServiceLevel,
} from "@prisma/client";

import type { RequestTranslator } from "@/i18n/request-locale";
import {
  CARGO_MEASUREMENT_BOUNDS,
  type CargoMeasurementBounds,
} from "@/lib/cargo";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import { parseQuoteFields, type QuoteInput } from "@/lib/pricing";

/** Valid values for each enum field, derived from the generated Prisma enums. */
const SERVICE_LEVELS = Object.values(ServiceLevel);
const BODY_TYPES = Object.values(ChassisType);
const PAYMENT_METHOD_TYPES = Object.values(PaymentMethodType);
const CARGO_HANDLING_TAGS = Object.values(CargoHandlingTag);

/**
 * The ceilings on a load's physical description are no longer written here.
 *
 * They live in `CARGO_MEASUREMENT_BOUNDS` (`src/lib/cargo.ts`), read by this
 * route *and* by the booking form, because a bound stated twice is a bound that
 * drifts: this route once capped width at 3 m and height at 4 m while the form
 * accepted 15 m of each, so a 5 m width satisfied every check the client could
 * run, enabled its submit button, and was then rejected here with a 400 the form
 * had no way to anticipate. One table, two readers, no drift.
 *
 * That module carries the reasoning behind each figure. What matters at this
 * call site is only that three of them — weight, length and width — are the
 * largest figures in the seeded vehicle catalogue, so a body over one of them
 * describes a load nothing on the platform could carry, while height alone is
 * still a sanity bound catching a negative number or a stray extra zero; and
 * that the vehicle-fit comparison, not this check, is what decides whether a
 * load actually suits a vehicle.
 */

/**
 * Every `GeorgianCity` keyed by its lower-cased display label, built once at
 * module load rather than scanned per request.
 *
 * `GEORGIAN_CITY_OPTIONS` mirrors the `GeorgianCity` enum exactly — its `value`
 * strings *are* the enum members — and is read here rather than
 * `Object.values(GeorgianCity)` because only the option list carries the human
 * label ("Tskaltubo"), which is the form an address actually spells the city in.
 */
const GEORGIAN_CITY_BY_LABEL = new Map<string, GeorgianCity>(
  GEORGIAN_CITY_OPTIONS.map((option) => [
    option.label.toLowerCase(),
    option.value,
  ]),
);

/**
 * The `GeorgianCity` an address names, or `null` when it names none.
 *
 * Resolved server-side from the address the geocode lookup produced, never read
 * from the request body — `Order.pickupCity`/`dropoffCity` back the load board's
 * city filter, and a city a client could choose freely would let a booking
 * advertise itself into a market it is not in.
 *
 * Matched against whole comma-delimited components of the address rather than by
 * substring, which is the entire reason these columns exist instead of a
 * `LIKE '%Tbilisi%'` over `pickupAddress`: "Tbilisi Highway 4, Rustavi" is a
 * Rustavi address, and a substring match would file it under Tbilisi. Comparing
 * a trimmed component for equality cannot make that mistake — "Tbilisi Highway
 * 4" is not "Tbilisi". The first matching component wins because Google formats
 * an address most-specific-first ("Street, City, Region, Country").
 *
 * An address matching nothing resolves to `null`, and that is a correct answer
 * rather than a failure: a village, a roadside depot or a border crossing is not
 * in the 63-value enum, and forcing it to the nearest city would show the load
 * to drivers filtering for a city it is not in. A null simply never matches a
 * city filter while still appearing on the unfiltered board. Order creation
 * therefore never fails over an unresolvable city.
 */
export function resolveGeorgianCity(address: string): GeorgianCity | null {
  for (const component of address.split(",")) {
    const city = GEORGIAN_CITY_BY_LABEL.get(component.trim().toLowerCase());
    if (city) {
      return city;
    }
  }

  return null;
}

/**
 * Longest accepted stop-contact field and purchase-order reference.
 *
 * These are free text by design — a contact name, a phone number in whatever
 * form the client keeps it, a block/floor/room note, a finance team's own
 * reference — so the only thing worth checking is that a booking cannot smuggle
 * an essay into a column the driver hub renders on one line.
 */
const FREE_TEXT_MAX_LENGTH = 200;

/**
 * A contact at one end of the job. Every field is optional and unvalidated in
 * shape: the booking form presents them as optional and never blocks on them.
 * `null` rather than `""` throughout, so a blank field is genuinely absent.
 */
export type StopContact = {
  name: string | null;
  phone: string | null;
  details: string | null;
};

/** Validated shape of an order-creation request body. */
export type CreateOrderInput = QuoteInput & {
  description?: string;
  /** When the client wants this picked up/delivered. Required — see below. */
  scheduledAt: Date;
  pickupContact: StopContact;
  dropoffContact: StopContact;
  /** The tier the client chose; the fare effect is derived server-side. */
  serviceLevel: ServiceLevel;
  /** The load space asked for, checked against the vehicle before the order lands. */
  bodyType: ChassisType | null;
  paymentMethodType: PaymentMethodType | null;
  savedCardId: string | null;
  /** Kept only for BUSINESS clients — see the account-type check in
   *  `prepareOrderWrite` (`src/lib/orders/order-write.ts`). */
  purchaseOrderRef: string | null;

  /**
   * The load's physical description and its time constraints. **Every field in
   * this block is optional.**
   *
   * The four measurements used to be required, on the reasoning that the load
   * board's fit filter treats an unknown value as *not fitting* and would hide
   * an unmeasured order from every driver. That reasoning no longer holds:
   * `classifyFit` (`src/lib/orders/vehicle-fit.ts`) separates a wholly
   * undeclared envelope (`UNDECLARED`, offered on the board and claimable) from
   * a partially declared one (`DOES_NOT_FIT`, hidden and refused). The booking
   * form no longer asks for the measurements at all — it asks for the vehicle's
   * weight bracket and, optionally, photos of the load — so the measurements
   * are **all-or-nothing**: all four absent is a normal booking, all four
   * present is bounds-checked exactly as before, and any other mix is a 400,
   * because a partial envelope is precisely the shape that would strand a paid
   * order off every board. See `parseCargoEnvelope`.
   *
   * A packaging note, an item count, a release window and a delivery deadline
   * are context a driver is glad to have and no filter consults. Requiring them
   * would mean refusing to book a real, carryable load over a blank text box.
   * The booking form once presented them as optional while this parser required
   * them, and `JSON.stringify` drops `undefined` keys, so a booking with no
   * packaging note came back `400 packagingDescription is required` — the form's
   * own submit path was dead. They stay optional.
   *
   * All nine columns are nullable in `prisma/schema.prisma`, and that
   * nullability is load-bearing: `null` means "the client did not say", which is
   * a truthful thing for a row to record.
   */
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  /**
   * Optional like its neighbours, but never `null`: the column is `NOT NULL`
   * with an empty default, and "no special handling" is a real answer rather
   * than a missing one. An omitted field is `[]`, which reads the same at every
   * call site.
   */
  handlingTags: CargoHandlingTag[];
  pickupWindowStart: Date | null;
  pickupWindowEnd: Date | null;
  deliveryDeadline: Date | null;
};

/**
 * How far into the past a submitted `scheduledAt` may fall before it's
 * rejected as stale rather than accepted. Exists only to absorb the gap
 * between the booking form reading "now" and this request landing — a slow
 * connection or a client clock a couple of minutes fast shouldn't turn a
 * pick of "today, right now" into a rejected submission.
 */
const SCHEDULED_AT_PAST_GRACE_MS = 5 * 60 * 1000;

/**
 * Trim an optional free-text field to its stored form: `null` when absent or
 * blank, the trimmed string otherwise, or an error when it is the wrong type or
 * over length. `fieldName` is the caller's own path (e.g. `pickupContact.name`)
 * so the message names the field the client actually sent.
 */
function parseOptionalText(
  value: unknown,
  fieldName: string,
  t: RequestTranslator,
): { value: string | null } | { error: string } {
  if (value === undefined || value === null) {
    return { value: null };
  }

  if (typeof value !== "string") {
    return {
      error: t("errors.orders.fieldMustBeStringWhenProvided", {
        field: fieldName,
      }),
    };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: null };
  }

  if (trimmed.length > FREE_TEXT_MAX_LENGTH) {
    return {
      error: t("errors.orders.fieldTooLong", {
        field: fieldName,
        max: FREE_TEXT_MAX_LENGTH,
      }),
    };
  }

  return { value: trimmed };
}

/**
 * Validate one stop's contact block. An omitted block is an empty contact
 * rather than an error: the dialog that fills it can be skipped entirely.
 */
function parseStopContact(
  value: unknown,
  fieldName: string,
  t: RequestTranslator,
): { data: StopContact } | { error: string } {
  const empty: StopContact = { name: null, phone: null, details: null };

  if (value === undefined || value === null) {
    return { data: empty };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      error: t("errors.orders.fieldMustBeObjectWhenProvided", {
        field: fieldName,
      }),
    };
  }

  const record = value as Record<string, unknown>;

  const name = parseOptionalText(record.name, `${fieldName}.name`, t);
  if ("error" in name) {
    return name;
  }

  const phone = parseOptionalText(record.phone, `${fieldName}.phone`, t);
  if ("error" in phone) {
    return phone;
  }

  const details = parseOptionalText(record.details, `${fieldName}.details`, t);
  if ("error" in details) {
    return details;
  }

  return {
    data: { name: name.value, phone: phone.value, details: details.value },
  };
}

/**
 * Validate one physical measurement: a finite number, strictly greater than
 * zero, no greater than the shared ceiling for that field.
 *
 * The bounds arrive as one object rather than as a loose `max` and `unit` pair
 * so a call site cannot hand this the width's ceiling with the weight's unit —
 * the two halves of a message travel together because they only make sense
 * together. `bounds.min` is deliberately *not* read here: it is the booking
 * form's floor, a usability nicety, whereas this route's floor is "greater than
 * zero", a garbage check. The form's floor is the tighter of the two, so this
 * asymmetry can only ever accept a form value, never reject one.
 *
 * Deliberately strict about the type rather than coercing: a numeric string is a
 * client that forgot to parse its own form field, and quietly accepting it would
 * put `"1200"` where the fit filter expects a number to compare.
 */
function parsePositiveMeasurement(
  value: unknown,
  fieldName: string,
  bounds: CargoMeasurementBounds,
  t: RequestTranslator,
): { value: number } | { error: string } {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > bounds.max
  ) {
    return {
      error: t("errors.orders.fieldMeasurementOutOfRange", {
        field: fieldName,
        max: bounds.max,
        unit: bounds.unit,
      }),
    };
  }

  return { value };
}

/** The four envelope measurements, each `null` when the client declared none. */
type CargoEnvelope = Pick<
  CreateOrderInput,
  "cargoWeightKg" | "cargoLengthM" | "cargoWidthM" | "cargoHeightM"
>;

/** Body keys of the envelope, in the order their errors are reported. */
const CARGO_ENVELOPE_FIELDS = [
  "cargoWeightKg",
  "cargoLengthM",
  "cargoWidthM",
  "cargoHeightM",
] as const satisfies readonly (keyof CargoEnvelope)[];

/**
 * Validate the load's physical envelope as one all-or-nothing unit.
 *
 * Absent (`undefined` or `null`) on all four is a booking that simply does not
 * describe its load — the normal case now the booking form no longer asks.
 * Present on all four is validated field by field through
 * `parsePositiveMeasurement`, unchanged. Any mix is refused: `classifyFit`
 * reads a partial envelope as `DOES_NOT_FIT`, so the order would be paid for
 * and then hidden from every driver's board and refused by every claim route.
 * Present fields are bounds-checked *before* the completeness check so a client
 * that sent one bad figure is told about the figure, not about its siblings.
 */
function parseCargoEnvelope(
  record: Record<string, unknown>,
  t: RequestTranslator,
): { value: CargoEnvelope } | { error: string } {
  const value: CargoEnvelope = {
    cargoWeightKg: null,
    cargoLengthM: null,
    cargoWidthM: null,
    cargoHeightM: null,
  };

  let declaredCount = 0;
  for (const field of CARGO_ENVELOPE_FIELDS) {
    const raw = record[field];
    if (raw === undefined || raw === null) {
      continue;
    }

    const parsed = parsePositiveMeasurement(
      raw,
      field,
      CARGO_MEASUREMENT_BOUNDS[field],
      t,
    );
    if ("error" in parsed) {
      return parsed;
    }

    value[field] = parsed.value;
    declaredCount += 1;
  }

  if (declaredCount > 0 && declaredCount < CARGO_ENVELOPE_FIELDS.length) {
    return { error: t("errors.orders.cargoEnvelopeIncomplete") };
  }

  return { value };
}

/**
 * Validate the handling-tag list: an array (or omitted), every member one of
 * `CargoHandlingTag`'s six values.
 *
 * De-duplicated rather than rejected: a repeated tag is a UI slip, not an
 * attack. That is the convention already established for exactly this situation
 * by `citiesOfOperation` (`src/app/api/logistics-company/route.ts`) and
 * `licenceCategories`
 * (`src/app/api/logistics-company/drivers/register/route.ts`) — both validate
 * membership with `Array.isArray` + `.every(...)` and then collapse the result
 * through a `Set` rather than failing a whole request over a duplicate the
 * client had no way to prevent. A `Set` preserves insertion order, so the tags
 * stay in the order the client picked them.
 */
function parseHandlingTags(
  value: unknown,
  t: RequestTranslator,
): { value: CargoHandlingTag[] } | { error: string } {
  if (value === undefined || value === null) {
    return { value: [] };
  }

  if (!Array.isArray(value)) {
    return { error: t("errors.orders.handlingtagsMustBeAnArrayWhen") };
  }

  const isHandlingTag = (tag: unknown): tag is CargoHandlingTag =>
    typeof tag === "string" &&
    CARGO_HANDLING_TAGS.includes(tag as CargoHandlingTag);

  if (!value.every(isHandlingTag)) {
    return {
      error: t("errors.orders.handlingTagsMustContainOnly", {
        allowed: CARGO_HANDLING_TAGS.join(", "),
      }),
    };
  }

  return { value: [...new Set(value)] };
}

/**
 * The date counterpart to `parseOptionalText`, used by all three cargo
 * timestamps: `null` when the key is absent, explicitly null or blank; a `Date`
 * when an ISO string parses; an error only when something was genuinely sent
 * and could not be read as a moment in time.
 *
 * Absent and blank collapse to the same `null` for the same reason
 * `parseOptionalText` collapses them: the booking form omits an unfilled
 * timestamp entirely (`JSON.stringify` drops an `undefined` value), while
 * another client may just as reasonably send `""` for a field its user left
 * alone. Both are the client saying "not declared", and both deserve the same
 * answer rather than one of them being a 400.
 *
 * No past-date grace period here, unlike `scheduledAt`: these three are windows
 * the client is declaring about a job that has not happened yet, and the
 * ordering checks at the call site — which fire only when both operands are
 * actually present — are what constrain them relative to one another.
 */
function parseOptionalDate(
  value: unknown,
  fieldName: string,
  t: RequestTranslator,
): { value: Date | null } | { error: string } {
  if (value === undefined || value === null) {
    return { value: null };
  }

  if (typeof value !== "string") {
    return {
      error: t("errors.orders.fieldMustBeStringWhenProvided", {
        field: fieldName,
      }),
    };
  }

  if (value.trim().length === 0) {
    return { value: null };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      error: t("errors.orders.fieldMustBeValidDateTime", { field: fieldName }),
    };
  }

  return { value: date };
}

/**
 * Hand-rolled body validation (the project has no validation library, and this
 * stage does not warrant adding one). The quote fields are validated by the
 * shared parser so this route and the public estimate endpoint reject the same
 * input with the same messages. Returns the typed input or an error message
 * describing the first problem encountered.
 */
export function parseCreateOrderBody(
  body: unknown,
  t: RequestTranslator,
): { data: CreateOrderInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const record = body as Record<string, unknown>;

  const quote = parseQuoteFields(record, t);
  if ("error" in quote) {
    return quote;
  }

  const { description, scheduledAt } = record;

  if (description !== undefined && typeof description !== "string") {
    return { error: t("errors.orders.descriptionMustBeAStringWhen") };
  }

  if (typeof scheduledAt !== "string" || scheduledAt.trim().length === 0) {
    return { error: t("errors.orders.scheduledatIsRequired") };
  }

  const scheduledAtDate = new Date(scheduledAt);
  if (Number.isNaN(scheduledAtDate.getTime())) {
    return { error: t("errors.orders.scheduledatMustBeAValidDate") };
  }

  if (scheduledAtDate.getTime() < Date.now() - SCHEDULED_AT_PAST_GRACE_MS) {
    return { error: t("errors.orders.scheduledatCannotBeInThePast") };
  }

  const pickupContact = parseStopContact(
    record.pickupContact,
    "pickupContact",
    t,
  );
  if ("error" in pickupContact) {
    return pickupContact;
  }

  const dropoffContact = parseStopContact(
    record.dropoffContact,
    "dropoffContact",
    t,
  );
  if ("error" in dropoffContact) {
    return dropoffContact;
  }

  // An omitted tier is Regular — the same value the column defaults to, and the
  // one every order predating the picker was in fact served at.
  const { serviceLevel } = record;
  if (
    serviceLevel !== undefined &&
    (typeof serviceLevel !== "string" ||
      !SERVICE_LEVELS.includes(serviceLevel as ServiceLevel))
  ) {
    return {
      error: t("errors.orders.serviceLevelMustBeOneOf", {
        allowed: SERVICE_LEVELS.join(", "),
      }),
    };
  }

  const { bodyType } = record;
  if (
    bodyType !== undefined &&
    (typeof bodyType !== "string" ||
      !BODY_TYPES.includes(bodyType as ChassisType))
  ) {
    return {
      error: t("errors.orders.bodyTypeMustBeOneOf", {
        allowed: BODY_TYPES.join(", "),
      }),
    };
  }

  const { paymentMethodType } = record;
  if (
    paymentMethodType !== undefined &&
    (typeof paymentMethodType !== "string" ||
      !PAYMENT_METHOD_TYPES.includes(paymentMethodType as PaymentMethodType))
  ) {
    return {
      error: t("errors.orders.paymentMethodTypeMustBeOneOf", {
        allowed: PAYMENT_METHOD_TYPES.join(", "),
      }),
    };
  }

  const { savedCardId } = record;
  if (
    savedCardId !== undefined &&
    (typeof savedCardId !== "string" || savedCardId.trim().length === 0)
  ) {
    return { error: t("common.shared.savedcardidMustBeANonEmpty") };
  }

  const chosenCardId =
    typeof savedCardId === "string" ? savedCardId.trim() : null;

  // A card and the method it pays with have to agree. Paying by card without
  // naming one is unbookable, and a card sent alongside cash or a bank transfer
  // means the client changed method without clearing its card — either way, say
  // which of the two to change rather than quietly picking one.
  if (paymentMethodType === PaymentMethodType.CARD && chosenCardId === null) {
    return { error: t("common.shared.chooseASavedCardToPay") };
  }

  if (paymentMethodType !== PaymentMethodType.CARD && chosenCardId !== null) {
    return {
      error: t("common.shared.sendSavedcardidOnlyWhenPaymentmethodtypeIs"),
    };
  }

  const purchaseOrderRef = parseOptionalText(
    record.purchaseOrderRef,
    "purchaseOrderRef",
    t,
  );
  if ("error" in purchaseOrderRef) {
    return purchaseOrderRef;
  }

  const cargoEnvelope = parseCargoEnvelope(record, t);
  if ("error" in cargoEnvelope) {
    return cargoEnvelope;
  }

  // Optional from here down. `parseOptionalText` is the same helper
  // `purchaseOrderRef` above uses, and for the same reason: an unfilled free-text
  // box is a client with nothing to add, not a client with a broken request.
  const packagingDescription = parseOptionalText(
    record.packagingDescription,
    "packagingDescription",
    t,
  );
  if ("error" in packagingDescription) {
    return packagingDescription;
  }

  const itemQuantity = parseOptionalText(
    record.itemQuantity,
    "itemQuantity",
    t,
  );
  if ("error" in itemQuantity) {
    return itemQuantity;
  }

  const handlingTags = parseHandlingTags(record.handlingTags, t);
  if ("error" in handlingTags) {
    return handlingTags;
  }

  const pickupWindowStart = parseOptionalDate(
    record.pickupWindowStart,
    "pickupWindowStart",
    t,
  );
  if ("error" in pickupWindowStart) {
    return pickupWindowStart;
  }

  const pickupWindowEnd = parseOptionalDate(
    record.pickupWindowEnd,
    "pickupWindowEnd",
    t,
  );
  if ("error" in pickupWindowEnd) {
    return pickupWindowEnd;
  }

  // A window that ends when (or before) it starts is not a window. Checked as a
  // pair rather than inside `parseOptionalDate`, which validates one instant at
  // a time and has no view of the other.
  //
  // Guarded on *both* ends being present, and that guard is the point rather
  // than a null-safety formality: a half-declared window is an optional field
  // the client filled in halfway, not a contradiction. There is nothing to
  // compare and so nothing to reject — a start with no end still tells a driver
  // something true, and refusing the booking over it would put the endpoint
  // right back to failing bookings for fields nobody has to fill. The booking
  // form does nudge the client to finish a half-filled window, but that is a
  // nudge, not a rule this route may invent on its behalf.
  if (
    pickupWindowStart.value !== null &&
    pickupWindowEnd.value !== null &&
    pickupWindowEnd.value.getTime() <= pickupWindowStart.value.getTime()
  ) {
    return {
      error: t("errors.orders.pickupwindowendMustBeAfterPickupwindowstart"),
    };
  }

  const deliveryDeadline = parseOptionalDate(
    record.deliveryDeadline,
    "deliveryDeadline",
    t,
  );
  if ("error" in deliveryDeadline) {
    return deliveryDeadline;
  }

  // Compared against the *end* of the pickup window rather than its start: a
  // deadline the driver could only meet by collecting early is a deadline the
  // client has not actually left room for.
  //
  // Same both-present guard, with the same reading: a deadline declared against
  // no window is a perfectly ordinary booking — "get it there by Friday, collect
  // whenever" — and the only thing this route could compare it to instead is
  // `scheduledAt`, which is a different claim about a different moment and not
  // one this check was written to make.
  if (
    deliveryDeadline.value !== null &&
    pickupWindowEnd.value !== null &&
    deliveryDeadline.value.getTime() <= pickupWindowEnd.value.getTime()
  ) {
    return {
      error: t("errors.orders.deliverydeadlineMustBeAfterPickupwindowend"),
    };
  }

  return {
    data: {
      ...quote.data,
      description:
        typeof description === "string" && description.trim().length > 0
          ? description.trim()
          : undefined,
      scheduledAt: scheduledAtDate,
      pickupContact: pickupContact.data,
      dropoffContact: dropoffContact.data,
      serviceLevel:
        (serviceLevel as ServiceLevel | undefined) ?? ServiceLevel.REGULAR,
      bodyType: (bodyType as ChassisType | undefined) ?? null,
      paymentMethodType:
        (paymentMethodType as PaymentMethodType | undefined) ?? null,
      savedCardId: chosenCardId,
      purchaseOrderRef: purchaseOrderRef.value,
      ...cargoEnvelope.value,
      packagingDescription: packagingDescription.value,
      itemQuantity: itemQuantity.value,
      handlingTags: handlingTags.value,
      pickupWindowStart: pickupWindowStart.value,
      pickupWindowEnd: pickupWindowEnd.value,
      deliveryDeadline: deliveryDeadline.value,
    },
  };
}
