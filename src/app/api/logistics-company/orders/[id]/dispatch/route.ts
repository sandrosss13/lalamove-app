import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { CARRIER_ORDER_PARTY_SELECT } from "@/lib/order-response-select";
import { specCapability } from "@/lib/orders/booking-fit";
import {
  meetsBookedClass,
  offersBodyType,
} from "@/lib/orders/class-substitution";
import {
  capabilityOf,
  hasDeclaredEnvelope,
  loadFits,
  type LoadDimensions,
} from "@/lib/orders/vehicle-fit";
import { prisma } from "@/lib/prisma";

/** Validated shape of a dispatch request body. */
type DispatchInput = {
  driverUserId: string;
  vehicleId: string;
};

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 */
function parseDispatchBody(
  body: unknown,
): { data: DispatchInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const { driverUserId, vehicleId } = body as Record<string, unknown>;

  if (typeof driverUserId !== "string" || driverUserId.trim() === "") {
    return { error: "driverUserId is required." };
  }

  if (typeof vehicleId !== "string" || vehicleId.trim() === "") {
    return { error: "vehicleId is required." };
  }

  return {
    data: { driverUserId: driverUserId.trim(), vehicleId: vehicleId.trim() },
  };
}

/**
 * POST /api/logistics-company/orders/[id]/dispatch — a company assigns one of
 * its claimed deliveries to a driver on its roster, in one of its own fleet
 * vehicles (CLAIMED → ACCEPTED). From here the delivery behaves exactly like one
 * an independent driver accepted: the assigned driver starts and completes it.
 *
 * Every lookup is scoped to the caller's own company, so an order, driver or
 * vehicle belonging to someone else is reported as 404 rather than 403 — the
 * same reasoning as the roster and fleet endpoints: a 403 would confirm the id
 * exists, letting a caller enumerate a competitor's fleet and staff.
 *
 * The write itself is a plain `update` rather than a conditional `updateMany`:
 * the CLAIMED-by-this-company lookup above already establishes exclusive
 * ownership, so there is no second claimant to race with.
 *
 * **This is where the fleet's optimism is settled.** The claim endpoint admits a
 * load against `widestCapability` — the per-axis maximum across the company's
 * type-matching trucks, which describes a composite vehicle that may not exist
 * (see that function's own doc comment) — on the explicit promise that the
 * company names a real vehicle here and any mismatch is caught at a desk before
 * anything rolls. This handler is the other half of that promise: it re-checks
 * the declared cargo against the capability of the vehicle actually being
 * assigned.
 *
 * The success response carries no client money at all — not `Order.price` and
 * not the fare components it is built from. See the select at the bottom of this
 * handler for why.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can dispatch deliveries." },
      { status: 403 },
    );
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

  const parsed = parseDispatchBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { driverUserId, vehicleId } = parsed.data;
  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true, activatedAt: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // The activation gate. `LogisticsCompany.activatedAt` is set only by the admin
  // activate endpoint, which refuses unless the company's details are verified
  // and at least one vehicle is approved — so this one column is the whole
  // "is this fleet allowed on the road" question, and the "at least one approved
  // vehicle" half of the requirement is enforced there rather than re-derived
  // here. Checked server-side and not only in the dashboard, because hiding a
  // button does nothing about a direct POST.
  //
  // A 403 with a specific message, unlike the 404s around it: those conceal
  // whether another company's id exists, whereas this is a fact about the
  // caller's *own* company and there is nothing to hide.
  if (company.activatedAt === null) {
    return NextResponse.json(
      {
        error:
          "Your fleet is still under review. Operations must activate the company before you can dispatch deliveries.",
      },
      { status: 403 },
    );
  }

  // Scoped by ownership *and* status: an order this company hasn't claimed, or
  // has already dispatched, is not dispatchable and is reported as missing.
  //
  // The cargo columns feed the physical fit re-check further down — the load has
  // to fit the vehicle this request names, not merely the widest set of figures
  // the fleet could muster at claim time.
  //
  // **`bodyType` and the booked class's four capacity columns replace the bare
  // `vehicleTypeSpecId` this route used to compare the assigned vehicle against.**
  // Nothing checks class ids for equality any more; what the substitution rule
  // below needs is the floor that class sets and the body the client asked for.
  const order = await prisma.order.findFirst({
    where: { id, companyId: company.id, status: OrderStatus.CLAIMED },
    select: {
      id: true,
      bodyType: true,
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

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Scoped by roster membership, so this returns nothing for an independent
  // driver or one on another company's roster.
  const driverProfile = await prisma.driverProfile.findFirst({
    where: { userId: driverUserId, companyId: company.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  }

  // Scoped by owner, so this returns nothing for another company's vehicle or
  // for one owned by an independent driver.
  //
  // Both capacity sources are selected because `capabilityOf` needs both: this
  // vehicle's OWN driver-declared `payloadKg`/`cargoLengthM`/`cargoWidthM`/
  // `cargoHeightM`, preferred per field, with the class spec as the fallback
  // wherever one is null. Selecting the spec alone would make this route
  // systematically stricter than the claim that preceded it — `model Vehicle`
  // records a submit-time check forcing a declared `payloadKg` to be at or above
  // its class spec's `maxPayloadKg` — and refuse dispatches for loads the fleet
  // can genuinely take. The accept route selects exactly this pair for exactly
  // this reason.
  //
  // `vehicleTypeSpec.bodyTypes` is selected for the substitution check below and
  // is the one field here that is not a capacity figure: it is which load spaces
  // this vehicle's class offers, which no amount of payload stands in for.
  // `vehicleTypeSpecId` is deliberately no longer selected — nothing compares
  // class ids any more.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, companyId: company.id },
    select: {
      id: true,
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
      // The review row for this vehicle, or null for a vehicle that predates
      // business applications (admin-created, or added through the fleet form).
      // Singular, because `BusinessApplicationVehicle.vehicleId` is `@unique`.
      applicationVehicle: { select: { status: true } },
    },
  });

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  // A vehicle that went through a fleet application has to have been approved:
  // the fleet is cleared vehicle by vehicle, so an activated company can still
  // hold a flagged or unreviewed one.
  //
  // A vehicle with no review row at all is grandfathered — there is no column on
  // `Vehicle` to backfill a verdict onto, and manufacturing review rows for
  // vehicles no reviewer ever looked at would fabricate a compliance record. The
  // null case can never be produced by the new flow: the onboarding submit
  // creates a `BusinessApplicationVehicle` for every vehicle in the same
  // transaction that creates the vehicle itself.
  //
  // Placed before the substitution checks below so a vehicle that is both
  // unapproved and unfit for the booking is reported as unapproved. 400 rather
  // than 403: this is a fact about the vehicle named in the request body, which
  // is a bad-request condition alongside those refusals.
  if (
    vehicle.applicationVehicle !== null &&
    vehicle.applicationVehicle.status !== "APPROVED"
  ) {
    return NextResponse.json(
      {
        error:
          "This vehicle hasn't been approved yet. Only approved vehicles can be dispatched.",
      },
      { status: 400 },
    );
  }

  // Resolved once and used by both the substitution rule and the cargo fit below:
  // this vehicle's own declared capacity, class spec as the per-field fallback.
  const vehicleCapability = capabilityOf(vehicle, vehicle.vehicleTypeSpec);

  // **The booked class is a floor, not an identity.** This was
  // `vehicle.vehicleTypeSpecId !== order.vehicleTypeSpecId` — a dispatcher could
  // only ever assign a vehicle of the one exact class the client picked — which
  // read the booking form's step 5, titled *"Recommended vehicle"*, as a
  // guarantee that one specific model turns up. It never was one: the class is
  // what the fare was quoted on and the minimum the client is owed, so the
  // promise forbids assigning *less* than they paid for and nothing more. A
  // client booked an MPV (400 kg, 1.8 x 1.3 x 1.1 m, DRY_BOX) and a Minivan
  // (500 kg, 2 x 1.4 x 1.3 m, DRY_BOX) that beats it on every axis could not be
  // assigned, on an order no MPV exists on the platform to serve.
  //
  // The same two tests the claim route applies to the fleet, applied here to the
  // one vehicle being assigned, so a dispatcher cannot assign a vehicle that
  // could not have claimed the load. They are two tests because a bigger hold is
  // not the same promise as the right *kind* of hold: `meetsBookedClass` is the
  // four-axis floor, `offersBodyType` is the load space (a null `bodyType` on the
  // order asked for no particular body and imposes no requirement).
  //
  // Both come from `@/lib/orders/class-substitution`, read by `GET /api/loads`
  // and both claim routes as well — one definition of "may this vehicle fulfil
  // this booking", for the same reason `vehicle-fit.ts` is one definition of
  // "fits". The booked side goes through `specCapability` and never through the
  // four spec columns read by hand, because `capabilityOf` is where
  // `cargoHeightM: 0` becomes `Infinity` for an open bed; a literal would give a
  // flatbed booking a height floor of zero that anything clears.
  const bookedClass = specCapability(order.vehicleTypeSpec);

  if (!meetsBookedClass(vehicleCapability, bookedClass)) {
    return NextResponse.json(
      {
        error:
          "This vehicle is smaller than the vehicle class this delivery was booked as. Assign one that matches or beats it on payload, length, width and height.",
      },
      { status: 400 },
    );
  }

  if (!offersBodyType(vehicle.vehicleTypeSpec.bodyTypes, order.bodyType)) {
    return NextResponse.json(
      {
        error:
          "This vehicle doesn't offer the load space this delivery needs. Assign one that does.",
      },
      { status: 400 },
    );
  }

  // A third, independent check alongside the two substitution tests above — and
  // the one the claim endpoint's optimism was sold against.
  //
  // **Clearing the booked class is not a fit check.** The substitution rule says
  // the company sent a vehicle at least as big as the *class* the client booked
  // and offering the right body; it says nothing about whether this particular
  // truck can carry this particular load. The two came apart the moment
  // `capabilityOf` started resolving each vehicle's own declared `payloadKg` and
  // hold dimensions ahead of its class figures — two trucks of one class no
  // longer have the same capacity — and they stay apart under substitution for a
  // second reason: a load can be oversized for the class it was booked as, in
  // which case a vehicle that merely meets that class still cannot take it.
  //
  // That gap had a concrete victim. `POST .../claim` filters the load against
  // `widestCapability` — the per-axis maximum across the fleet's type-matching
  // trucks — which knowingly describes a composite vehicle that may not exist:
  // in a two-truck fleet whose heaviest truck is not its longest, it reports the
  // heavy truck's payload beside the long truck's length. That optimism is right
  // for a claim, and its own doc comment justifies it by promising this handler
  // catches the mismatch: *"the company names a real vehicle at dispatch and
  // sees any mismatch there, at a desk, before anything rolls."* Until now no
  // such check existed, so the composite vehicle went unchallenged all the way
  // to the dock and the driver discovered it there — the exact failure
  // `loadFits` was written to prevent, with the fuel and the wasted trip already
  // spent. This block is that promise, kept.
  //
  // Same trio as `GET /api/loads`, the accept route and the claim route:
  // `capabilityOf` + `loadFits` from `src/lib/orders/vehicle-fit.ts`, the one
  // and only definition of "fits" in the codebase. Refusing here costs a
  // dispatcher one re-assignment at a desk, which is precisely the cheap failure
  // the claim endpoint traded for.
  //
  // **The null pre-check is `hasDeclaredEnvelope`, the same exported predicate
  // the claim and accept routes and the board all read, for the same reason.**
  // `loadFits` resolves a null load dimension to "does not fit", which is wrong
  // here: this is also the legacy dispatch path, and every order claimed before
  // cargo capture existed has null weight and dimensions. Applying that rule
  // would strand all of them in CLAIMED, undispatchable by the same endpoint
  // that has always dispatched them. So an order with no declared cargo AT ALL
  // skips the check (there is nothing to measure), and an order declaring any
  // cargo is measured exactly as the board measures it — including the
  // all-or-nothing rule under which a partially declared load does not fit. That
  // case cannot strand a dispatcher, because the claim route applies the
  // identical rule one step earlier.
  //
  // Written out inline in all four places until `GET /api/loads` was found to
  // have quietly disagreed with the other three — listing nothing where they
  // claimed happily. One exported predicate is what keeps that fixed.
  const declaredCargo: LoadDimensions = {
    weightKg: order.cargoWeightKg,
    lengthM: order.cargoLengthM,
    widthM: order.cargoWidthM,
    heightM: order.cargoHeightM,
  };

  if (
    hasDeclaredEnvelope(declaredCargo) &&
    !loadFits(declaredCargo, vehicleCapability)
  ) {
    return NextResponse.json(
      {
        error:
          "This vehicle can't carry this load's cargo — it exceeds the weight or size limit. Assign a vehicle that can.",
      },
      { status: 400 },
    );
  }

  // Carrier-only response — see `CARRIER_ORDER_PARTY_SELECT`'s doc comment;
  // never `ORDER_PARTY_SELECT` here. The company is the carrier on the order it
  // is dispatching, entitled to its own payout and to nothing about what the
  // client paid to get it.
  const updated = await prisma.order.update({
    where: { id },
    data: {
      driverId: driverUserId,
      vehicleId: vehicle.id,
      status: OrderStatus.ACCEPTED,
    },
    select: CARRIER_ORDER_PARTY_SELECT,
  });

  return NextResponse.json(updated, { status: 200 });
}
