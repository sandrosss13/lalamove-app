// Hard build-time boundary, not decoration: this module reads the Better Auth
// session and talks to Prisma, neither of which belongs in a browser bundle.
//
// It is, however, the ONLY one of the ~80 route handlers under src/app/api that
// declares it — an earlier comment here claimed it "mirrors every other route
// handler", which was simply untrue. The convention this file does follow is
// the one in src/lib, where ~19 server modules carry the import. Route handlers
// are already unreachable from a client bundle by Next.js' own routing rules,
// so the import is belt-and-braces rather than load-bearing here; it stays
// because the cost is one build-time edge and the failure it forecloses — a
// helper or type from this file being imported into a `"use client"` component,
// dragging Prisma and the session with it — is a real one. Removing it would be
// a defensible tidy-up; extending it to the other 79 handlers would be the
// better direction. Neither belongs in this file's diff.
import "server-only";

import { NextResponse } from "next/server";
import { OrderStatus, type Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import {
  resolveHubAccount,
  type HubAccount,
} from "@/lib/dashboard/hub/account";
import { formatCity } from "@/lib/format-city";
import { haversineDistanceKm, type LatLng } from "@/lib/geo";
import {
  capabilityOf,
  classifyFit,
  classifyFitAnyVehicle,
  widestCapability,
  type LoadDimensions,
  type VehicleCapability,
} from "@/lib/orders/vehicle-fit";
import { prisma } from "@/lib/prisma";

/**
 * The `Order` columns this endpoint may read, and the only ones it may return.
 * Mirrors `ORDER_LIST_SELECT` in src/app/api/orders/route.ts and
 * `COMPANY_ORDER_LIST_SELECT` in src/app/api/logistics-company/orders/route.ts
 * — a third, route-local allowlist rather than a shared one, per the reasoning
 * in src/lib/order-response-select.ts's doc comment (this endpoint serves
 * non-parties too, and must be free to withhold more than the shared
 * lifecycle-endpoint list does).
 *
 * `price`, `baseFare`, `distanceFare`, `timeFare`, `helperFee`, `overtimeFee`
 * and `serviceLevelAdjustment` are ALL deliberately absent. `price` is what the
 * client pays; every other field in that list is a component that sums toward
 * it. None of them may reach a driver — see the GET handler's own doc comment
 * for why this is the single most important rule in this file.
 *
 * They are absent from the *select*, not stripped from the result afterwards,
 * and that distinction is the whole safety property: a leak here would need
 * somebody to deliberately add a column to this list, rather than merely
 * forgetting to remove one downstream.
 *
 * `savedCardId`, `purchaseOrderRef` and `clientId` are absent for the same
 * reason they are absent from the other listing endpoints: no consumer of a
 * dispatch surface has business with the client's payment instrument, their
 * finance team's internal reference, or their identity.
 *
 * Relations are not selected; this list is the scalar row and nothing more.
 */
const LOADS_SELECT = {
  id: true,
  reference: true,
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
  // The board's two city dropdowns build their options from the distinct
  // cities present in this response, so both are returned on every row —
  // as display labels, resolved through `formatCity` at the shaping step.
  pickupCity: true,
  dropoffCity: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  distanceKm: true,
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
  serviceLevel: true,
  vehicleTypeSpecId: true,
  status: true,
  driverId: true,
  companyId: true,
  vehicleId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** One `Order` row as this endpoint reads it — exactly `LOADS_SELECT`, no more. */
type LoadRow = Prisma.OrderGetPayload<{ select: typeof LOADS_SELECT }>;

/**
 * How long a load stays on the board after somebody else claims it.
 *
 * A load that flips from open to claimed does not vanish from the response
 * immediately: for this window it is still returned, inside `available`, with
 * `status: "claimed"`, so the board can grey the row out in place rather than
 * have it disappear out from under a driver who has it selected or open in the
 * drawer.
 *
 * Deliberately short, and deliberately independent of the live-update poll
 * interval: this is "how long is the transition worth showing", not "how often
 * does the client ask". The live-update work should read this constant (or keep
 * a duplicate explicitly in sync with it) rather than guessing a compatible
 * number. Two minutes is a starting guess generous enough to survive a slow
 * poll; it wants revisiting against real traffic alongside the poll interval
 * itself, which specs/driver-load-board/action-required.md already flags.
 */
const CLAIMED_VISIBILITY_WINDOW_MS = 2 * 60 * 1000;

/**
 * The statuses that put one of this account's own orders on the board.
 *
 * `COMPLETED` and `CANCELLED` orders belonging to this account are deliberately
 * excluded from every array: they are job history, already served by the driver
 * hub's jobs and earnings screens, not open-board concerns. Leaving them in
 * `mine` would make that array grow without bound as an account completes work.
 */
const MINE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CLAIMED,
  OrderStatus.ACCEPTED,
  OrderStatus.IN_TRANSIT,
];

/**
 * The statuses a load can be in while it is transiently "just claimed by
 * somebody else" — the two states the atomic claim writes.
 */
const CLAIMED_BY_OTHERS_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CLAIMED,
  OrderStatus.ACCEPTED,
];

/**
 * Exactly what one capability is built from: the vehicle's own declared
 * capacity, plus its class spec to fall back on — and the class itself, which
 * the eligibility filter groups by before it measures anything.
 *
 * `vehicleTypeSpecId` is the *commercial* half of eligibility and is read for a
 * different purpose from the four capacity columns below it. See
 * `groupCapabilitiesByClass` and `eligibilityOf` in the GET handler for why a
 * load is offered only to a vehicle of the class the client actually booked.
 *
 * **Both halves are selected deliberately, and the vehicle's own columns are
 * the more important half.** `capabilityOf` prefers the driver-declared
 * `payloadKg`/`cargoLengthM`/`cargoWidthM`/`cargoHeightM` and falls back to the
 * spec per field where one is null, and that is the behaviour the fit filter
 * wants: the filter is about the truck that actually turns up at the pickup,
 * not about the average of its class. A driver whose registered truck declares
 * a bigger hold than its class figures would otherwise be denied loads their
 * vehicle can demonstrably carry — the exact hidden-load failure this filter
 * exists to prevent, and one that is invisible in testing because `prisma/
 * seed.ts` seeds the `VehicleTypeSpec` catalogue only and creates no `Vehicle`
 * rows at all. Only vehicles registered through onboarding carry overrides.
 *
 * `model Vehicle`'s schema comment is the authority here and says so directly:
 * these columns "began as attestations for compliance review only", which is
 * "still true of *pricing* ... and of dispatch matching, which keys on
 * `vehicleTypeSpecId`", but is "no longer true in general" — `capabilityOf`
 * reads them for the load board, "preferring the declared value and falling
 * back to the spec when it is null". What makes them trustworthy enough to
 * filter on is the submit-time server check recorded in the same comment: a
 * vehicle's `payloadKg` must be at or above its resolved spec's
 * `maxPayloadKg`, so one can never be registered under a class it physically
 * cannot meet.
 *
 * Routing everything through `capabilityOf` rather than assembling a
 * capability by hand is also what keeps the `cargoHeightM: 0` sentinel ("open
 * bed / no height limit", seeded for `FLATBED_TRUCK`) translated to `Infinity`
 * in exactly one place. Read literally, a flatbed operator's board would
 * otherwise be permanently empty.
 */
const VEHICLE_CAPABILITY_SELECT = {
  // The class this vehicle is registered under — matched against
  // `Order.vehicleTypeSpecId` before any capacity figure is compared.
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
    },
  },
} as const;

/** The shape every failure of this route answers with. */
export type LoadBoardError = { error: string };

/**
 * One row of the load board response.
 *
 * `driverPayout` and `ratePerKm` are the ONLY money figures here — there is no
 * `price` field on this type and there must never be one. See the GET handler's
 * doc comment.
 *
 * Every timestamp is an ISO string rather than a `Date`: this crosses the wire
 * as JSON and is consumed by client components, so the type states what the
 * consumer actually receives.
 */
export type LoadBoardItem = {
  id: string;
  reference: string;
  status: "available" | "claimed" | "mine";
  cargoCategory: string;
  description: string | null;
  bodyType: string | null;
  helperCount: number;
  scheduledAt: string | null;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  /** Display label ("Tbilisi"), or null when the city could not be resolved. */
  pickupCity: string | null;
  /** Display label ("Tbilisi"), or null when the city could not be resolved. */
  dropoffCity: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupContactDetails: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  dropoffContactDetails: string | null;
  distanceKm: number;
  /**
   * NOT in the approved design — see the GET handler's doc comment.
   *
   * Null whenever it cannot be measured: the driver has never pushed a
   * location, or the order was booked against an address the geocoder could not
   * place. Always null for a COMPANY session, which has no single location of
   * its own. Never used to filter, only to inform and sort.
   */
  pickupDistanceKm: number | null;
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  handlingTags: string[]; // CargoHandlingTag[]
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryDeadline: string | null;
  /** The driver's own share, read from the stored column. Never `Order.price`. */
  driverPayout: number;
  /** `driverPayout` per kilometre, or null when the trip has no distance. */
  ratePerKm: number | null;
  serviceLevel: string;
  vehicleTypeSpecId: string;
  driverId: string | null;
  companyId: string | null;
  vehicleId: string | null;
  /** NOT in the approved design — see the GET handler's doc comment. */
  createdAt: string;
  /** The claim instant for a `"claimed"` row; the UI derives "N min ago" from this. */
  updatedAt: string;
};

export type LoadBoardResponse = {
  available: LoadBoardItem[];
  mine: LoadBoardItem[];
  rejected: LoadBoardItem[];
  /**
   * How many open, non-rejected loads were withheld because **a vehicle of the
   * right class could not physically carry them** — over the payload, or over
   * one of the three dimensions.
   *
   * The board's footer prints this as *"N loads hidden — over your vehicle
   * capacity or dimensions"*, and this count is scoped precisely so that
   * sentence stays true of every load it counts.
   *
   * **A load whose cargo envelope was never declared is NOT counted here, and
   * is not hidden either — it is listed like any other.** It used to be both,
   * because `loadFits` resolves an undeclared envelope to "does not fit" and
   * this route mapped every non-fit to `OVER_CAPACITY`. That made the footer
   * state something untrue about the driver's own vehicle, and it contradicted
   * `POST /api/orders/[id]/accept`, which has always let such an order be
   * claimed — the board hiding work the claim path would have handed over. The
   * envelope case is now split off by `classifyFit`'s `UNDECLARED` verdict; see
   * `LoadFitVerdict` in src/lib/orders/vehicle-fit.ts for the full argument and
   * for why this mattered on the day the feature shipped rather than later.
   *
   * **Loads excluded for being the wrong vehicle class are NOT counted here,
   * and are not counted anywhere else either.** They are simply absent. A load
   * booked as a refrigerated truck is not "over the capacity" of a driver whose
   * only vehicle is a van — it is work that driver was never eligible for, and
   * rolling it into this number would make the footer lie about loads that a
   * bigger van would not unlock. Reporting it separately was the alternative;
   * see `eligibilityOf` in the GET handler for why it was not taken.
   */
  hiddenByCapacityCount: number;
};

/**
 * The account identity this board is scoped to, with the id each kind needs
 * already proven non-null.
 *
 * `resolveHubAccount` guarantees `driverProfileId` on an INDIVIDUAL and
 * `companyId` on a BUSINESS, but it states that in prose rather than in the
 * type. Narrowing once, here, is what keeps every query below free of non-null
 * assertions — and turns "the invariant broke" into one 403 rather than a
 * runtime error deep in a Prisma call.
 *
 * **Each variant carries only the ids its own branch may compare against, and
 * that exclusivity is a safety property rather than tidiness.** A `HubAccount`
 * has both `driverProfileId` and `companyId`, both `string | null`; a BUSINESS
 * scope here has no `driverProfileId` at all and an INDIVIDUAL scope has no
 * `companyId`, so a comparison against the wrong account kind's id does not
 * type-check instead of quietly evaluating `null === null`. See
 * `canSeeStopContacts`, which is the comparison that matters.
 *
 * `userId` is carried on the INDIVIDUAL variant because a driver's claim on an
 * order is recorded as `Order.driverId`, which is the **User** id, not the
 * `DriverProfile` id. Both are needed and they are not interchangeable:
 * `driverProfileId` keys the vehicles and the rejection rows, `userId` keys the
 * assignment.
 */
type LoadBoardScope =
  | { kind: "INDIVIDUAL"; userId: string; driverProfileId: string }
  | { kind: "BUSINESS"; companyId: string };

/** Narrow a resolved hub account to its board scope, or null if incomplete. */
function resolveScope(account: HubAccount): LoadBoardScope | null {
  if (account.kind === "INDIVIDUAL") {
    return account.driverProfileId === null
      ? null
      : {
          kind: "INDIVIDUAL",
          userId: account.userId,
          driverProfileId: account.driverProfileId,
        };
  }

  return account.companyId === null
    ? null
    : { kind: "BUSINESS", companyId: account.companyId };
}

/**
 * Whether the requesting account may see one order's stop contacts.
 *
 * A stop contact is a named person and a phone number, collected so whoever
 * turns up at pickup/dropoff knows who to ask for. An account earns them only
 * once it holds the job — the open market this endpoint also lists belongs to
 * nobody yet, and a driver or company browsing it has committed to nothing.
 * The contacts become theirs when the job does, at claim time.
 *
 * Handles both account kinds behind one session: a driver's "mine" is
 * `driverId`, a company's is `companyId` — see src/app/api/orders/route.ts and
 * src/app/api/logistics-company/orders/route.ts for the single-audience
 * versions of this same rule that this one merges. Nothing else in this file
 * re-derives "is this order mine": the bucket classification below calls this
 * once per row and reuses the answer, so entitlement and ownership can never
 * drift apart into two subtly different rules.
 *
 * **It takes a `LoadBoardScope`, deliberately, and not the `HubAccount` it was
 * narrowed from.** On a `HubAccount` both ids are `string | null`, so the
 * BUSINESS branch would compare `order.companyId` against a possibly-null
 * `account.companyId` — and an open, unclaimed order has `companyId: null`, so
 * `null === null` would report every load on the open market as this account's
 * own and hand out the client's stop contacts for all of them. Today that
 * cannot happen, but only because the caller 403s on a null `companyId` before
 * reaching this function: the safety rests entirely on the order of two
 * statements a hundred lines apart. Taking the narrowed scope, whose
 * `companyId` is `string`, moves the guarantee into the type — the dangerous
 * comparison stops being reachable rather than merely not currently reached.
 * The same reasoning applies to the INDIVIDUAL branch and `order.driverId`.
 */
function canSeeStopContacts(
  order: { driverId: string | null; companyId: string | null },
  scope: LoadBoardScope,
): boolean {
  return scope.kind === "INDIVIDUAL"
    ? order.driverId === scope.userId
    : order.companyId === scope.companyId;
}

/** Round to the two decimals a money-per-km figure is printed at. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Why one open load is, or is not, offered to this account.
 *
 * Three outcomes rather than a boolean, because the two ways of failing are not
 * the same fact and the response reports them differently: `OVER_CAPACITY`
 * feeds `hiddenByCapacityCount` and the footer note that explains it, while
 * `WRONG_CLASS` is silent. See `eligibilityOf` in the GET handler for the
 * reasoning behind both the two-part test and that asymmetry.
 *
 * There is deliberately no fourth outcome for "envelope undeclared". That is a
 * distinction `classifyFit` draws and this type does not need, because the
 * board's answer for such a load is `ELIGIBLE` — the same offer, on the same
 * terms, as any other listed load, exactly as the claim routes already treat
 * it. Adding an outcome here would imply the response says something about
 * these loads, and it says nothing: they are simply on the board.
 */
type LoadEligibility = "ELIGIBLE" | "WRONG_CLASS" | "OVER_CAPACITY";

/**
 * Exactly the vehicle columns a capability is resolved from, plus the class the
 * vehicle is registered under. Written out rather than derived from Prisma's
 * generated payload type so this helper states its own contract, matching the
 * plain-slice convention `capabilityOf` itself follows.
 */
type CapabilitySource = {
  vehicleTypeSpecId: string;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  vehicleTypeSpec: {
    maxPayloadKg: number;
    cargoLengthM: number;
    cargoWidthM: number;
    cargoHeightM: number;
  };
};

/**
 * Resolve every vehicle to its capability and bucket those capabilities by the
 * class the vehicle is registered under.
 *
 * **Grouping first is what makes the two eligibility tests apply to the same
 * vehicle rather than to two different ones.** A driver with a matching-class
 * van and an unrelated big truck can fulfil a load with neither: the van is the
 * right class but too small, the truck is big enough but the wrong class. Two
 * independent passes over a flat capability list — "some vehicle matches the
 * class" AND "some vehicle fits the cargo" — would pass that driver and put a
 * load on their board that the claim route then refuses. Every fit test below
 * therefore runs against `get(order.vehicleTypeSpecId)` and never against the
 * whole fleet.
 *
 * A class with no vehicle is absent from the map rather than present with an
 * empty array, so `get() === undefined` is the single "this account has nothing
 * of that class" signal, and no caller has to distinguish it from an empty one.
 *
 * Each capability comes from `capabilityOf(vehicle, vehicle.vehicleTypeSpec)` —
 * the real vehicle with its declared overrides, spec as the per-field fallback.
 * See `VEHICLE_CAPABILITY_SELECT` for why that pairing is not optional.
 */
function groupCapabilitiesByClass(
  vehicles: readonly CapabilitySource[],
): Map<string, VehicleCapability[]> {
  const byClass = new Map<string, VehicleCapability[]>();

  for (const vehicle of vehicles) {
    const capability = capabilityOf(vehicle, vehicle.vehicleTypeSpec);
    const existing = byClass.get(vehicle.vehicleTypeSpecId);

    if (existing === undefined) {
      byClass.set(vehicle.vehicleTypeSpecId, [capability]);
    } else {
      existing.push(capability);
    }
  }

  return byClass;
}

/**
 * The load's physical description in the shape `vehicle-fit` speaks, without
 * dragging the Prisma row into that deliberately dependency-free module.
 *
 * A null here means UNKNOWN. All four null means the client declared no
 * envelope at all, which `classifyFit` reports as `UNDECLARED` and this route
 * treats as eligible rather than as over capacity — see `eligibilityOf`.
 */
function loadDimensionsOf(order: LoadRow): LoadDimensions {
  return {
    weightKg: order.cargoWeightKg,
    lengthM: order.cargoLengthM,
    widthM: order.cargoWidthM,
    heightM: order.cargoHeightM,
  };
}

/** An order's pickup as a `LatLng`, or null when it was never geocoded. */
function pickupPointOf(order: LoadRow): LatLng | null {
  return order.pickupLat === null || order.pickupLng === null
    ? null
    : { lat: order.pickupLat, lng: order.pickupLng };
}

/**
 * Shape one row for the response: the ISO timestamps, the two city labels, the
 * driver's own money figures, the distance to the pickup, and the per-row
 * contact redaction.
 *
 * `showContacts` is passed in rather than recomputed because the caller has
 * already asked `canSeeStopContacts` to classify the row. The six contact keys
 * are nulled rather than dropped, exactly as both existing listing endpoints do,
 * so every row keeps one shape for the consuming UI.
 */
function toLoadBoardItem(
  order: LoadRow,
  status: LoadBoardItem["status"],
  showContacts: boolean,
  driverLocation: LatLng | null,
): LoadBoardItem {
  const pickupPoint = pickupPointOf(order);

  return {
    id: order.id,
    reference: order.reference,
    status,
    cargoCategory: order.cargoCategory,
    description: order.description,
    bodyType: order.bodyType,
    helperCount: order.helperCount,
    scheduledAt: order.scheduledAt?.toISOString() ?? null,
    pickupAddress: order.pickupAddress,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    dropoffAddress: order.dropoffAddress,
    dropoffLat: order.dropoffLat,
    dropoffLng: order.dropoffLng,
    pickupCity: order.pickupCity === null ? null : formatCity(order.pickupCity),
    dropoffCity:
      order.dropoffCity === null ? null : formatCity(order.dropoffCity),
    pickupContactName: showContacts ? order.pickupContactName : null,
    pickupContactPhone: showContacts ? order.pickupContactPhone : null,
    pickupContactDetails: showContacts ? order.pickupContactDetails : null,
    dropoffContactName: showContacts ? order.dropoffContactName : null,
    dropoffContactPhone: showContacts ? order.dropoffContactPhone : null,
    dropoffContactDetails: showContacts ? order.dropoffContactDetails : null,
    distanceKm: order.distanceKm,
    // Degrades to null rather than to a wrong number: `currentLat`/`currentLng`
    // are frequently stale or absent, and an order booked against an address
    // the geocoder could not place has no pickup point at all. Left unrounded —
    // it is an informational sort key, not a printed money figure.
    pickupDistanceKm:
      driverLocation === null || pickupPoint === null
        ? null
        : haversineDistanceKm(driverLocation, pickupPoint),
    cargoWeightKg: order.cargoWeightKg,
    cargoLengthM: order.cargoLengthM,
    cargoWidthM: order.cargoWidthM,
    cargoHeightM: order.cargoHeightM,
    packagingDescription: order.packagingDescription,
    itemQuantity: order.itemQuantity,
    handlingTags: order.handlingTags,
    pickupWindowStart: order.pickupWindowStart?.toISOString() ?? null,
    pickupWindowEnd: order.pickupWindowEnd?.toISOString() ?? null,
    deliveryDeadline: order.deliveryDeadline?.toISOString() ?? null,
    // Read straight from the stored column, never recomputed from a price this
    // response does not even select. The rate that applied is kept per order so
    // retuning the commission cannot rewrite what a historical job paid.
    driverPayout: order.driverPayout,
    // Guarded: `distanceKm` should always be positive in practice, but a stray
    // zero must not put `Infinity` into a JSON response.
    ratePerKm:
      order.distanceKm > 0
        ? round2(order.driverPayout / order.distanceKm)
        : null,
    serviceLevel: order.serviceLevel,
    vehicleTypeSpecId: order.vehicleTypeSpecId,
    driverId: order.driverId,
    companyId: order.companyId,
    vehicleId: order.vehicleId,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/**
 * GET /api/loads — the load board's single data source: the open client
 * bookings this account could claim, the ones it already holds, and the ones it
 * has hidden. No request body, no query parameters.
 *
 * **The single most important rule in this file: `Order.price` never appears in
 * this response, and neither do `baseFare`, `distanceFare`, `timeFare`,
 * `helperFee`, `overtimeFee` or `serviceLevelAdjustment`.** `price` is what the
 * *client* pays; the driver earns 85% of it, resolved and stored at booking in
 * `Order.driverPayout`, and that is the only money figure here. Leaking `price`
 * to a driver-facing surface would show a number that is wrong **in the
 * driver's favour** — the worst direction to be wrong in, because it sets an
 * expectation the driver acts on and the platform then has to walk back. The
 * defence is `LOADS_SELECT`, which never reads those columns at all: they are
 * excluded at the query, not stripped from the result, so the leak is
 * impossible rather than merely avoided.
 *
 * **Eligibility runs here, server-side, and that is not negotiable.** A load
 * this account could not actually claim is *absent* from the response — not
 * flagged, not warned about, absent — so a driver can neither see nor tap
 * Accept on work that would be refused. The board repeats the test client-side
 * for responsiveness; this is where it is enforced.
 *
 * **Eligibility has two parts, and both are required: the vehicle class the
 * client booked, and the physical fit of the actual truck.** They answer
 * different questions and neither subsumes the other.
 *
 * The class is the *commercial contract*. A client picks a vehicle class on the
 * booking form, is priced on it and pays for it, and `Order.vehicleTypeSpecId`
 * is that promise recorded. Fulfilling a refrigerated booking with a dry van
 * delivers something other than what was bought, even if the cargo would fit —
 * so both claim routes require the claiming vehicle's `vehicleTypeSpecId` to
 * equal the order's (src/app/api/orders/[id]/accept/route.ts refuses with "This
 * vehicle's type doesn't match what this delivery requires."; the company claim
 * route with "Your fleet has no vehicle of the type this delivery requires.").
 * That requirement is correct and stays where it is — this route does not
 * replace it, and removing it there would let a claim break what the client
 * paid for.
 *
 * The physical fit is the *reality check* on the specific truck that would turn
 * up: within a matching class, a particular load can still be too heavy or too
 * long for a particular vehicle, because a `Vehicle` carries its own declared
 * capacity that `capabilityOf` prefers over the class average.
 *
 * The board's job is to show only work that can actually be claimed, so it
 * applies both — and applies them to the **same vehicle**. A driver with a
 * matching-class van and a big-enough truck of another class can fulfil with
 * neither; testing the two conditions across a whole fleet independently would
 * show them the load anyway. `groupCapabilitiesByClass` exists to prevent
 * exactly that, and `eligibilityOf` below reads only the class-matching subset.
 * Before this filter existed the board showed loads that Accept then refused
 * with a 400 — the failure this route is now the first line of defence against.
 *
 * Loads that clear the class but fail the fit are counted into
 * `hiddenByCapacityCount` for the footer's "N loads hidden — over your vehicle
 * capacity or dimensions" note. Loads excluded on class alone are not counted:
 * see `eligibilityOf` and `LoadBoardResponse` for why.
 *
 * **Both halves of eligibility measure something the client declared, so a load
 * that declared no cargo envelope at all fails neither.** It is listed, and it
 * is not counted as hidden by capacity. Fit is measured through `classifyFit`
 * rather than `loadFits` precisely so this route can tell "too big" apart from
 * "never described"; the claim routes have always drawn that line, and the
 * board not drawing it was a defect — it hid claimable work behind a false
 * explanation. See `eligibilityOf`.
 *
 * Two fields the approved design does not show are returned anyway, because the
 * board cannot work well without them: `pickupDistanceKm` (how far the driver
 * is from the pickup, for sorting and for the "is this worth the deadhead"
 * judgement) and `createdAt` (the load's age, which is what makes a stale board
 * legible).
 *
 * The session is read directly rather than through `requireDashboardSession()`,
 * because that guard `redirect()`s and a redirect is the wrong answer to a
 * `fetch()` — the browser would follow it and the board would render the
 * sign-in page as JSON. The three conditions it redirects on are answered here
 * as status codes first; `resolveHubAccount()` is only called once none of them
 * can fire, at which point its own internal guard has nothing left to redirect
 * for. This is the pattern already in production at
 * src/app/api/dashboard/hub/earnings/export/route.ts.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json<LoadBoardError>(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  // Kept distinct from the role refusal below: a driver stuck on a
  // company-issued temporary password has a different problem with a different
  // remedy, and telling them they lack permission would send them to support
  // instead of to the change-password screen.
  if (session.user.mustChangePassword) {
    return NextResponse.json<LoadBoardError>(
      {
        error: "Change your temporary password before viewing the load board.",
      },
      { status: 403 },
    );
  }

  const { role } = session.user;

  // Also correctly excludes CLIENT and every back-office role. It runs before
  // `resolveHubAccount()`, so a CLIENT session never reaches the redirect
  // inside that function's own guard.
  if (role !== "DRIVER" && role !== "COMPANY") {
    return NextResponse.json<LoadBoardError>(
      {
        error: "Only drivers and logistics companies can view the load board.",
      },
      { status: 403 },
    );
  }

  const profileMissingError =
    role === "COMPANY"
      ? "Your company profile isn't set up yet."
      : "Your driver profile isn't set up yet.";

  const account = await resolveHubAccount();

  // Not an error condition in the usual sense: sign-up creates the row, so a
  // missing one means onboarding was interrupted part-way — the same `null`
  // case `resolveHubAccount`'s own doc comment describes.
  if (account === null) {
    return NextResponse.json<LoadBoardError>(
      { error: profileMissingError },
      { status: 403 },
    );
  }

  // `account.companyId` on an INDIVIDUAL account is `DriverProfile.companyId`:
  // the fleet a roster driver belongs to, or null for an independent driver or
  // sole proprietor. An employed roster driver receives work through their
  // company's dispatcher, who accepts and rejects on the company's behalf, so
  // they have no board of their own — the same reasoning
  // src/app/api/orders/[id]/accept/route.ts already refuses them with, adapted
  // from an action to a listing. This is a deliberate scoping choice rather
  // than an oversight: see specs/driver-load-board/requirements.md's
  // Assumptions ("Roster drivers do not accept work — confirmed, not assumed")
  // and specs/driver-load-board/action-required.md's "Decide whether employed
  // roster drivers get the board" item, which records the default (no) and the
  // alternative (a per-company opt-in) as an open *business* decision.
  if (account.kind === "INDIVIDUAL" && account.companyId !== null) {
    return NextResponse.json<LoadBoardError>(
      {
        error:
          "Drivers who belong to a company receive deliveries through their company's dispatch, not through the open load board.",
      },
      { status: 403 },
    );
  }

  // An account whose application has not been approved cannot claim work, so
  // there is nothing to compute and none of the queries below run.
  //
  // **This applies to both account kinds, and that is the whole point of the
  // check.** It gated only drivers at first, which left an unactivated
  // `LogisticsCompany` looking at a full board of claimable-looking loads that
  // `POST /api/logistics-company/orders/[id]/claim` and `POST
  // /api/loads/[id]/reject` then both refuse with 403 — the board advertising
  // work the claim path will not honour, which is the exact class of divergence
  // this endpoint's eligibility filter exists to prevent. The earlier fixes
  // were all about *fit* divergence and so could not have caught this one.
  //
  // `isActivated` is the real column reduced to a verdict — `activatedAt !==
  // null` on `DriverProfile` for a driver and on `LogisticsCompany` for a
  // fleet — resolved in the one `resolveHubAccount` round trip the handler has
  // already made. It replaces an earlier read of `canToggleOnline`, which was
  // only ever a *proxy* for a driver's activation and is flatly wrong for a
  // company: a fleet has no online toggle, so `canToggleOnline` is false for an
  // activated company too and reusing it here would empty every company's
  // board. That comment warned this check "must become a real `activatedAt`
  // read" if the proxy ever stopped holding; extending the gate to companies is
  // when it stopped holding.
  //
  // **An unactivated account gets an empty board, not a 403.** The board is a
  // listing, and the honest answer to "what may I act on?" for an account that
  // may act on nothing is an empty list — the same 200 shape every other
  // caller parses, rather than an error the UI would have to special-case. The
  // refusals stay where the action is, on claim and reject.
  if (!account.isActivated) {
    return NextResponse.json<LoadBoardResponse>(
      { available: [], mine: [], rejected: [], hiddenByCapacityCount: 0 },
      { status: 200 },
    );
  }

  const scope = resolveScope(account);

  if (scope === null) {
    return NextResponse.json<LoadBoardError>(
      { error: profileMissingError },
      { status: 403 },
    );
  }

  // --- Fleet capability, and the driver's own location for the distance column.

  // Declared without an initialiser: both branches below assign it, so an empty
  // starting map would be a throwaway allocation that also hides a missed
  // assignment from the compiler.
  let capabilitiesByClass: Map<string, VehicleCapability[]>;
  let driverLocation: LatLng | null = null;

  if (scope.kind === "INDIVIDUAL") {
    // One round trip for both: the vehicles the eligibility filter needs and
    // the coordinates `pickupDistanceKm` needs hang off the same profile row.
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { id: scope.driverProfileId },
      select: {
        currentLat: true,
        currentLng: true,
        vehicles: { select: VEHICLE_CAPABILITY_SELECT },
      },
    });

    // One capability per registered vehicle, each resolved from that vehicle's
    // own declared capacity with its class spec as the per-field fallback, and
    // filed under the class that vehicle may legitimately claim work in.
    capabilitiesByClass = groupCapabilitiesByClass(
      driverProfile?.vehicles ?? [],
    );

    driverLocation =
      driverProfile?.currentLat != null && driverProfile.currentLng != null
        ? { lat: driverProfile.currentLat, lng: driverProfile.currentLng }
        : null;
  } else {
    const fleet = await prisma.vehicle.findMany({
      where: { companyId: scope.companyId },
      select: VEHICLE_CAPABILITY_SELECT,
    });

    // Same resolution as the driver branch — each fleet vehicle's own declared
    // capacity, spec as fallback — grouped by class before `widestCapability`
    // is allowed anywhere near it.
    capabilitiesByClass = groupCapabilitiesByClass(fleet);
    // A COMPANY account has no single location of its own — a fleet is not
    // somewhere — so the distance column is always null for one.
  }

  /**
   * The company fit filter: `widestCapability`, computed **per class**.
   *
   * *Why `widestCapability` at all, rather than `fitsAnyVehicle`.* A company
   * claims a load with its *account*, not with a specific truck: the vehicle
   * and driver are assigned afterwards, from the job sheet. At claim time there
   * is therefore no single vehicle to test the load against, so this endpoint
   * has to make an optimistic guess about what the fleet *could* carry — the
   * largest payload and the largest each-dimension across the candidate
   * vehicles, taken independently per axis.
   *
   * That is deliberately optimistic and it can admit a load no single truck can
   * actually take: if the heaviest vehicle is not also the longest, the
   * synthesised capability describes a composite vehicle that does not exist.
   * This is the accepted, documented cost of claim-first-assign-later, not a
   * bug. The mismatch surfaces at a desk during assignment, before anything is
   * dispatched — a re-assignment rather than a driver's wasted trip, which is
   * the failure direction the fit filter exists to avoid. Picking a specific
   * vehicle at claim time was the other option the design left open;
   * requirements.md resolves open question 1 the other way.
   *
   * *Why per class, and why that part is not optional.* Widening across the
   * **whole** fleet would reintroduce precisely the mismatch this endpoint now
   * exists to prevent: a fleet of small vans and one unrelated heavy truck
   * would report the truck's payload while claiming a van-class load, and the
   * company claim route — which looks for a vehicle of the order's class and
   * measures *that* one — would refuse it. The optimism stays confined to
   * "which of my vehicles **of the required class** turns up", which is the
   * only question assignment actually gets to answer.
   *
   * A class the fleet has no vehicle in is absent from this map, exactly as it
   * is from `capabilitiesByClass`, and reads as "nothing to claim that load
   * with". An empty fleet produces an empty map and therefore an empty board.
   */
  const widestByClass = new Map<string, VehicleCapability>();

  if (scope.kind === "BUSINESS") {
    for (const [vehicleTypeSpecId, capabilities] of capabilitiesByClass) {
      const widest = widestCapability(capabilities);

      // `widestCapability` returns null only for an empty list, which
      // `groupCapabilitiesByClass` never produces — the check is here so the
      // invariant is enforced by the compiler rather than by a non-null
      // assertion that would survive the invariant changing.
      if (widest !== null) {
        widestByClass.set(vehicleTypeSpecId, widest);
      }
    }
  }

  /**
   * Whether one open load is claimable by this account, and if not, why not.
   *
   * The class test comes first and is a lookup, not a comparison: a load is
   * offered only to vehicles registered under the class the client booked and
   * paid for. Only the capabilities of *those* vehicles are then measured
   * against the cargo, which is what keeps both halves of eligibility pointing
   * at one real truck. See the GET handler's doc comment for the full argument.
   *
   * **A wrong-class load returns `WRONG_CLASS` and is dropped without being
   * counted anywhere.** The alternative — a second counter beside
   * `hiddenByCapacityCount` — was considered and rejected: the footer's one
   * number exists to tell a driver something they can act on ("a bigger vehicle
   * would unlock these"), and "17 loads exist that your van is not the right
   * class for" is not that. It is closer to the size of the market than to a
   * fact about this driver, it would dwarf the capacity figure on any real
   * board, and folding the two together would make the footer's "over your
   * vehicle capacity or dimensions" copy untrue of most of what it counts. If
   * product later wants "loads for other vehicle classes" surfaced, that is a
   * new field with its own copy, not a redefinition of this one.
   *
   * A driver with zero registered vehicles has an empty map, so every load is
   * `WRONG_CLASS` and `hiddenByCapacityCount` stays 0 — an empty board with no
   * misleading capacity note, which is the honest answer for an account that
   * has not registered a vehicle yet.
   *
   * **`UNDECLARED` maps to `ELIGIBLE`, and that is the point of measuring with
   * `classifyFit` rather than `loadFits`.** A load whose cargo envelope was
   * never declared has not been shown to exceed anything; it has only not been
   * described. Every claim route in the codebase already lets one through — see
   * `hasDeclaredEnvelope` — so hiding it here would advertise less work than the
   * platform will actually hand over, which is the precise divergence this
   * filter exists to close, running in the wrong direction. It also kept the
   * footer's capacity sentence honest only by accident: see
   * `LoadBoardResponse.hiddenByCapacityCount`.
   *
   * The class test still runs first and still applies to these loads. An
   * undeclared envelope makes a load unmeasurable, not unbooked: the client
   * still chose and paid for a vehicle class, and that promise is enforced
   * exactly as it is for every other load.
   */
  const eligibilityOf = (order: LoadRow): LoadEligibility => {
    const load = loadDimensionsOf(order);

    if (scope.kind === "BUSINESS") {
      const widest = widestByClass.get(order.vehicleTypeSpecId);

      if (widest === undefined) {
        return "WRONG_CLASS";
      }

      return classifyFit(load, widest) === "DOES_NOT_FIT"
        ? "OVER_CAPACITY"
        : "ELIGIBLE";
    }

    const classMatches = capabilitiesByClass.get(order.vehicleTypeSpecId);

    if (classMatches === undefined) {
      return "WRONG_CLASS";
    }

    // Strict, unlike the company branch: an individual driver claims with one
    // named vehicle (`POST /api/orders/[id]/accept` takes a `vehicleId`), so
    // the load must fit one of these outright — never a per-axis composite.
    return classifyFitAnyVehicle(load, classMatches) === "DOES_NOT_FIT"
      ? "OVER_CAPACITY"
      : "ELIGIBLE";
  };

  // --- Candidates.

  /**
   * "Assigned to me", as a query filter. Deliberately status-free: it is an
   * identity, used both to find this account's own work and (negated) to
   * exclude it from the just-claimed-by-someone-else window.
   */
  const myAssignmentFilter: Prisma.OrderWhereInput =
    scope.kind === "INDIVIDUAL"
      ? { driverId: scope.userId }
      : { companyId: scope.companyId };

  const claimedSince = new Date(Date.now() - CLAIMED_VISIBILITY_WINDOW_MS);

  // One `findMany` covering the open market, this account's own assignments and
  // the transient just-claimed window, classified afterwards in memory rather
  // than in a second round trip — the whole result set for one account is small
  // enough that an extra `where` branch to avoid one filter pass is not worth
  // the query complexity.
  //
  // The first branch names `status`, `driverId` and `companyId` together, which
  // is exactly the composite index `@@index([status, driverId, companyId])` was
  // added for: it is the board's hot query.
  //
  // `updatedAt` is safe to key the third branch on because the atomic claim
  // sets `status`, `driverId`/`companyId` and (via Prisma's `@updatedAt`)
  // `updatedAt` in one `updateMany` — so `updatedAt` on a freshly
  // CLAIMED/ACCEPTED row *is* the claim instant.
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { status: OrderStatus.PENDING, driverId: null, companyId: null },
        // Status-narrowed here, unlike the identity filter itself: a finished
        // or cancelled job is history that the classification below would drop
        // anyway, and fetching every one of them would make this query grow
        // without bound as an account completes work.
        // Spread into fresh arrays because Prisma's `in` takes a mutable
        // array; the constants stay `readonly` so nothing can quietly push a
        // fourth status onto the definition of "mine".
        { ...myAssignmentFilter, status: { in: [...MINE_STATUSES] } },
        {
          status: { in: [...CLAIMED_BY_OTHERS_STATUSES] },
          updatedAt: { gte: claimedSince },
          NOT: myAssignmentFilter,
        },
      ],
    },
    select: LOADS_SELECT,
    orderBy: { createdAt: "desc" },
  });

  const rejections = await prisma.loadRejection.findMany({
    where:
      scope.kind === "INDIVIDUAL"
        ? { driverProfileId: scope.driverProfileId }
        : { companyId: scope.companyId },
    select: { orderId: true },
  });
  const rejectedOrderIds = new Set(
    rejections.map((rejection) => rejection.orderId),
  );

  // --- Classification.

  const available: LoadBoardItem[] = [];
  const mine: LoadBoardItem[] = [];
  const rejected: LoadBoardItem[] = [];
  let hiddenByCapacityCount = 0;

  // `orderBy` above is newest-first and this loop preserves it, so all three
  // arrays come out newest-first without a second sort.
  for (const order of orders) {
    // One call, reused for both the bucket and the redaction: ownership and
    // contact entitlement are the same question and must never diverge.
    const isMine = canSeeStopContacts(order, scope);
    const isRejected = rejectedOrderIds.has(order.id);

    // Precedence matters for the "mine, and also rejected at some point in the
    // past" case: holding the job wins, because rejecting an order never
    // un-assigns it from whoever holds it.
    if (isMine && MINE_STATUSES.includes(order.status)) {
      mine.push(toLoadBoardItem(order, "mine", true, driverLocation));
      continue;
    }

    const isOpen =
      order.status === OrderStatus.PENDING &&
      order.driverId === null &&
      order.companyId === null;

    if (isOpen) {
      // Deliberately *not* fit-filtered, and deliberately counted toward
      // nothing: the rejected list is a record of what this account chose to
      // hide, not a live claimability check. A fleet that has changed since the
      // rejection surfaces the moment they hit Restore and the load either
      // reappears in `available` or does not — better than pre-emptively hiding
      // the Restore option.
      if (isRejected) {
        rejected.push(
          toLoadBoardItem(order, "available", isMine, driverLocation),
        );
        continue;
      }

      // The server-side eligibility filter — the class the client booked, then
      // the physical fit of the vehicles registered under it.
      //
      // Only the capacity failure is counted for the footer, and it counts only
      // loads a right-class vehicle was actually measured against and found too
      // small for. An order that declared no cargo envelope at all is neither
      // counted nor hidden: it was never measured, the claim routes accept it,
      // and the board now lists it. See `eligibilityOf`.
      //
      // A wrong-class load is dropped in silence — it is not "over your
      // capacity", and counting it would make the footer's copy untrue. Same
      // rule, same reason: this number is a claim about the driver's vehicle,
      // so nothing may be counted into it that the vehicle is not the reason
      // for. See `eligibilityOf`.
      const eligibility = eligibilityOf(order);

      if (eligibility !== "ELIGIBLE") {
        if (eligibility === "OVER_CAPACITY") {
          hiddenByCapacityCount += 1;
        }

        continue;
      }

      available.push(
        toLoadBoardItem(order, "available", isMine, driverLocation),
      );
      continue;
    }

    // The transient "just claimed by somebody else" window. Not eligibility-
    // filtered — the row exists so the board can grey out in place something it
    // was already showing, and re-testing class or capacity on the way out
    // would only make rows vanish that the driver is watching. A row that was
    // never eligible was never rendered, so nothing can appear here that the
    // board was not already showing. Rejection-filtered all the same:
    // a load this account has hidden has no business reappearing just because
    // somebody else claimed it.
    if (
      !isMine &&
      !isRejected &&
      CLAIMED_BY_OTHERS_STATUSES.includes(order.status) &&
      order.updatedAt >= claimedSince
    ) {
      available.push(toLoadBoardItem(order, "claimed", false, driverLocation));
      continue;
    }

    // Anything else — a terminal-status order of this account's, or work
    // belonging to somebody else outside the visibility window — is simply not
    // part of this board and is dropped.
  }

  return NextResponse.json<LoadBoardResponse>(
    { available, mine, rejected, hiddenByCapacityCount },
    { status: 200 },
  );
}
