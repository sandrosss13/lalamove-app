// Reads and writes orders through Prisma; route handlers only.
import "server-only";

import { DriverClaimCapacity, OrderStatus, type Prisma } from "@prisma/client";

import type { RequestTranslator } from "@/i18n/request-locale";
import { settleOffersAfterClaim } from "@/lib/offers/settle";
import { CARRIER_ORDER_PARTY_SELECT } from "@/lib/order-response-select";
import { specCapability } from "@/lib/orders/booking-fit";
import {
  meetsBookedClass,
  offersBodyType,
} from "@/lib/orders/class-substitution";
import { driverVehiclesWhere } from "@/lib/orders/driver-vehicles";
import {
  capabilityOf,
  hasDeclaredEnvelope,
  loadFits,
  type LoadDimensions,
} from "@/lib/orders/vehicle-fit";
import { prisma } from "@/lib/prisma";

/** What a successful claim answers with: the order's carrier-side fields. */
const CLAIMED_ORDER_SELECT = {
  ...CARRIER_ORDER_PARTY_SELECT,
  handlingTags: true,
} as const;

export type ClaimedOrder = Prisma.OrderGetPayload<{
  select: typeof CLAIMED_ORDER_SELECT;
}>;

/** Why a driver's claim was refused. Stable; clients may branch on it. */
export type DriverClaimRefusalReason =
  | "DRIVER_PROFILE_MISSING"
  | "NOT_ACTIVATED"
  | "DRIVER_OFFLINE"
  | "ORDER_NOT_FOUND"
  | "VEHICLE_NOT_FOUND"
  | "VEHICLE_BELOW_BOOKED_CLASS"
  | "VEHICLE_BODY_MISMATCH"
  | "VEHICLE_TOO_SMALL"
  | "ALREADY_CLAIMED";

export type DriverClaimRefusal = {
  ok: false;
  reason: DriverClaimRefusalReason;
  /** The HTTP status `POST /api/orders/[id]/accept` has always answered with. */
  status: number;
  /** Localised with the request's translator. */
  error: string;
  /** The load's human reference — set for `ALREADY_CLAIMED` only. */
  reference?: string;
};

export type DriverClaimResult =
  { ok: true; order: ClaimedOrder } | DriverClaimRefusal;

function refusal(
  reason: DriverClaimRefusalReason,
  status: number,
  error: string,
): DriverClaimRefusal {
  return { ok: false, reason, status, error };
}

/**
 * A driver claims a pending, unassigned order with one of the vehicles they
 * hold — **the one implementation of that act**, called by `POST
 * /api/orders/[id]/accept` (the load board) and by `POST
 * /api/dashboard/hub/offers/[id]/accept` (a pushed offer). It was the body of
 * the first route until the second existed; it was moved here rather than
 * copied so that accepting an offer can never be a second, weaker way to a job.
 *
 * The caller has already established who is asking: a signed-in `DRIVER` with
 * no pending password change. Everything from there on is here — the profile,
 * activation and online gates, the vehicle scope, the class and fit checks, and
 * the atomic claim.
 *
 * **Any driver, employed or not.** A driver on a company's roster used to be
 * refused on the grounds that their company claims and dispatches on their
 * behalf, so accepting directly was a second, parallel way in. That is no longer
 * the rule: a roster driver browses and claims the open board exactly as an
 * independent driver does, and `GET /api/loads`, `POST /api/loads/[id]/reject`
 * and the `/dashboard/loads` page dropped their matching refusals in the same
 * change. Their company's own claim path
 * (`POST /api/logistics-company/orders/[id]/claim`) is untouched and remains a
 * separate route for a separate account; the two no longer exclude each other.
 *
 * The claim is done with a single conditional `updateMany` (status PENDING and
 * driverId null in the `where`) rather than a read-then-write, so two drivers
 * racing for the same order can't both succeed: the database applies at most one
 * update and `count` tells us whether this request won.
 *
 * The vehicle is looked up scoped to the vehicles this caller holds — owned
 * outright, or held on an open fleet assignment, the union `driverVehiclesWhere`
 * defines — and a vehicle that is neither is reported as 404 rather than 403,
 * the same reasoning as DELETE /api/driver-profile/vehicles/[id]: a 403 would
 * confirm that the id exists, letting a caller enumerate other drivers'
 * vehicles.
 *
 * Two further preconditions come from the load board, and both are checked on
 * the read side, *before* the `updateMany` — never inside its `where`, which
 * exists to keep the compare-and-swap atomic and must stay minimal (status and
 * assignment columns only) rather than becoming a general validation clause: the
 * driver must be online to claim (they may browse offline), and the order's
 * declared cargo must physically fit the chosen vehicle — measured with the
 * board's own `capabilityOf`/`loadFits` pair so the two can never disagree about
 * what fits.
 *
 * The success value carries no client money at all — not `Order.price` and not
 * the fare components it is built from. See the select at the bottom.
 */
export async function claimOrderForDriver(
  claim: { userId: string; orderId: string; vehicleId: string },
  t: RequestTranslator,
): Promise<DriverClaimResult> {
  const { userId, orderId, vehicleId } = claim;

  // Whether this driver is on a fleet's roster does not bear on whether they
  // may claim an open load — `activatedAt` and `isOnline` are the two
  // conditions that do. `companyId` is read for a different purpose: it is
  // *recorded on the order* by the claim below, as the capacity the job was
  // taken in. It gates nothing here.
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: userId },
    select: { id: true, activatedAt: true, isOnline: true, companyId: true },
  });

  if (!driverProfile) {
    return refusal(
      "DRIVER_PROFILE_MISSING",
      404,
      t("common.shared.vehicleNotFound"),
    );
  }

  // A driver whose onboarding application has not been approved cannot claim
  // work. Kept distinct from the offline gate below: the two are different
  // problems with different remedies.
  if (driverProfile.activatedAt === null) {
    return refusal(
      "NOT_ACTIVATED",
      403,
      t("common.shared.yourAccountIsnTApprovedYet"),
    );
  }

  // Browsing the board doesn't require being online — a driver plans their day
  // before starting it, checking what work exists and what it pays before
  // deciding whether to go online at all. Claiming does: a claim commits the
  // order to this driver right now, and `isOnline` is the one signal the product
  // has that they are actually available to act on it.
  //
  // 403 rather than 409 because this is a fact about the caller's own account
  // state — the same class of condition as the activation gate immediately
  // above — not a conflict with what another request just did. It is one of
  // the two refusals the accept route sends a `code` for, precisely because it
  // is recoverable: the UI offers "go online and retry".
  if (!driverProfile.isOnline) {
    return refusal(
      "DRIVER_OFFLINE",
      403,
      t("errors.ordersAccept.youReOfflineGoOnlineTo"),
    );
  }

  // Distinguish "no such order" (404) from "already taken / not pending" (409):
  // the conditional update alone can't tell them apart, so check existence first.
  // The order's cargo columns are what the physical fit re-check below measures.
  //
  // **`bodyType` and the booked class's four capacity columns are selected in
  // place of the bare `vehicleTypeSpecId` this route used to compare.** The class
  // is no longer checked for identity, so its id is no longer interesting; what
  // matters is the *floor* it sets — the payload and the three hold dimensions
  // the client was quoted on, and the body they asked for. See the substitution
  // check below for why the id alone was the wrong question. The relation is
  // joined here rather than fetched separately so the class floor and the cargo
  // envelope still arrive in the one round trip this lookup has always been.
  //
  // `reference` is read here so the 409 below can name the load for the UI's
  // dedicated "just claimed" dialog. Reading it from this pre-claim lookup
  // rather than re-querying after a failed `updateMany` is correct, not stale:
  // `reference` never changes after the order is created.
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      reference: true,
      bodyType: true,
      // The booked class's identity, read back alongside its figures: a vehicle
      // registered under this class may fulfil the booking whatever its own
      // declared capacity resolves to. See `meetsBookedClass`.
      vehicleTypeSpecId: true,
      vehicleTypeSpec: {
        select: {
          maxPayloadKg: true,
          cargoLengthM: true,
          cargoWidthM: true,
          cargoHeightM: true,
        },
      },
      cargoWeightKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
    },
  });
  if (!existing) {
    return refusal("ORDER_NOT_FOUND", 404, t("common.shared.orderNotFound"));
  }

  // Scoped to the vehicles this driver holds, so this returns nothing for
  // another driver's vehicle — and the 404 below reports it as absent rather
  // than forbidden, per the doc comment above.
  //
  // "Holds" is `driverVehiclesWhere`, not `driverProfileId` alone: an employed
  // driver owns no `Vehicle` row and drives their company's on an open
  // `DriverVehicleAssignment`, so an ownership-only scope would 404 the one
  // vehicle a roster driver can actually turn up in. `GET /api/loads` filters
  // the board with the same helper, so the vehicles the confirm dialog offers
  // are exactly the vehicles this lookup accepts — a board that names a claim
  // vehicle this route then refuses is the divergence both sides share the
  // helper to prevent.
  //
  // Both capacity sources are selected because `capabilityOf` needs both: the
  // vehicle's OWN driver-declared `payloadKg`/`cargoLengthM`/`cargoWidthM`/
  // `cargoHeightM`, preferred per field, with the class spec as the fallback
  // wherever one is null. Selecting the spec alone would silently make this
  // route stricter than the board that sent the driver here — see the fit
  // re-check below.
  //
  // `vehicleTypeSpec.bodyTypes` is selected for the substitution check below and
  // is the one field here that is not a capacity figure: it is which load spaces
  // this vehicle's class actually offers, which no amount of payload can stand in
  // for. `vehicleTypeSpecId` is selected for one purpose only:
  // `meetsBookedClass`'s identity clause, which admits a vehicle registered
  // under the booked class outright. Nothing here compares the two ids by hand.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ...driverVehiclesWhere(driverProfile.id) },
    select: {
      id: true,
      vehicleTypeSpecId: true,
      payloadKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
      vehicleTypeSpec: {
        select: {
          maxPayloadKg: true,
          cargoLengthM: true,
          cargoWidthM: true,
          cargoHeightM: true,
          bodyTypes: true,
        },
      },
    },
  });

  if (!vehicle) {
    return refusal(
      "VEHICLE_NOT_FOUND",
      404,
      t("common.shared.vehicleNotFound"),
    );
  }

  // Resolved once and used by both checks below: this vehicle's own declared
  // capacity, class spec as the per-field fallback. The substitution check asks
  // whether it is at least the class the client booked; the fit check asks
  // whether this specific load fits inside it. Two questions, one capability.
  const vehicleCapability = capabilityOf(vehicle, vehicle.vehicleTypeSpec);

  // **The booked class is a floor, not an identity.** This was
  // `vehicle.vehicleTypeSpecId !== existing.vehicleTypeSpecId` — refusing every
  // vehicle but one exact class — which read the booking form's step 5, titled
  // *"Recommended vehicle"*, as a guarantee that one specific model turns up. It
  // never was one. The class is what the fare was quoted on and what the client
  // is owed at minimum, so the promise forbids turning up with *less* than they
  // paid for, and nothing more than that.
  //
  // The identity test was not merely too strict in theory. A client booked an MPV
  // (400 kg, 1.8 x 1.3 x 1.1 m, DRY_BOX). A carrier held a Minivan (500 kg,
  // 2 x 1.4 x 1.3 m, DRY_BOX) that beats it on every axis and offers the same
  // body, and this route refused it because two cuids differed. No MPV is
  // registered anywhere on the platform, so that order sat on-market, priced, and
  // claimable by nobody at all — the client's booking silently unworkable.
  //
  // The replacement is the upgrade rule, and it is two tests because a bigger
  // hold is not the same promise as the right *kind* of hold:
  //  - `meetsBookedClass` — this vehicle is registered under the booked class, or
  //    its resolved capability is at or above that class's catalogue capability
  //    on all four axes. Never smaller than what was paid for; bigger is always
  //    welcome. The identity clause is not redundant: registration floors only
  //    `payloadKg` against the spec, so a vehicle can resolve *below* the very
  //    class it is approved to operate in, and comparing figures alone refused
  //    two of the eight vehicles on the live fleet work in their own class.
  //  - `offersBodyType` — the class this vehicle is registered under offers the
  //    body the client asked for. A dry box does not fulfil a refrigerated
  //    booking however much it out-measures it, and an order with a null
  //    `bodyType` asked for no particular body and so imposes no requirement.
  //
  // Both come from `@/lib/orders/class-substitution`, which `GET /api/loads`
  // reads too. That sharing is the whole point: a board that advertises a load
  // this route then refuses is the exact class of bug this codebase has been
  // fighting since the board shipped, and it recurs every time the two sides
  // express "eligible" in their own words.
  //
  // The booked side goes through `specCapability` rather than reading the four
  // spec columns into a literal, because `capabilityOf` is the one place
  // `cargoHeightM: 0` is translated to `Infinity` for an open bed. A hand-rolled
  // literal would give a flatbed booking a height floor of zero, which every
  // vehicle on the platform trivially clears — silently turning the strictest
  // class on the catalogue into the most substitutable one.
  const bookedClass = {
    vehicleTypeSpecId: existing.vehicleTypeSpecId,
    floor: specCapability(existing.vehicleTypeSpec),
  };

  if (
    !meetsBookedClass(
      {
        vehicleTypeSpecId: vehicle.vehicleTypeSpecId,
        capability: vehicleCapability,
      },
      bookedClass,
    )
  ) {
    return refusal(
      "VEHICLE_BELOW_BOOKED_CLASS",
      400,
      t("errors.ordersAccept.thisVehicleIsSmallerThanThe"),
    );
  }

  if (!offersBodyType(vehicle.vehicleTypeSpec.bodyTypes, existing.bodyType)) {
    return refusal(
      "VEHICLE_BODY_MISMATCH",
      400,
      t("errors.ordersAccept.thisVehicleDoesnTOfferThe"),
    );
  }

  // A third, independent check alongside the two substitution tests above, and
  // it does not overlap them: they ask whether this vehicle is at least the class
  // the client bought, this one asks whether *this particular load* fits inside
  // this particular truck. A vehicle can clear the booked class comfortably and
  // still be too small for a load that was itself oversized for that class, so
  // neither test subsumes the other and both must pass. The board
  // applies its own physical fit filter at listing time, but that filter runs
  // against a snapshot: the load could be re-weighed, the driver could switch
  // vehicles between opening the board and confirming, or a caller could hit
  // this endpoint directly and bypass the board entirely. A listing is a
  // snapshot; this request is what commits, so fit is re-checked here.
  //
  // **`capabilityOf` + `loadFits` from `src/lib/orders/vehicle-fit.ts`, the same
  // pair `GET /api/loads` filters the board with — deliberately the one and only
  // definition of "fits" in the codebase.** This route previously carried its
  // own copy that measured the load against `VehicleTypeSpec` alone, and that
  // divergence was not academic: `model Vehicle` in `prisma/schema.prisma`
  // records a submit-time check forcing a declared `payloadKg` to be at or above
  // its class spec's `maxPayloadKg` (read that block for the current,
  // authoritative statement of what these columns mean — it is amended as their
  // use grows, so it is pointed at here rather than quoted). Declared capacity
  // is therefore systematically at or above the spec, so a spec-only re-check is
  // systematically stricter than the board: the driver taps Accept on a load the
  // board showed them and gets a 400. One shared predicate is the only way that
  // stays fixed.
  //
  // **The null pre-check is `hasDeclaredEnvelope` from that same module, and it
  // is no longer an asymmetry with the listing.** `loadFits` resolves a null
  // load dimension to "does not fit", which would be wrong for *this* route: it
  // is also the legacy claim path behind `GET /api/orders`, an endpoint that
  // predates cargo capture and still returns every legacy `PENDING` order with
  // null weight and dimensions, so applying that rule here would make every one
  // of those orders permanently unclaimable by the same endpoint that has
  // always claimed them. An order with no declared cargo AT ALL therefore skips
  // the check — there is nothing to measure — and an order that declares any
  // cargo is measured by `loadFits` exactly as the board measures it, including
  // its all-or-nothing rule, under which a partially declared load does not fit.
  //
  // The board once drew this line differently and hid the loads this route
  // accepts, telling the driver they were over their vehicle's capacity. It now
  // reads the same predicate, from the same module: an undeclared envelope is
  // listed and claimable, a partially declared one is neither. Both routes
  // changing together is the whole point of the predicate being exported rather
  // than written out here — see `hasDeclaredEnvelope` and `LoadFitVerdict`.
  const declaredCargo: LoadDimensions = {
    weightKg: existing.cargoWeightKg,
    lengthM: existing.cargoLengthM,
    widthM: existing.cargoWidthM,
    heightM: existing.cargoHeightM,
  };

  if (
    hasDeclaredEnvelope(declaredCargo) &&
    !loadFits(declaredCargo, vehicleCapability)
  ) {
    return refusal(
      "VEHICLE_TOO_SMALL",
      400,
      t("errors.ordersAccept.thisVehicleCanTCarryThis"),
    );
  }

  // Atomic claim: only rows that are still PENDING and unassigned are updated.
  //
  // The same statement stamps **whose job this is**: the driver's own, or one
  // taken while on a company's roster. The wallet decides credit-or-hold from
  // this record (`walletCreditDecisionFor`), because the question is about the
  // moment of the claim and the answer may be needed weeks later — when a
  // gateway confirms the payment — by which time the driver may have left the
  // company. Written here, in the claiming write itself, so an order can never
  // be claimed without it. See `Order.driverClaimedAs` for why the claim and
  // not the completion.
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: OrderStatus.PENDING, driverId: null },
    data: {
      driverId: userId,
      vehicleId: vehicle.id,
      status: OrderStatus.ACCEPTED,
      driverClaimedAs:
        driverProfile.companyId === null
          ? DriverClaimCapacity.INDEPENDENT
          : DriverClaimCapacity.ROSTER,
      driverClaimCompanyId: driverProfile.companyId,
    },
  });

  // Losing the race is the one failure a well-behaved concurrent client has to
  // branch on, so it carries the load's `reference` — the board's dedicated
  // "just claimed by another driver" dialog names the load, and a cuid is not
  // something a driver can recognise.
  if (count === 0) {
    return {
      ...refusal(
        "ALREADY_CLAIMED",
        409,
        t("common.shared.thisLoadWasJustClaimedBy"),
      ),
      reference: existing.reference,
    };
  }

  // The load is no longer open, so every live offer of it is settled now: this
  // driver's (if they had one) as accepted, everyone else's as withdrawn.
  // Bookkeeping only — the claim above has already committed, and the offer
  // read path derives the same answer from the order if this write is lost.
  await settleOffersAfterClaim(orderId, driverProfile.id);

  // Carrier-only response — see `CARRIER_ORDER_PARTY_SELECT`'s doc comment;
  // never `ORDER_PARTY_SELECT` here. Every caller of this function is a driver
  // (both routes check the role before calling), and a
  // driver sees their own `driverPayout`, never what the client paid.
  //
  // This used to be `{ ...ORDER_PARTY_SELECT, price: false }`, which looked like
  // the redaction and was not one: it still returned `baseFare`, `distanceFare`,
  // `timeFare` and `helperFee`, and `price` is their sum floored at the rule's
  // `minimumFare`, so the figure it claimed to withhold was one addition away.
  // The shared select drops all seven money columns together, which is the only
  // way that stays true.
  //
  // `handlingTags` is the one field added on top, and it is not money: the
  // confirm dialog warns about a HAZMAT load with it — a warning only, since
  // `DriverLicence` has no certification field anywhere in the schema, so
  // nothing here gates a hazmat claim and nothing should until that field and
  // the onboarding capture behind it exist.
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: CLAIMED_ORDER_SELECT,
  });

  return { ok: true, order };
}
