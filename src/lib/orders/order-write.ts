/**
 * The database-bound half of writing an order's details: everything between a
 * parsed booking body and the columns that go on the row.
 *
 * `POST /api/orders` creates an order from these columns and
 * `PATCH /api/orders/[id]` overwrites an unpaid order with them. Both used to be
 * one handler's inline code — this module is that code moved, check for check
 * and message for message, so a booking is refused for exactly the reasons and
 * in exactly the order it always was, and an edit is refused for the same ones.
 * The reasoning for keeping one copy is the one `src/lib/orders/order-input.ts`
 * gives for the parser: an edit is a re-booking, and a second rulebook would
 * drift from the first the moment either was touched.
 *
 * What it does, in order — the cheap local reads first, so an unbookable
 * request never spends geocoding lookups (see the comment at the top of
 * `prepareOrderWrite`):
 *
 * 1. the requested body type against the vehicle class;
 * 2. the declared load against the class's capacity;
 * 3. whether anybody on the platform could serve the class at all;
 * 4. the payment method against admin's switchboard, the card against the
 *    caller's wallet, the PO reference against the caller's account type;
 * 5. the quote itself (pricing model v1 — `src/lib/pricing-engine.ts`), the
 *    tariff-version check (409 when the client was quoted at a stale tariff),
 *    and the tier adjustment, commission and driver payout derived from it.
 *
 * Goods-first booking adds a step 0: when the body listed `items`, the goods
 * are resolved against the active catalogue and planned, and the plan's
 * weight, envelope, cargo category and (for individuals) body overwrite what
 * the client sent before any of the checks above read them — see
 * `deriveItemsLoad`. A body with no `items` skips it entirely and is checked
 * exactly as before.
 *
 * What it does **not** do is write. The caller owns the write because the two
 * writes differ in what makes them safe: a create draws a reference inside a
 * transaction, while an edit is a conditional update keyed on the order still
 * being unpaid.
 *
 * `server-only`: it reads Prisma and the geocoder, and nothing in a browser
 * bundle may reach either.
 */

import "server-only";

import { ClientAccountType, PaymentMethodType } from "@prisma/client";

import {
  getRequestLocale,
  type RequestTranslator,
} from "@/i18n/request-locale";
import {
  cargoFitMessage,
  oversizeAxes,
  specCapability,
} from "@/lib/orders/booking-fit";
import {
  serviceableSpecIds,
  unserviceableClassMessage,
} from "@/lib/orders/class-serviceability";
import { planLoad } from "@/lib/orders/load-plan";
import {
  FREE_TEXT_MAX_LENGTH,
  resolveGeorgianCity,
  type CreateOrderInput,
} from "@/lib/orders/order-input";
import {
  decideItemsBooking,
  describeLoad,
  itemsError,
  parseOrderItems,
  resolveOrderItems,
  type ResolvedOrderItem,
} from "@/lib/orders/parse-items";
import { quotedOrderPayout } from "@/lib/orders/payout";
import { prisma } from "@/lib/prisma";
import {
  estimateDelivery,
  quoteFailureMessage,
  quoteFailureStatus,
  serviceLevelAdjustment,
} from "@/lib/pricing";
import { vehicleTypeSpecLabel } from "@/lib/vehicle-type-spec-labels";

/**
 * The order columns a booking body determines — the booked details and every
 * figure priced from them.
 *
 * Deliberately *not* included: `status`, `reference` and `clientId`, which are
 * the create path's to decide and never change on an edit; and the three
 * payment columns, which are in `PreparedOrderWrite.payment` instead so each
 * caller decides whether to write them (see that field).
 *
 * `description` stays `string | undefined`, exactly as the parser produces it,
 * so the create path writes what it always wrote. An edit must turn `undefined`
 * into an explicit `null` — to Prisma an `undefined` in an update means "leave
 * the column alone", which would make a cleared description impossible to save.
 */
export type OrderDetailColumns = {
  cargoCategory: CreateOrderInput["cargoCategory"];
  bodyType: CreateOrderInput["bodyType"];
  helperCount: CreateOrderInput["helperCount"];
  description: CreateOrderInput["description"];
  scheduledAt: Date;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  pickupCity: ReturnType<typeof resolveGeorgianCity>;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupContactDetails: string | null;
  pickupBuildingName: string | null;
  pickupEntrance: string | null;
  pickupComment: string | null;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffCity: ReturnType<typeof resolveGeorgianCity>;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  dropoffContactDetails: string | null;
  dropoffBuildingName: string | null;
  dropoffEntrance: string | null;
  dropoffComment: string | null;
  distanceKm: number;
  vehicleTypeSpecId: string;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  helperFee: number;
  price: number;
  serviceLevel: CreateOrderInput["serviceLevel"];
  serviceLevelAdjustment: number;
  commissionRate: number;
  driverPayout: number;
  /** Pricing model v1 columns — see the `Order` model. */
  tripType: "CITY" | "INTERCITY";
  returnAllowance: number;
  returnFare: number;
  transportFare: number;
  pickupHelperFee: number;
  dropoffHelperFee: number;
  helperPayout: number;
  pickupHelpers: number;
  pickupFloor: number;
  pickupCargoElevator: boolean;
  pickupPassengerElevator: boolean;
  dropoffHelpers: number;
  dropoffFloor: number;
  dropoffCargoElevator: boolean;
  dropoffPassengerElevator: boolean;
  tariffVersion: number;
  quotedAt: Date;
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  /**
   * Goods-first booking: the summed volume of the listed goods, unpacked, in
   * m³. `null` on the legacy path (no `items`), which is also what an edit
   * writes when it re-books an order without items — an edit is a full
   * replacement, so a stale volume must not outlive the items it described.
   */
  cargoVolumeM3: number | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  handlingTags: CreateOrderInput["handlingTags"];
  pickupWindowStart: Date | null;
  pickupWindowEnd: Date | null;
  deliveryDeadline: Date | null;
};

/** One `OrderItem` row to write, minus its `orderId`. */
export type OrderItemSnapshot = ResolvedOrderItem["snapshot"];

/** A booking body that passed every check, turned into the columns it writes. */
export type PreparedOrderWrite = {
  details: OrderDetailColumns;
  /**
   * Goods-first booking: the `OrderItem` rows to write with the order, one per
   * listed line, snapshotting label, unit weight and dimensions. `null` on the
   * legacy path. The caller writes them in the same transaction as the order
   * (a create nests them; an edit replaces the order's existing rows).
   */
  items: OrderItemSnapshot[] | null;
  /**
   * The payment choice the body carried, already checked — the method against
   * `PaymentMethodConfig`, the card against the caller's own wallet, and the PO
   * reference reduced to `null` for anyone who is not a BUSINESS client.
   *
   * Split out from `details` because only the create path writes it. The
   * booking form sends no payment fields at all (they are checkout's to send),
   * and an edit is only ever allowed on an order checkout has not touched yet,
   * so there is nothing for an edit to write here — but the body is still
   * validated in full, so an edit refuses exactly the bodies a booking refuses.
   */
  payment: {
    paymentMethodType: CreateOrderInput["paymentMethodType"];
    savedCardId: string | null;
    purchaseOrderRef: string | null;
  };
};

/**
 * Either the columns to write, or the response the caller should send instead:
 * `400` for input this booking cannot have, `422` for an address the geocoder
 * could not place — the same split `POST /api/orders` has always made.
 */
export type PrepareOrderWriteResult =
  | { ok: true; write: PreparedOrderWrite }
  | {
      ok: false;
      status: 400 | 409 | 422;
      error: string;
      /**
       * Machine-readable cause, for the two refusals the booking form handles
       * on their own: `manual_quote_required` (no price; contact support) and
       * `tariff_changed` (re-quote and show the new price). Absent otherwise.
       */
      reason?: "manual_quote_required" | "tariff_changed";
    };

/** What the items path adds to a booking. */
type DerivedLoad = {
  /** The parsed body with the derived figures, category and body written in. */
  input: CreateOrderInput;
  cargoVolumeM3: number;
  itemSnapshots: OrderItemSnapshot[];
};

/**
 * The items path: resolve the listed goods, plan the load and write what the
 * plan says over everything the client was not trusted to state.
 *
 * Every figure comes from `src/lib/orders/load-plan.ts` through
 * `src/lib/orders/parse-items.ts`; nothing about fit, category or body is
 * restated here. What this adds is the two reads the pure modules cannot make
 * — the active catalogue rows and the client's account type — and the
 * overwrite itself:
 *
 * - `cargoWeightKg` and the three dimensions become the plan's total weight
 *   and largest-item envelope, so the existing `oversizeAxes` guard in
 *   `prepareOrderWrite`, unchanged, is the hard fit check on the goods actually
 *   listed. No soft-fit refusal is added (requirements §Assumptions).
 * - `cargoCategory` becomes the plan's. The shared `parseQuoteFields` still
 *   requires the client to send one — that parser also serves the public
 *   estimate and is not loosened — but it is overwritten here before the quote
 *   or any check reads it, so `cargo_vehicle_mismatch` judges the goods.
 * - `bodyType` becomes the body `decideItemsBooking` settles on, so the
 *   existing body check and `serviceableSpecIds(bodyType)` judge it.
 * - `itemQuantity` (items mode) or `packagingDescription` (pallets mode) gets
 *   the server-built summary; the other stays as typed. See `describeLoad`.
 *
 * `handlingTags` stay client-supplied: they are the client's own statement,
 * and the form pre-fills them from the items.
 *
 * Runs before the spec lookup, so every refusal here costs at most two
 * indexed reads and never a geocoding lookup.
 */
async function deriveItemsLoad(
  rawItems: unknown,
  data: CreateOrderInput,
  clientId: string | null,
  t: RequestTranslator,
): Promise<{ value: DerivedLoad } | { error: string }> {
  const items = parseOrderItems(rawItems, t);
  if ("error" in items) {
    return items;
  }

  const codes = [
    ...new Set(
      items.value.flatMap((item) =>
        item.kind === "CATALOGUE" ? [item.code] : [],
      ),
    ),
  ];

  const [catalogue, clientProfile, locale] = await Promise.all([
    codes.length > 0
      ? prisma.itemCatalogEntry.findMany({
          where: { code: { in: codes }, active: true },
          select: {
            id: true,
            code: true,
            labelEn: true,
            labelKa: true,
            weightKg: true,
            lengthM: true,
            widthM: true,
            heightM: true,
            stackable: true,
            needsTwoPeople: true,
            requiredBody: true,
            handlingTags: true,
            cargoCategory: true,
          },
        })
      : Promise.resolve([]),
    // A guest (`null`) has no profile and is planned as an individual —
    // `decideItemsBooking` reads a missing account type that way.
    clientId === null
      ? Promise.resolve(null)
      : prisma.clientProfile.findUnique({
          where: { userId: clientId },
          select: { accountType: true },
        }),
    getRequestLocale(),
  ]);

  const resolved = resolveOrderItems(items.value, catalogue, locale, t);
  if ("error" in resolved) {
    return resolved;
  }

  const plan = planLoad(resolved.value.map(({ load }) => load));
  // Unreachable: `parseOrderItems` refuses an empty list, and a non-empty plan
  // always has every envelope axis. Guarded because `planLoad` types an empty
  // plan as `null` and the envelope as the nullable `LoadDimensions`, and an
  // order booked without its figures would be invisible on the load board.
  if (plan === null) {
    return { error: itemsError(t, "itemsEmpty") };
  }
  const { lengthM, widthM, heightM } = plan.envelope;
  if (lengthM === null || widthM === null || heightM === null) {
    return { error: itemsError(t, "itemsEmpty") };
  }

  const body = decideItemsBooking({
    resolved: resolved.value,
    plan,
    accountType: clientProfile?.accountType ?? null,
    requestedBody: data.bodyType,
    t,
  });
  if ("error" in body) {
    return body;
  }

  const description = describeLoad(
    resolved.value,
    {
      packagingDescription: data.packagingDescription,
      itemQuantity: data.itemQuantity,
    },
    FREE_TEXT_MAX_LENGTH,
  );

  return {
    value: {
      input: {
        ...data,
        cargoCategory: plan.cargoCategory,
        bodyType: body.value,
        cargoWeightKg: plan.totalWeightKg,
        cargoLengthM: lengthM,
        cargoWidthM: widthM,
        cargoHeightM: heightM,
        packagingDescription: description.packagingDescription,
        itemQuantity: description.itemQuantity,
      },
      cargoVolumeM3: plan.itemVolumeM3,
      itemSnapshots: resolved.value.map(({ snapshot }) => snapshot),
    },
  };
}

/**
 * Check a parsed booking body against the catalogue, the fleet, the payment
 * switchboard and the caller's own account, then price it.
 *
 * `clientId` is the signed-in client the order belongs to — the session user on
 * both callers. It scopes the saved-card lookup and decides the account type
 * the PO reference is kept for.
 *
 * `null` is a **guest** booking (`POST /api/orders` with no session). A guest
 * is held to INDIVIDUAL rules: there is no wallet, so a `savedCardId` is
 * refused exactly as somebody else's card would be; there is no business
 * account, so a PO reference is dropped the way an individual's is; and the
 * "pay later" option (`CASH`) does not exist for individuals, so naming it is
 * refused like a method admin has switched off.
 *
 * Quoting goes through the same `estimateDelivery` the public estimate endpoint
 * uses, so the price booked here is the price that was quoted. The itemised
 * breakdown is returned alongside the total: the order keeps showing how its
 * price was reached even after the underlying `PricingRule` is retuned.
 *
 * The service-level tier is the same story one step on: the client picks a tier
 * and the fare effect of that tier is derived here from the server's own quote,
 * so no figure the browser computed is ever booked.
 *
 * `rawItems` is the body's unvalidated `items` list (`ParsedBooking.rawItems`
 * from `parseBookingBody`), or `null` for a body without one. When present, the
 * goods are planned first and the plan's figures replace the parsed ones for
 * every check below — see `deriveItemsLoad`.
 */
export async function prepareOrderWrite(
  parsedInput: CreateOrderInput,
  clientId: string | null,
  t: RequestTranslator,
  rawItems: unknown = null,
): Promise<PrepareOrderWriteResult> {
  // Goods-first booking. LEGACY(goods-first): a body with no `items` takes the
  // path below with every value it sent — `input` is `parsedInput` itself and
  // `derivedLoad` stays `null`, so nothing downstream reads anything new.
  let input = parsedInput;
  let derivedLoad: DerivedLoad | null = null;
  if (rawItems !== null) {
    const derived = await deriveItemsLoad(rawItems, parsedInput, clientId, t);
    if ("error" in derived) {
      return { ok: false, status: 400, error: derived.error };
    }
    derivedLoad = derived.value;
    input = derivedLoad.input;
  }

  const {
    pickupAddress,
    dropoffAddress,
    vehicleTypeCode,
    cargoCategory,
    helperCount,
    pickupHelp,
    dropoffHelp,
    tariffVersion: quotedTariffVersion,
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
  } = input;

  // Everything below is a cheap local query, so all of it runs before
  // `estimateDelivery` spends geocoding lookups on a request that cannot be
  // booked anyway — the same reasoning the quote itself applies to its vehicle
  // and cargo checks.

  // Looked up unconditionally, and for its capacity columns as well as its body
  // list: the fit guard below needs this row for every booking, not only for one
  // that names a body type. An unknown `vehicleTypeCode` is still deliberately
  // left to the quote, which already has the wording for it — hence `spec &&`
  // on both checks rather than an early 400 here.
  const spec = await prisma.vehicleTypeSpec.findUnique({
    where: { code: vehicleTypeCode },
    select: {
      // Read only to look this class up in the serviceable set, which is keyed
      // by the id `Order.vehicleTypeSpecId` carries. Nothing here returns it —
      // the order's own `vehicleTypeSpecId` comes from the quote.
      id: true,
      label: true,
      bodyTypes: true,
      maxPayloadKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
    },
  });

  // The booking form only offers vehicles that carry the chosen body, but the
  // request can be edited after that filter ran.
  if (bodyType !== null && spec && !spec.bodyTypes.includes(bodyType)) {
    return {
      ok: false,
      status: 400,
      error: t("errors.orders.thatVehicleDoesNotOfferThe"),
    };
  }

  // Does the declared load actually fit the class being booked? Nothing used to
  // ask: an order was created declaring 15 m of length against a Box Truck
  // (4.5 m), priced and paid at ₾101.67, and then hidden from every carrier by
  // `GET /api/loads`, which filters the board by fit. The client was billed for
  // a job no driver could ever see, let alone claim.
  //
  // Measured against the `VehicleTypeSpec` rather than any `Vehicle`, because at
  // booking time no vehicle has been assigned and none can be — see
  // `src/lib/orders/booking-fit.ts` for why the class figure is the right
  // authority here, and why `specCapability` must not be inlined (it carries the
  // open-bed height sentinel that keeps flatbed bookings working).
  //
  // Placed here, before `estimateDelivery`, deliberately: this is a comparison
  // of numbers already in hand against a row already fetched, so an unbookable
  // load is refused without spending geocoding lookups on it — the convention
  // stated at the top of this block.
  //
  // `oversizeAxes(...).length > 0` rather than `!loadFits(...)`: `loadFits`
  // folds an undeclared axis into `false`, which is right for a driver about to
  // commit a truck and wrong here, where it would refuse a client's booking with
  // a claim that cargo nobody measured is over capacity.
  if (spec) {
    const capability = specCapability(spec);
    const axes = oversizeAxes(
      {
        weightKg: cargoWeightKg,
        lengthM: cargoLengthM,
        widthM: cargoWidthM,
        heightM: cargoHeightM,
      },
      capability,
    );

    if (axes.length > 0) {
      return {
        ok: false,
        status: 400,
        error: cargoFitMessage(
          // Localized by code exactly as the booking form does, so the two
          // copies of this sentence stay identical.
          vehicleTypeSpecLabel(vehicleTypeCode, spec.label, t),
          axes,
          capability,
          {
            t,
            locale: await getRequestLocale(),
          },
        ),
      };
    }
  }

  // Is there anybody who could take this at all? The third instance of one
  // failure: an order created, priced, shown to its client as live, and then
  // invisible to every carrier on the platform. The first two were about the
  // load (cargo too big for its class; a class matched by identity rather than
  // by capability); this one is about supply. Four of the eleven seeded classes
  // — Flatbed, Curtainsider, Large Freight and Trailer — have no activated
  // carrier able to serve them even under upgrade substitution, so every
  // booking against one of them strands however well-declared its cargo is.
  //
  // Answered by the same two predicates `GET /api/loads` filters the board with
  // and the claim routes enforce at commit, applied to the whole activated
  // fleet — so "serviceable" means precisely "this load could appear on
  // somebody's board". See `src/lib/orders/class-serviceability.ts` for the
  // fleet scan, the empty-platform case and the known limitations (no city
  // scoping).
  //
  // Scoped to the booking's own `bodyType`, which is what makes this match the
  // board rather than approximate it: the board offers a load only to vehicles
  // whose class carries the load space the client asked for, so a class nobody
  // operates *with that body* strands exactly as surely as one nobody operates
  // at all. `GET /api/vehicle-types` flags the weaker, body-agnostic version of
  // this for the picker, which is why this check can refuse a class the form
  // showed as available — the server being the stricter of the two is the safe
  // direction, the same asymmetry the cargo check already runs.
  //
  // Placed here, before `estimateDelivery`, deliberately: two indexed local
  // reads that refuse an unbookable order without spending geocoding lookups on
  // it — the convention stated at the top of this block, and the same slot the
  // cargo-fit guard above occupies. It runs after that guard because a cargo
  // problem is the client's own edit to make, while this one takes the class off
  // the table entirely; naming the fixable problem first is the more useful
  // order for whoever reads the message.
  if (spec) {
    const serviceable = await serviceableSpecIds(bodyType);

    if (!serviceable.has(spec.id)) {
      return {
        ok: false,
        status: 400,
        error: unserviceableClassMessage(spec.label),
      };
    }
  }

  // Admin owns which methods the platform accepts. A method with no config row
  // has never been switched on — the admin endpoints seed new rows disabled and
  // treat turning one on as a deliberate act — so a missing row is a disabled
  // one, and both are refused here.
  // A guest is an individual, and individuals have no "pay later". Refused
  // with the switched-off wording rather than a bespoke one: from where the
  // guest stands the method simply is not available. (Signed-in INDIVIDUAL
  // clients are held to the same rule at checkout, where the method is
  // actually chosen — `POST /api/orders/[id]/pay`. The booking form sends no
  // method at all.)
  if (clientId === null && paymentMethodType === PaymentMethodType.CASH) {
    return {
      ok: false,
      status: 400,
      error: t("common.shared.thatPaymentMethodIsNotAvailable"),
    };
  }

  if (paymentMethodType !== null) {
    const paymentMethodConfig = await prisma.paymentMethodConfig.findUnique({
      where: { type: paymentMethodType },
      select: { isEnabled: true },
    });

    if (!paymentMethodConfig?.isEnabled) {
      return {
        ok: false,
        status: 400,
        error: t("common.shared.thatPaymentMethodIsNotAvailable"),
      };
    }
  }

  // A card belonging to somebody else is not a card this client may book
  // against; scoping the lookup to the session makes "not yours" and "does not
  // exist" the same answer, which is the one worth giving either way.
  //
  // A guest has no wallet at all, so any card id from one is answered the same
  // way without a query.
  if (savedCardId !== null) {
    const savedCard =
      clientId === null
        ? null
        : await prisma.savedCard.findFirst({
            where: { id: savedCardId, clientId },
            select: { id: true },
          });

    if (!savedCard) {
      return {
        ok: false,
        status: 400,
        error: t("common.shared.chooseACardSavedToYour"),
      };
    }
  }

  // The PO / cost-centre reference is a BUSINESS-only field: an Individual
  // client's booking form never renders it, so a value arriving from one is a
  // stale client rather than an attack. Drop it instead of failing the booking.
  //
  // The stop comment is the reverse: the BUSINESS Contact Info dialog has no
  // comment field (an Individual's has), so a comment from a business client
  // is equally stale and is dropped the same way.
  let businessPurchaseOrderRef: string | null = null;
  let pickupComment = pickupContact.comment;
  let dropoffComment = dropoffContact.comment;
  // A guest has no account type and is treated as an individual.
  if (
    clientId !== null &&
    (purchaseOrderRef !== null ||
      pickupComment !== null ||
      dropoffComment !== null)
  ) {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: clientId },
      select: { accountType: true },
    });

    if (clientProfile?.accountType === ClientAccountType.BUSINESS) {
      businessPurchaseOrderRef = purchaseOrderRef;
      pickupComment = null;
      dropoffComment = null;
    }
  }

  // Always recomputed here, never trusted from the browser.
  const result = await estimateDelivery(input);

  if (!result.ok) {
    // 422: an address the geocoder cannot place, or a route over the manual
    // quote threshold; 400: an unknown vehicle type, an ineligible
    // cargo/vehicle pairing or too many helpers.
    return {
      ok: false,
      status: quoteFailureStatus(result),
      error: quoteFailureMessage(result, t),
      ...(result.reason === "manual_quote_required"
        ? { reason: "manual_quote_required" as const }
        : {}),
    };
  }

  const {
    pickup,
    dropoff,
    distanceKm,
    vehicleTypeSpecId,
    breakdown,
    commissionRate,
    tariffVersion,
    quotedAt,
  } = result.estimate;

  // The client was shown a quote at `quotedTariffVersion`; if an admin has
  // retuned any tariff since, the price we just computed may differ from what
  // they saw. Refuse rather than silently charge a different figure — the form
  // re-quotes and shows the new price. A client that sends no version (older
  // clients) is priced at today's tariff, as before.
  if (quotedTariffVersion !== null && quotedTariffVersion !== tariffVersion) {
    return {
      ok: false,
      status: 409,
      error: t("common.pricing.tariffChanged"),
      reason: "tariff_changed",
    };
  }

  // Pricing model v1. The tier applies to the TRANSPORT charge only (helpers
  // are flat pass-through services), and is derived from the server's own
  // quote — the client chooses a tier, not a price. Stored beside `price`
  // rather than folded into it, so `price` keeps meaning "quoted total before
  // the tier" and `POST /api/orders/[id]/pay` bills `price + adjustment`.
  const adjustment = serviceLevelAdjustment(
    serviceLevel,
    breakdown.transportFare,
  );

  // The platform's cut and the driver's share — see `quotedOrderPayout` in
  // `src/lib/orders/payout.ts`: commission on round(transport + adjustment) at
  // the per-vehicle, per-trip-type rate; helpers passed through in full.
  // `Order.driverPayout` is the ONLY money figure a driver may be shown, and
  // this is the single place it is computed — every read path displays the
  // stored column. (An *edit* re-stamps it, deliberately: an unpaid order has
  // promised no driver anything yet.)
  const payout = quotedOrderPayout({
    transportFare: breakdown.transportFare,
    serviceLevelAdjustment: adjustment,
    helperFee: breakdown.helperFee,
    commissionRate,
  });

  return {
    ok: true,
    write: {
      details: {
        cargoCategory,
        bodyType,
        helperCount,
        description,
        scheduledAt,
        pickupAddress,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        // Resolved from the address the geocode lookup produced, never from a
        // city the request body named — see `resolveGeorgianCity`. The quote
        // classified the trip from the same resolution.
        pickupCity: resolveGeorgianCity(pickupAddress),
        pickupContactName: pickupContact.name,
        pickupContactPhone: pickupContact.phone,
        pickupContactDetails: pickupContact.details,
        pickupBuildingName: pickupContact.buildingName,
        pickupEntrance: pickupContact.entrance,
        pickupComment,
        dropoffAddress,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        dropoffCity: resolveGeorgianCity(dropoffAddress),
        dropoffContactName: dropoffContact.name,
        dropoffContactPhone: dropoffContact.phone,
        dropoffContactDetails: dropoffContact.details,
        dropoffBuildingName: dropoffContact.buildingName,
        dropoffEntrance: dropoffContact.entrance,
        dropoffComment,
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
        driverPayout: payout.driverPayout,
        tripType: breakdown.tripType,
        returnAllowance: breakdown.returnAllowance,
        returnFare: breakdown.returnFare,
        transportFare: breakdown.transportFare,
        pickupHelperFee: breakdown.pickupHelperFee,
        dropoffHelperFee: breakdown.dropoffHelperFee,
        helperPayout: payout.helperPayout,
        pickupHelpers: pickupHelp.helpers,
        pickupFloor: pickupHelp.floor,
        pickupCargoElevator: pickupHelp.cargoElevator,
        pickupPassengerElevator: pickupHelp.passengerElevator,
        dropoffHelpers: dropoffHelp.helpers,
        dropoffFloor: dropoffHelp.floor,
        dropoffCargoElevator: dropoffHelp.cargoElevator,
        dropoffPassengerElevator: dropoffHelp.passengerElevator,
        tariffVersion,
        quotedAt,
        cargoWeightKg,
        cargoLengthM,
        cargoWidthM,
        cargoHeightM,
        cargoVolumeM3: derivedLoad?.cargoVolumeM3 ?? null,
        packagingDescription,
        itemQuantity,
        handlingTags,
        pickupWindowStart,
        pickupWindowEnd,
        deliveryDeadline,
      },
      items: derivedLoad?.itemSnapshots ?? null,
      payment: {
        paymentMethodType,
        savedCardId,
        purchaseOrderRef: businessPurchaseOrderRef,
      },
    },
  };
}
