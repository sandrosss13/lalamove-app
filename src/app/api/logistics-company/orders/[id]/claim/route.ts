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
  widestCapability,
  type LoadDimensions,
} from "@/lib/orders/vehicle-fit";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/logistics-company/orders/[id]/claim — a logistics company takes an
 * open delivery off the market (PENDING → CLAIMED) without yet naming a driver
 * or a vehicle; that happens at dispatch.
 *
 * The claim mirrors the driver-accept path: a single conditional `updateMany`
 * (status PENDING and no company in the `where`) rather than a read-then-write,
 * so two companies racing for the same order can't both succeed — the database
 * applies at most one update and `count` tells us whether this request won.
 *
 * No body: which vehicle fulfils the order is a dispatch decision, and pinning
 * one at claim time would only go stale while the order waits.
 *
 * This is also the load board's company claim path — deliberately extended in
 * place rather than duplicated into a board-specific endpoint. It already
 * performs the exact operation the board needs (atomic PENDING → CLAIMED,
 * `companyId` set, no vehicle named), and a second implementation of one atomic
 * transition would be two things to keep in sync forever for a distinction —
 * called from the board versus called from anywhere else — that does not change
 * what the operation does. Nothing about its existing 401/403/400/404/409
 * behaviour for non-board callers changed.
 *
 * `status === "CLAIMED"` *is* the "needs assignment" state the board's My Loads
 * view shows; no new column or status value is needed for it, because a claimed
 * order always has `companyId` set and `driverId` still null until dispatch.
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
      { error: "Only logistics companies can claim deliveries." },
      { status: 403 },
    );
  }

  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true, activatedAt: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Complete your company profile before claiming deliveries." },
      { status: 400 },
    );
  }

  // The same activation gate the dispatch endpoint applies, for the same reason:
  // `LogisticsCompany.activatedAt` is the single "is this fleet allowed on the
  // road" column, and hiding a button does nothing about a direct POST.
  //
  // Gating claim as well as dispatch is not belt-and-braces. A claim takes an
  // order *off the open market* into CLAIMED, where only its claimant can act on
  // it. A company that could claim but not dispatch would strand real deliveries
  // in a status nobody can move — worse than either gate on its own.
  if (company.activatedAt === null) {
    return NextResponse.json(
      {
        error:
          "Your fleet is still under review. Operations must activate the company before you can claim deliveries.",
      },
      { status: 403 },
    );
  }

  // Distinguish "no such order" (404) from "already taken / not pending" (409):
  // the conditional update alone can't tell them apart, so check existence first.
  //
  // `reference` is read here so the 409 below can name the load for the board's
  // dedicated "just claimed" dialog. Reading it from this pre-claim lookup
  // rather than re-querying after a failed `updateMany` is correct, not stale:
  // `reference` never changes after the order is created. The cargo columns feed
  // the physical fit re-check below.
  //
  // **`bodyType` and the booked class's four capacity columns replace the bare
  // `vehicleTypeSpecId` this route used to filter the fleet by.** The class id
  // was only ever used to look for an exact-class vehicle; what the substitution
  // rule below needs instead is the *floor* that class sets — its payload and
  // three hold dimensions — plus the body the client asked for.
  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
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

  if (!existing) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Claiming a job the fleet cannot fulfil would strand it in CLAIMED with no
  // dispatchable vehicle, so eligibility is established up front — the same rule
  // the dispatch endpoint then re-checks against the single chosen vehicle.
  //
  // **This query no longer narrows by `vehicleTypeSpecId`, and that is the whole
  // change.** It used to ask "does this company own a vehicle of exactly the
  // class the client booked", which read the booking form's step 5 — titled
  // *"Recommended vehicle"* — as a guarantee that one specific model turns up.
  // The class is a recommendation and a pricing basis: it sets the floor the
  // client is owed, not a model number to match. A client booked an MPV (400 kg,
  // 1.8 x 1.3 x 1.1 m, DRY_BOX) and a fleet holding a Minivan (500 kg,
  // 2 x 1.4 x 1.3 m, DRY_BOX) — larger on every axis, same body — was refused
  // over two differing cuids, on an order no MPV exists on the platform to serve.
  //
  // The replacement asks "does this company own ANY vehicle that satisfies the
  // upgrade rule for this order", which is not expressible as a Prisma `where`:
  // it compares four capacity figures that are resolved per vehicle
  // (driver-declared value, class spec as the per-field fallback) against four
  // more from the *order's* class, plus an array membership test. So the fleet's
  // capability slices are fetched and the rule is evaluated in application code —
  // exactly how `GET /api/loads` does it, against the same shared helpers, which
  // is what stops the board offering a load this route then refuses.
  //
  // `findMany`, not `findFirst`, for the reason it already was: `capabilityOf`
  // resolves each vehicle's OWN declared capacity, so two trucks of one class no
  // longer necessarily resolve to the same figures. `bodyTypes` joins the four
  // capacity columns in the spec select because the body a class offers is not a
  // capacity figure and no amount of payload substitutes for it.
  const fleet = await prisma.vehicle.findMany({
    where: { companyId: company.id },
    select: {
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

  // The floor the client paid for. Built with `specCapability` rather than a
  // literal over the four spec columns because `capabilityOf` is the one place
  // `cargoHeightM: 0` is translated to `Infinity` for an open bed — a literal
  // would give a flatbed booking a height floor of zero that every vehicle on the
  // platform trivially clears, turning the strictest class in the catalogue into
  // the most substitutable one.
  const bookedClass = specCapability(existing.vehicleTypeSpec);

  // Which of this fleet's vehicles could actually fulfil the booking: the right
  // body, and at or above the booked class on all four axes. Never smaller than
  // what the client paid for — the substitution rule is upgrade-only.
  //
  // The body filter runs first, on the raw row, because it reads the spec
  // directly and a vehicle with the wrong load space is out however large it is;
  // the survivors are then resolved to capabilities and measured against the
  // floor.
  const eligibleCapabilities = fleet
    .filter((vehicle) =>
      offersBodyType(vehicle.vehicleTypeSpec.bodyTypes, existing.bodyType),
    )
    .map((vehicle) => capabilityOf(vehicle, vehicle.vehicleTypeSpec))
    .filter((capability) => meetsBookedClass(capability, bookedClass));

  // `widestCapability` returns null for an empty list and only for an empty list,
  // so the "no vehicle that can fulfil this" 400 and the capability the fit check
  // needs fall out of one expression rather than two checks that could drift
  // apart. Only the *eligible* subset is widened, which is what keeps the
  // optimism below honest: every capability folded in already meets the booked
  // class, so the composite it produces does too.
  const fleetCapability = widestCapability(eligibleCapabilities);

  if (fleetCapability === null) {
    return NextResponse.json(
      {
        error:
          "Your fleet has no vehicle big enough for the vehicle class this delivery was booked as, in the load space it needs.",
      },
      { status: 400 },
    );
  }

  // A second, independent check alongside the substitution rule above, and it
  // does not overlap it: that rule asks whether any vehicle here is at least the
  // class the client bought, this one asks whether *this particular load* fits
  // inside one. A fleet can clear the booked class comfortably and still be too
  // small for a load that was itself oversized for that class. The board
  // applies its own physical fit filter at listing time, but that filter runs
  // against a snapshot: the load could be re-weighed, the fleet could change, or
  // a caller could hit this endpoint directly and bypass the board entirely. A
  // listing is a snapshot; this request is what commits, so fit is re-checked
  // here.
  //
  // **`capabilityOf` + `widestCapability` + `loadFits` from
  // `src/lib/orders/vehicle-fit.ts`, the same trio `GET /api/loads` filters a
  // company's board with — deliberately the one and only definition of "fits" in
  // the codebase.** This route previously carried its own copy that measured the
  // load against `VehicleTypeSpec` alone, and that divergence was not academic:
  // `model Vehicle` in `prisma/schema.prisma` records a submit-time check
  // forcing a declared `payloadKg` to be at or above its class spec's
  // `maxPayloadKg` (read that block for the current, authoritative statement of
  // what these columns mean — it is amended as their use grows, so it is pointed
  // at here rather than quoted). Declared capacity is therefore systematically
  // at or above the spec, so a spec-only re-check is systematically stricter
  // than the board: a dispatcher clicks Claim on a load the board showed them
  // and gets a 400. One shared predicate is the only way that stays fixed.
  //
  // `widestCapability` is the per-axis maximum across the trucks eligible to
  // fulfil this booking (see the substitution filter above, which replaced the
  // old exact-class one),
  // and is knowingly optimistic in the same way the board is — see its own doc
  // comment. That optimism is right for a claim: the company names a real
  // vehicle at dispatch and sees any mismatch there, at a desk, before anything
  // rolls. Being *stricter* than the board is the failure that costs a
  // dispatcher a refusal on a load they were just offered.
  //
  // That last sentence is a promise about another file, so: it is kept in
  // `POST /api/logistics-company/orders/[id]/dispatch`, which re-runs
  // `capabilityOf` + `loadFits` against the single vehicle being assigned and
  // refuses with a 400 if the load does not fit *it*. That check did not exist
  // when this comment was first written, which made the optimism here
  // unbacked — a fleet whose heaviest truck is not its longest could claim a
  // load and dispatch a truck that could not carry it, with nothing catching it
  // until the driver reached the dock. If the dispatch re-check is ever removed,
  // this optimism has to go with it: swap `widestCapability` for
  // `fitsAnyVehicle`, which admits only loads a single real truck can take.
  //
  // **The null pre-check is `hasDeclaredEnvelope` from that same module, and it
  // is no longer an asymmetry with the listing.** `loadFits` resolves a null
  // load dimension to "does not fit", which would be wrong for *this* route: it
  // is also the legacy claim path, it predates cargo capture and has always
  // claimed orders with null weight and dimensions, and applying that rule here
  // would make every one of those orders permanently unclaimable by the same
  // endpoint that has always claimed them. So an order with no declared cargo AT
  // ALL skips the check (nothing to measure), and an order that declares any
  // cargo is measured by `loadFits` exactly as the board measures it — including
  // its all-or-nothing rule, under which a partially declared load does not fit.
  //
  // `GET /api/loads` used to hide from a fleet's board the very orders this
  // route would have claimed for it, and count them into the footer's capacity
  // note while doing so. It now asks the same exported predicate this line does,
  // so the board and this route cannot drift apart again — see
  // `hasDeclaredEnvelope` and `LoadFitVerdict`.
  const declaredCargo: LoadDimensions = {
    weightKg: existing.cargoWeightKg,
    lengthM: existing.cargoLengthM,
    widthM: existing.cargoWidthM,
    heightM: existing.cargoHeightM,
  };

  if (
    hasDeclaredEnvelope(declaredCargo) &&
    !loadFits(declaredCargo, fleetCapability)
  ) {
    return NextResponse.json(
      {
        // "Eligible", not "of this type": the vehicles measured here are the ones
        // that satisfy the substitution rule, which is no longer one class.
        error:
          "None of your fleet's eligible vehicles can carry this load's cargo — it exceeds the weight or size limit.",
      },
      { status: 400 },
    );
  }

  // Atomic claim: only rows that are still PENDING and unclaimed are updated.
  const { count } = await prisma.order.updateMany({
    where: { id, status: OrderStatus.PENDING, companyId: null },
    data: { companyId: company.id, status: OrderStatus.CLAIMED },
  });

  // Losing the race is the one failure a well-behaved concurrent client has to
  // branch on, so it carries a machine-readable `code` and the load's
  // `reference` — the board's dedicated "just claimed by someone else" dialog
  // names the load, and a cuid is not something a dispatcher can recognise. The
  // other failures on this route keep their plain `{ error }` shape: only the
  // responses a client actually branches on get a `code`.
  if (count === 0) {
    return NextResponse.json(
      {
        error: "This load was just claimed by someone else.",
        code: "ALREADY_CLAIMED",
        reference: existing.reference,
      },
      { status: 409 },
    );
  }

  // Carrier-only response — see `CARRIER_ORDER_PARTY_SELECT`'s doc comment;
  // never `ORDER_PARTY_SELECT` here. The company is the carrier on the order it
  // just claimed, entitled to its own payout and to nothing about what the
  // client paid to get it — the board has no role-specific UI, so a company sees
  // exactly what a driver sees, and that is the correct answer rather than a
  // convenient one.
  //
  // This used to be `{ ...ORDER_PARTY_SELECT, price: false }`, which looked like
  // the redaction and was not one: `price` is `baseFare + distanceFare +
  // timeFare + helperFee` floored at the rule's `minimumFare`, and all four of
  // those stayed in the response alongside `overtimeFee` and
  // `serviceLevelAdjustment`. The seven money columns have to leave together.
  //
  // `handlingTags` is the one field added on top, and it is not money: the
  // confirm dialog warns about a HAZMAT load with it — a warning only, since
  // `DriverLicence` has no certification field anywhere in the schema, so
  // nothing here gates a hazmat claim and nothing should until that field and
  // the onboarding capture behind it exist.
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      ...CARRIER_ORDER_PARTY_SELECT,
      handlingTags: true,
    },
  });
  return NextResponse.json(order, { status: 200 });
}
