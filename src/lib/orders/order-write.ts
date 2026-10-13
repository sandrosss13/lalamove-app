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
 * 5. the quote itself, and the tier adjustment, commission and driver payout
 *    derived from it.
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

import { ClientAccountType } from "@prisma/client";

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
import {
  resolveGeorgianCity,
  type CreateOrderInput,
} from "@/lib/orders/order-input";
import { driverPayoutFor, PLATFORM_COMMISSION_RATE } from "@/lib/orders/payout";
import { prisma } from "@/lib/prisma";
import {
  estimateDelivery,
  quoteFailureMessage,
  serviceLevelAdjustment,
} from "@/lib/pricing";
import { vehicleTypeSpecLabel } from "@/lib/vehicle-type-spec-labels";

/**
 * Round a currency amount to whole tetri.
 *
 * A module-local copy of the helper in `POST /api/orders/[id]/pay`, which is
 * module-private there — as is the one in `src/lib/pricing.ts` and the one in
 * `src/lib/orders/payout.ts`. The arithmetic is identical on purpose so every
 * money figure in the codebase lands on the same value.
 *
 * It exists here for one job: pre-rounding `price + serviceLevelAdjustment`
 * before that sum is commissioned into `driverPayout`. See the stamping block in
 * `prepareOrderWrite` for why the raw float sum is the wrong basis.
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

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
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffCity: ReturnType<typeof resolveGeorgianCity>;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  dropoffContactDetails: string | null;
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
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  handlingTags: CreateOrderInput["handlingTags"];
  pickupWindowStart: Date | null;
  pickupWindowEnd: Date | null;
  deliveryDeadline: Date | null;
};

/** A booking body that passed every check, turned into the columns it writes. */
export type PreparedOrderWrite = {
  details: OrderDetailColumns;
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
  | { ok: false; status: 400 | 422; error: string };

/**
 * Check a parsed booking body against the catalogue, the fleet, the payment
 * switchboard and the caller's own account, then price it.
 *
 * `clientId` is the signed-in client the order belongs to — the session user on
 * both callers. It scopes the saved-card lookup and decides the account type
 * the PO reference is kept for.
 *
 * Quoting goes through the same `estimateDelivery` the public estimate endpoint
 * uses, so the price booked here is the price that was quoted. The itemised
 * breakdown is returned alongside the total: the order keeps showing how its
 * price was reached even after the underlying `PricingRule` is retuned.
 *
 * The service-level tier is the same story one step on: the client picks a tier
 * and the fare effect of that tier is derived here from the server's own quote,
 * so no figure the browser computed is ever booked.
 */
export async function prepareOrderWrite(
  input: CreateOrderInput,
  clientId: string,
  t: RequestTranslator,
): Promise<PrepareOrderWriteResult> {
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
  if (savedCardId !== null) {
    const savedCard = await prisma.savedCard.findFirst({
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
  let businessPurchaseOrderRef: string | null = null;
  if (purchaseOrderRef !== null) {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: clientId },
      select: { accountType: true },
    });

    if (clientProfile?.accountType === ClientAccountType.BUSINESS) {
      businessPurchaseOrderRef = purchaseOrderRef;
    }
  }

  const result = await estimateDelivery(input);

  if (!result.ok) {
    // An address the geocoder cannot place is well-formed input the server
    // could not act on (422); an unknown vehicle type or an ineligible
    // cargo/vehicle pairing is bad input (400).
    const status = result.reason === "unresolved_address" ? 422 : 400;
    return { ok: false, status, error: quoteFailureMessage(result, t) };
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
  // forget a rate, not something a write path may lean on. Stamping it also
  // means retuning `PLATFORM_COMMISSION_RATE` can never rewrite what a
  // historical job promised a driver. (An *edit* re-stamps it, deliberately: an
  // unpaid order has promised no driver anything yet, so it is priced at today's
  // rate exactly as a fresh booking of the same job would be.)
  const commissionRate = PLATFORM_COMMISSION_RATE;
  const driverPayout = driverPayoutFor(
    roundCurrency(breakdown.price + adjustment),
    commissionRate,
  );

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
      },
      payment: {
        paymentMethodType,
        savedCardId,
        purchaseOrderRef: businessPurchaseOrderRef,
      },
    },
  };
}
