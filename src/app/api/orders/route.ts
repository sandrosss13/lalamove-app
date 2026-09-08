import { NextResponse } from "next/server";
import {
  CargoHandlingTag,
  ChassisType,
  ClientAccountType,
  GeorgianCity,
  OrderStatus,
  PaymentMethodType,
  ServiceLevel,
  type Prisma,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import {
  CARGO_MEASUREMENT_BOUNDS,
  type CargoMeasurementBounds,
} from "@/lib/cargo";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import { driverPayoutFor, PLATFORM_COMMISSION_RATE } from "@/lib/orders/payout";
import {
  formatOrderReference,
  ORDER_REFERENCE_SEQUENCE,
} from "@/lib/orders/reference";
import { prisma } from "@/lib/prisma";
import {
  estimateDelivery,
  parseQuoteFields,
  quoteFailureMessage,
  serviceLevelAdjustment,
  type QuoteInput,
} from "@/lib/pricing";

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
 * call site is only that these are sanity bounds — they catch a negative number
 * or a stray extra zero — and that the vehicle-fit comparison, not this check,
 * is what decides whether a load actually suits a vehicle.
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
 * Round a currency amount to whole tetri.
 *
 * A route-local copy of the helper in `POST /api/orders/[id]/pay`, which is
 * module-private there — as is the one in `src/lib/pricing.ts` and the one in
 * `src/lib/orders/payout.ts`. The arithmetic is identical on purpose so every
 * money figure in the codebase lands on the same value.
 *
 * It exists here for one job: pre-rounding `price + serviceLevelAdjustment`
 * before that sum is commissioned into `driverPayout`. See the stamping block in
 * `POST` for why the raw float sum is the wrong basis.
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

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
function resolveGeorgianCity(address: string): GeorgianCity | null {
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
type StopContact = {
  name: string | null;
  phone: string | null;
  details: string | null;
};

/** Validated shape of an order-creation request body. */
type CreateOrderInput = QuoteInput & {
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
  /** Kept only for BUSINESS clients — see the ownership checks in `POST`. */
  purchaseOrderRef: string | null;

  /**
   * The load's physical description and its time constraints.
   *
   * **Weight and the three dimensions are required; everything else in this
   * block is optional.** The line between them is not a matter of taste, and it
   * is not "what the form happens to collect" — it is what the load board's fit
   * filter reads. That filter compares weight and L×W×H against a vehicle's
   * cargo hold and treats an unknown value as *not fitting*, so an order booked
   * without them is invisible to every driver on the board: a silent failure,
   * with no error anywhere and a client wondering why nobody takes their job.
   * Those four are worth failing a request over. Nothing else here is.
   *
   * A packaging note, an item count, a release window and a delivery deadline
   * are context a driver is glad to have and no filter consults. Requiring them
   * would mean refusing to book a real, carryable load over a blank text box —
   * which is precisely the bug this comment replaces. The previous version of
   * this paragraph asserted that "the booking form collects all of these before
   * it submits" and concluded that a body missing one was a broken client. That
   * was simply false: the form presents all five as optional, `canSubmit` does
   * not gate on any of them, and `JSON.stringify` drops the `undefined` keys
   * outright, so a booking with no packaging note reached this parser with the
   * key absent and came back `400 packagingDescription is required`. The form's
   * own submit path was dead. The sentence caused the bug, so it is gone.
   *
   * All nine columns are nullable in `prisma/schema.prisma`. For the five below
   * that nullability is now load-bearing rather than historical: `null` means
   * "the client did not say", which is a truthful thing for a row to record.
   * (The four required ones stay nullable in the schema only so rows predating
   * the load board can hold `null`; nothing this route writes ever does.)
   */
  cargoWeightKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
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
): { value: string | null } | { error: string } {
  if (value === undefined || value === null) {
    return { value: null };
  }

  if (typeof value !== "string") {
    return { error: `${fieldName} must be a string when provided.` };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: null };
  }

  if (trimmed.length > FREE_TEXT_MAX_LENGTH) {
    return {
      error: `${fieldName} must be ${FREE_TEXT_MAX_LENGTH} characters or fewer.`,
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
): { data: StopContact } | { error: string } {
  const empty: StopContact = { name: null, phone: null, details: null };

  if (value === undefined || value === null) {
    return { data: empty };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: `${fieldName} must be a JSON object when provided.` };
  }

  const record = value as Record<string, unknown>;

  const name = parseOptionalText(record.name, `${fieldName}.name`);
  if ("error" in name) {
    return name;
  }

  const phone = parseOptionalText(record.phone, `${fieldName}.phone`);
  if ("error" in phone) {
    return phone;
  }

  const details = parseOptionalText(record.details, `${fieldName}.details`);
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
): { value: number } | { error: string } {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > bounds.max
  ) {
    return {
      error: `${fieldName} must be a number greater than 0 and no more than ${bounds.max} ${bounds.unit}.`,
    };
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
): { value: CargoHandlingTag[] } | { error: string } {
  if (value === undefined || value === null) {
    return { value: [] };
  }

  if (!Array.isArray(value)) {
    return { error: "handlingTags must be an array when provided." };
  }

  const isHandlingTag = (tag: unknown): tag is CargoHandlingTag =>
    typeof tag === "string" &&
    CARGO_HANDLING_TAGS.includes(tag as CargoHandlingTag);

  if (!value.every(isHandlingTag)) {
    return {
      error: `handlingTags must contain only: ${CARGO_HANDLING_TAGS.join(", ")}.`,
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
): { value: Date | null } | { error: string } {
  if (value === undefined || value === null) {
    return { value: null };
  }

  if (typeof value !== "string") {
    return { error: `${fieldName} must be a string when provided.` };
  }

  if (value.trim().length === 0) {
    return { value: null };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: `${fieldName} must be a valid date and time.` };
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
function parseCreateOrderBody(
  body: unknown,
): { data: CreateOrderInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const quote = parseQuoteFields(record);
  if ("error" in quote) {
    return quote;
  }

  const { description, scheduledAt } = record;

  if (description !== undefined && typeof description !== "string") {
    return { error: "description must be a string when provided." };
  }

  if (typeof scheduledAt !== "string" || scheduledAt.trim().length === 0) {
    return { error: "scheduledAt is required." };
  }

  const scheduledAtDate = new Date(scheduledAt);
  if (Number.isNaN(scheduledAtDate.getTime())) {
    return { error: "scheduledAt must be a valid date and time." };
  }

  if (scheduledAtDate.getTime() < Date.now() - SCHEDULED_AT_PAST_GRACE_MS) {
    return { error: "scheduledAt cannot be in the past." };
  }

  const pickupContact = parseStopContact(record.pickupContact, "pickupContact");
  if ("error" in pickupContact) {
    return pickupContact;
  }

  const dropoffContact = parseStopContact(
    record.dropoffContact,
    "dropoffContact",
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
      error: `serviceLevel must be one of: ${SERVICE_LEVELS.join(", ")}.`,
    };
  }

  const { bodyType } = record;
  if (
    bodyType !== undefined &&
    (typeof bodyType !== "string" ||
      !BODY_TYPES.includes(bodyType as ChassisType))
  ) {
    return { error: `bodyType must be one of: ${BODY_TYPES.join(", ")}.` };
  }

  const { paymentMethodType } = record;
  if (
    paymentMethodType !== undefined &&
    (typeof paymentMethodType !== "string" ||
      !PAYMENT_METHOD_TYPES.includes(paymentMethodType as PaymentMethodType))
  ) {
    return {
      error: `paymentMethodType must be one of: ${PAYMENT_METHOD_TYPES.join(", ")}.`,
    };
  }

  const { savedCardId } = record;
  if (
    savedCardId !== undefined &&
    (typeof savedCardId !== "string" || savedCardId.trim().length === 0)
  ) {
    return { error: "savedCardId must be a non-empty string when provided." };
  }

  const chosenCardId =
    typeof savedCardId === "string" ? savedCardId.trim() : null;

  // A card and the method it pays with have to agree. Paying by card without
  // naming one is unbookable, and a card sent alongside cash or a bank transfer
  // means the client changed method without clearing its card — either way, say
  // which of the two to change rather than quietly picking one.
  if (paymentMethodType === PaymentMethodType.CARD && chosenCardId === null) {
    return { error: "Choose a saved card to pay by card." };
  }

  if (paymentMethodType !== PaymentMethodType.CARD && chosenCardId !== null) {
    return { error: "Send savedCardId only when paymentMethodType is CARD." };
  }

  const purchaseOrderRef = parseOptionalText(
    record.purchaseOrderRef,
    "purchaseOrderRef",
  );
  if ("error" in purchaseOrderRef) {
    return purchaseOrderRef;
  }

  // The four required measurements. Required because the load board's fit
  // filter reads them and treats an unknown value as not fitting — see the
  // block comment on `CreateOrderInput` for why that, and only that, justifies
  // refusing a booking.
  const cargoWeightKg = parsePositiveMeasurement(
    record.cargoWeightKg,
    "cargoWeightKg",
    CARGO_MEASUREMENT_BOUNDS.cargoWeightKg,
  );
  if ("error" in cargoWeightKg) {
    return cargoWeightKg;
  }

  const cargoLengthM = parsePositiveMeasurement(
    record.cargoLengthM,
    "cargoLengthM",
    CARGO_MEASUREMENT_BOUNDS.cargoLengthM,
  );
  if ("error" in cargoLengthM) {
    return cargoLengthM;
  }

  const cargoWidthM = parsePositiveMeasurement(
    record.cargoWidthM,
    "cargoWidthM",
    CARGO_MEASUREMENT_BOUNDS.cargoWidthM,
  );
  if ("error" in cargoWidthM) {
    return cargoWidthM;
  }

  const cargoHeightM = parsePositiveMeasurement(
    record.cargoHeightM,
    "cargoHeightM",
    CARGO_MEASUREMENT_BOUNDS.cargoHeightM,
  );
  if ("error" in cargoHeightM) {
    return cargoHeightM;
  }

  // Optional from here down. `parseOptionalText` is the same helper
  // `purchaseOrderRef` above uses, and for the same reason: an unfilled free-text
  // box is a client with nothing to add, not a client with a broken request.
  const packagingDescription = parseOptionalText(
    record.packagingDescription,
    "packagingDescription",
  );
  if ("error" in packagingDescription) {
    return packagingDescription;
  }

  const itemQuantity = parseOptionalText(record.itemQuantity, "itemQuantity");
  if ("error" in itemQuantity) {
    return itemQuantity;
  }

  const handlingTags = parseHandlingTags(record.handlingTags);
  if ("error" in handlingTags) {
    return handlingTags;
  }

  const pickupWindowStart = parseOptionalDate(
    record.pickupWindowStart,
    "pickupWindowStart",
  );
  if ("error" in pickupWindowStart) {
    return pickupWindowStart;
  }

  const pickupWindowEnd = parseOptionalDate(
    record.pickupWindowEnd,
    "pickupWindowEnd",
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
    return { error: "pickupWindowEnd must be after pickupWindowStart." };
  }

  const deliveryDeadline = parseOptionalDate(
    record.deliveryDeadline,
    "deliveryDeadline",
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
    return { error: "deliveryDeadline must be after pickupWindowEnd." };
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
      cargoWeightKg: cargoWeightKg.value,
      cargoLengthM: cargoLengthM.value,
      cargoWidthM: cargoWidthM.value,
      cargoHeightM: cargoHeightM.value,
      packagingDescription: packagingDescription.value,
      itemQuantity: itemQuantity.value,
      handlingTags: handlingTags.value,
      pickupWindowStart: pickupWindowStart.value,
      pickupWindowEnd: pickupWindowEnd.value,
      deliveryDeadline: deliveryDeadline.value,
    },
  };
}

/**
 * POST /api/orders — create a freight order for the signed-in client.
 *
 * Quoting goes through the same `estimateDelivery` the public estimate endpoint
 * uses, so the price booked here is the price that was quoted. The itemised
 * breakdown is persisted alongside the total: the order keeps showing how its
 * price was reached even after the underlying `PricingRule` is retuned.
 *
 * The service-level tier is the same story one step on: the client picks a tier
 * and the fare effect of that tier is derived here from the server's own quote,
 * so no figure the browser computed is ever booked.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseCreateOrderBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const {
    pickupAddress,
    dropoffAddress,
    vehicleTypeCode,
    cargoCategory,
    helperCount,
    description,
    scheduledAt,
    pickupContact,
    dropoffContact,
    serviceLevel,
    bodyType,
    paymentMethodType,
    savedCardId,
    purchaseOrderRef,
    cargoWeightKg,
    cargoLengthM,
    cargoWidthM,
    cargoHeightM,
    packagingDescription,
    itemQuantity,
    handlingTags,
    pickupWindowStart,
    pickupWindowEnd,
    deliveryDeadline,
  } = parsed.data;

  // Everything below is a cheap local query, so all of it runs before
  // `estimateDelivery` spends geocoding lookups on a request that cannot be
  // booked anyway — the same reasoning the quote itself applies to its vehicle
  // and cargo checks.

  // The booking form only offers vehicles that carry the chosen body, but the
  // request can be edited after that filter ran. An unknown `vehicleTypeCode`
  // is deliberately left to the quote, which already has the wording for it.
  if (bodyType !== null) {
    const spec = await prisma.vehicleTypeSpec.findUnique({
      where: { code: vehicleTypeCode },
      select: { bodyTypes: true },
    });

    if (spec && !spec.bodyTypes.includes(bodyType)) {
      return NextResponse.json(
        { error: "That vehicle does not offer the load space you selected." },
        { status: 400 },
      );
    }
  }

  // Admin owns which methods the platform accepts. A method with no config row
  // has never been switched on — the admin endpoints seed new rows disabled and
  // treat turning one on as a deliberate act — so a missing row is a disabled
  // one, and both are refused here.
  if (paymentMethodType !== null) {
    const paymentMethodConfig = await prisma.paymentMethodConfig.findUnique({
      where: { type: paymentMethodType },
      select: { isEnabled: true },
    });

    if (!paymentMethodConfig?.isEnabled) {
      return NextResponse.json(
        { error: "That payment method is not available." },
        { status: 400 },
      );
    }
  }

  // A card belonging to somebody else is not a card this client may book
  // against; scoping the lookup to the session makes "not yours" and "does not
  // exist" the same answer, which is the one worth giving either way.
  if (savedCardId !== null) {
    const savedCard = await prisma.savedCard.findFirst({
      where: { id: savedCardId, clientId: session.user.id },
      select: { id: true },
    });

    if (!savedCard) {
      return NextResponse.json(
        { error: "Choose a card saved to your own payment methods." },
        { status: 400 },
      );
    }
  }

  // The PO / cost-centre reference is a BUSINESS-only field: an Individual
  // client's booking form never renders it, so a value arriving from one is a
  // stale client rather than an attack. Drop it instead of failing the booking.
  let businessPurchaseOrderRef: string | null = null;
  if (purchaseOrderRef !== null) {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: session.user.id },
      select: { accountType: true },
    });

    if (clientProfile?.accountType === ClientAccountType.BUSINESS) {
      businessPurchaseOrderRef = purchaseOrderRef;
    }
  }

  const result = await estimateDelivery(parsed.data);

  if (!result.ok) {
    // An address the geocoder cannot place is well-formed input the server
    // could not act on (422); an unknown vehicle type or an ineligible
    // cargo/vehicle pairing is bad input (400).
    const status = result.reason === "unresolved_address" ? 422 : 400;
    return NextResponse.json(
      { error: quoteFailureMessage(result) },
      { status },
    );
  }

  const { pickup, dropoff, distanceKm, vehicleTypeSpecId, breakdown } =
    result.estimate;

  // Derived from the server's own quote, never from a figure the browser sent:
  // the client chooses a tier, not a price. Stored beside `price` rather than
  // folded into it, so the itemised breakdown still reconciles against its own
  // total and the minimum-fare floor keeps meaning what it says.
  const adjustment = serviceLevelAdjustment(serviceLevel, breakdown.price);

  // The platform's cut and the driver's resulting share of the amount this
  // client is actually billed. `Order.driverPayout` is the ONLY money figure a
  // driver may ever be shown, and this is the single place it is computed — get
  // it wrong here and it is wrong for the lifetime of the order, because every
  // read path displays the stored column rather than recomputing.
  //
  // Two traps, both deliberate:
  //
  // 1. **The basis is `price + serviceLevelAdjustment`, not `price`.** The tier
  //    adjustment is itemised in its own column rather than folded into `price`
  //    (see the comment above), and `POST /api/orders/[id]/pay` charges the
  //    client the sum of the two. Commissioning `price` alone would hand the
  //    platform the whole Priority uplift: a GEL 100 fare at PRIORITY bills 125,
  //    so a price-only payout leaves the driver 85 against a 40 platform take —
  //    32%, not 15%. On the sum the driver gets 106.25 and the platform 18.75.
  // 2. **The basis is rounded before it is commissioned.** `roundCurrency` here
  //    is the same arithmetic `POST /api/orders/[id]/pay` applies before
  //    billing, so the driver's 85% is 85% of the figure actually charged. Both
  //    columns are individually clean to two decimals, so their exact decimal
  //    sum is too — but 85% of a whole number of tetri lands on an exact
  //    half-tetri every 20 tetri, and at those tie-breaks the IEEE-754 dust in
  //    the float addition decides which way `Math.round` falls. The two
  //    orderings disagree by a tetri on thousands of ordinary amounts (a `price`
  //    of 0.83 with a 0.07 uplift pays 0.76 unrounded and 0.77 rounded), and the
  //    rounded form is the correct one because it matches the transaction.
  //    task-01's migration backfilled `driverPayout` the same way in SQL.
  //
  // The rate is named explicitly rather than left to the column's `@default`:
  // the schema is explicit that the default is a safety net for writes that
  // forget a rate, not something this route may lean on. Stamping it also means
  // retuning `PLATFORM_COMMISSION_RATE` can never rewrite what a historical job
  // promised a driver.
  const commissionRate = PLATFORM_COMMISSION_RATE;
  const driverPayout = driverPayoutFor(
    roundCurrency(breakdown.price + adjustment),
    commissionRate,
  );

  // Created `INITIATED` — off-market and unpaid — rather than letting the column
  // default supply a status. An order's opening state is a decision this path
  // makes, not one it inherits: nothing between here and settlement should be
  // able to put an unpaid job in front of a driver, and a status named at the
  // point of creation is a status a reader of this handler can see.
  //
  // The transaction changes only how the row acquires its human-readable
  // reference, not when the order becomes visible to anyone: settlement is still
  // `POST /api/orders/[id]/pay`'s job alone.
  const created = await prisma.$transaction(async (tx) => {
    // Drawn inside the same transaction as the insert it feeds, rather than
    // before the transaction opens: if the insert fails for any reason the whole
    // thing rolls back and this draw is never attached to a row, so nothing
    // anywhere observes it.
    //
    // `nextval` itself cannot be rolled back — Postgres sequences are
    // deliberately non-transactional — so a rolled-back insert still leaves a
    // gap in the numbering. That is fine: nothing depends on the sequence being
    // contiguous, and it starts at 48200 precisely so the numbers are not read
    // as a volume count. What must never happen is *reuse*, two orders sharing a
    // reference, and `nextval` never returning the same value twice is exactly
    // what rules that out.
    //
    // Passing the drawn value explicitly also means the create response carries
    // the reference without a second round-trip to read back what the column's
    // database default would otherwise have generated — and because the column
    // is named in the INSERT, that default never fires, so one order consumes
    // exactly one sequence value.
    const [drawn] = await tx.$queryRaw<{ value: bigint }[]>`
      SELECT nextval(${ORDER_REFERENCE_SEQUENCE}::regclass) AS value
    `;

    // `nextval` always returns exactly one row, so this cannot be reached; the
    // guard exists because `noUncheckedIndexedAccess` types the destructured
    // element as possibly undefined, and a thrown error rolls the transaction
    // back rather than writing an order with a bogus reference.
    if (!drawn) {
      throw new Error("Failed to draw an order reference from the sequence.");
    }

    const reference = formatOrderReference(Number(drawn.value));

    return tx.order.create({
      data: {
        status: OrderStatus.INITIATED,
        reference,
        cargoCategory,
        bodyType,
        helperCount,
        description,
        scheduledAt,
        pickupAddress,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        // Resolved from the address the geocode lookup produced, never from a
        // city the request body named — see `resolveGeorgianCity`.
        pickupCity: resolveGeorgianCity(pickupAddress),
        pickupContactName: pickupContact.name,
        pickupContactPhone: pickupContact.phone,
        pickupContactDetails: pickupContact.details,
        dropoffAddress,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        dropoffCity: resolveGeorgianCity(dropoffAddress),
        dropoffContactName: dropoffContact.name,
        dropoffContactPhone: dropoffContact.phone,
        dropoffContactDetails: dropoffContact.details,
        distanceKm,
        vehicleTypeSpecId,
        baseFare: breakdown.baseFare,
        distanceFare: breakdown.distanceFare,
        timeFare: breakdown.timeFare,
        helperFee: breakdown.helperFee,
        price: breakdown.price,
        serviceLevel,
        serviceLevelAdjustment: adjustment,
        commissionRate,
        driverPayout,
        paymentMethodType,
        savedCardId,
        purchaseOrderRef: businessPurchaseOrderRef,
        cargoWeightKg,
        cargoLengthM,
        cargoWidthM,
        cargoHeightM,
        packagingDescription,
        itemQuantity,
        handlingTags,
        pickupWindowStart,
        pickupWindowEnd,
        deliveryDeadline,
        clientId: session.user.id,
      },
    });
  });

  // Deliberately *not* settled here, and that is the whole shape of the booking
  // flow: settlement belongs to checkout. `POST /api/orders/[id]/pay` is the one
  // caller of `settleOrderPayment`, and that transition — `INITIATED` →
  // `PENDING` — is what puts the job in front of drivers.
  //
  // So the window between booking and payment is an intended state rather than a
  // race to be closed: the browser sends the client on to `/checkout/[id]` with
  // the id off this response, and an order whose client never finishes there
  // simply stays off the market. That is the failure direction worth having —
  // nobody is dispatched to an unpaid job.
  //
  // Both open-market queries filter `status: PENDING` by equality (`GET` below,
  // and `src/app/api/logistics-company/orders/route.ts`), so an `INITIATED`
  // order is invisible to every driver and company *by construction*, not by a
  // rule someone has to remember. Do not relax either into a `not`/`notIn`
  // filter: that would start listing unpaid work the moment a new status is
  // added.
  return NextResponse.json(created, { status: 201 });
}

/**
 * The columns `GET` reads back, and the only ones it may return.
 *
 * The *absence* of a select is what made this endpoint leak: a `findMany`
 * carrying only a `where` returns every column of `Order`, so each column added
 * to the model silently joined the response — which is how a client's stop
 * contacts ended up in the open, unassigned jobs any activated driver can list.
 * Naming the fields means a column added later cannot start leaking through
 * this response by accident; anything new belongs here deliberately or not at
 * all.
 *
 * `savedCardId` and `purchaseOrderRef` are deliberately absent and must stay
 * absent: one is the client's chosen payment instrument, the other their
 * finance team's internal reference, and no consumer of this endpoint has any
 * business with either. The six stop-contact columns *are* selected, because
 * the two parties to a job do need them, and are then withheld per row — see
 * `canSeeStopContacts`.
 *
 * Relations are not selected because the handler never included any; this list
 * is the scalar row and nothing more.
 */
const ORDER_LIST_SELECT = {
  id: true,
  cargoCategory: true,
  description: true,
  bodyType: true,
  helperCount: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  distanceKm: true,
  baseFare: true,
  distanceFare: true,
  timeFare: true,
  helperFee: true,
  overtimeFee: true,
  price: true,
  serviceLevel: true,
  serviceLevelAdjustment: true,
  vehicleTypeSpecId: true,
  status: true,
  clientId: true,
  companyId: true,
  driverId: true,
  vehicleId: true,
  paymentMethodType: true,
  inTransitAt: true,
  completedAt: true,
  waitingMinutes: true,
  createdAt: true,
  updatedAt: true,
  reference: true,
  cargoWeightKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
  packagingDescription: true,
  itemQuantity: true,
  handlingTags: true,
  pickupWindowStart: true,
  pickupWindowEnd: true,
  deliveryDeadline: true,
  driverPayout: true,
  // `commissionRate` deliberately excluded, and must stay excluded: it is an
  // internal figure with no consumer on any surface this endpoint feeds — only
  // the resolved payout is anyone's business — matching how `savedCardId` and
  // `purchaseOrderRef` are withheld above.
  //
  // `driverPayout` is added rather than substituted: this endpoint still returns
  // `price` to a driver browsing open `PENDING` work, exactly as it did before.
  // That is pre-existing behaviour, not something introduced here — the load
  // board's own endpoint is where "a driver only ever sees `driverPayout`" is
  // enforced. Adding the column gives a driver-facing consumer the correct
  // figure to prefer; removing the incorrect one is a separate change.
} as const;

/**
 * Whether the requester may see one order's stop contacts.
 *
 * A stop contact is a named person and their phone number, collected so that
 * whoever turns up knows who to ask for. Exactly two parties need that: the
 * driver the job is assigned to, and the client who booked it. A driver
 * browsing the open, unassigned PENDING work this endpoint also lists has
 * accepted nothing and is entitled to nothing beyond where the job goes and
 * what it pays — the contacts become theirs when the job does.
 */
function canSeeStopContacts(
  order: { clientId: string; driverId: string | null },
  userId: string,
): boolean {
  return order.clientId === userId || order.driverId === userId;
}

/**
 * GET /api/orders — list orders relevant to the signed-in user.
 *
 * Clients see their own orders. Drivers see open (unassigned, PENDING) orders
 * they could actually take — i.e. asking for a vehicle type they have
 * registered — plus deliveries already assigned to them, which are not
 * type-filtered because that match was made when the order was accepted. A
 * driver with no registered vehicle — or one whose account is not yet activated
 * — has nothing to take, so they only ever see their own deliveries. Newest
 * first.
 *
 * The filter mirrors the driver-facing `/orders` page, so the API can't hand
 * back jobs the UI deliberately hides.
 *
 * Every row is trimmed to `ORDER_LIST_SELECT`, and the stop contacts within it
 * are returned as `null` on any row the requester is not a party to, so an open
 * job in a driver's listing never carries the client's name and phone number.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: userId, role } = session.user;

  let where: Prisma.OrderWhereInput = { clientId: userId };

  if (role === "DRIVER") {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId },
      select: {
        activatedAt: true,
        vehicles: { select: { vehicleTypeSpecId: true } },
      },
    });

    const registeredVehicleTypeSpecIds = [
      ...new Set(
        (driverProfile?.vehicles ?? []).map(
          (vehicle) => vehicle.vehicleTypeSpecId,
        ),
      ),
    ];

    where = {
      OR: [
        // A non-activated driver has nothing open to take — same reasoning as
        // the existing "no registered vehicle → nothing to take" case, extended
        // to cover "not yet approved" too. Deliveries already assigned to them
        // stay visible either way.
        ...(driverProfile?.activatedAt
          ? [
              {
                status: OrderStatus.PENDING,
                driverId: null,
                vehicleTypeSpecId: { in: registeredVehicleTypeSpecIds },
              },
            ]
          : []),
        { driverId: userId },
      ],
    };
  }

  const orders = await prisma.order.findMany({
    where,
    select: ORDER_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });

  // Redacted here rather than in the query because the entitlement is per row,
  // not per request: a driver's listing mixes deliveries assigned to them, whose
  // contacts they need, with open work they have not accepted, whose contacts
  // they must not have. Expressing that in the `where` would mean two queries
  // and a merge to restore the ordering, for a result this mapping gives exactly.
  const visibleOrders = orders.map((order) =>
    canSeeStopContacts(order, userId)
      ? order
      : {
          ...order,
          pickupContactName: null,
          pickupContactPhone: null,
          pickupContactDetails: null,
          dropoffContactName: null,
          dropoffContactPhone: null,
          dropoffContactDetails: null,
        },
  );

  return NextResponse.json(visibleOrders, { status: 200 });
}
