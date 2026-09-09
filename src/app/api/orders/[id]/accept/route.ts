import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { CARRIER_ORDER_PARTY_SELECT } from "@/lib/order-response-select";
import {
  capabilityOf,
  loadFits,
  type LoadDimensions,
} from "@/lib/orders/vehicle-fit";
import { prisma } from "@/lib/prisma";

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 */
function parseAcceptOrderBody(
  body: unknown,
): { data: { vehicleId: string } } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const { vehicleId } = body as Record<string, unknown>;

  if (typeof vehicleId !== "string" || vehicleId.trim() === "") {
    return { error: "vehicleId is required." };
  }

  return { data: { vehicleId: vehicleId.trim() } };
}

/**
 * POST /api/orders/[id]/accept — an *independent* driver claims a pending,
 * unassigned order with one of their registered vehicles, recorded on the order.
 *
 * Drivers on a company's roster never reach the assignment here: their company
 * claims the order and dispatches it to them, so accepting directly is rejected
 * rather than treated as a second, parallel way in.
 *
 * The claim is done with a single conditional `updateMany` (status PENDING and
 * driverId null in the `where`) rather than a read-then-write, so two drivers
 * racing for the same order can't both succeed: the database applies at most one
 * update and `count` tells us whether this request won.
 *
 * The vehicle is looked up scoped to the caller's own profile, and a vehicle
 * belonging to someone else is reported as 404 rather than 403 — the same
 * reasoning as DELETE /api/driver-profile/vehicles/[id]: a 403 would confirm
 * that the id exists, letting a caller enumerate other drivers' vehicles.
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

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers can accept deliveries." },
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

  const parsed = parseAcceptOrderBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { vehicleId } = parsed.data;
  const { id } = await params;

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, companyId: true, activatedAt: true, isOnline: true },
  });

  if (!driverProfile) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  if (driverProfile.companyId !== null) {
    return NextResponse.json(
      {
        error:
          "Drivers who belong to a company receive deliveries through their company's dispatch, not by accepting directly.",
      },
      { status: 403 },
    );
  }

  // A driver whose onboarding application has not been approved cannot claim
  // work. Kept distinct from the company-affiliation 403 above: the two are
  // different problems with different remedies.
  if (driverProfile.activatedAt === null) {
    return NextResponse.json(
      {
        error:
          "Your account isn't approved yet. Finish onboarding to accept deliveries.",
      },
      { status: 403 },
    );
  }

  // Browsing the board doesn't require being online — a driver plans their day
  // before starting it, checking what work exists and what it pays before
  // deciding whether to go online at all. Claiming does: a claim commits the
  // order to this driver right now, and `isOnline` is the one signal the product
  // has that they are actually available to act on it.
  //
  // 403 rather than 409 because this is a fact about the caller's own account
  // state — the same class of condition as the roster and activation gates
  // immediately above — not a conflict with what another request just did. The
  // `code` is here, and not on those two, precisely because this one is
  // recoverable: the UI offers "go online and retry" rather than their dead end.
  if (!driverProfile.isOnline) {
    return NextResponse.json(
      {
        error: "You're offline. Go online to claim loads.",
        code: "DRIVER_OFFLINE",
      },
      { status: 403 },
    );
  }

  // Distinguish "no such order" (404) from "already taken / not pending" (409):
  // the conditional update alone can't tell them apart, so check existence first.
  // The order's own vehicle type is what the chosen vehicle has to match, and
  // its cargo columns are what the physical fit re-check below measures.
  //
  // `reference` is read here so the 409 below can name the load for the UI's
  // dedicated "just claimed" dialog. Reading it from this pre-claim lookup
  // rather than re-querying after a failed `updateMany` is correct, not stale:
  // `reference` never changes after the order is created.
  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      vehicleTypeSpecId: true,
      cargoWeightKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Scoped by owner, so this returns nothing for another driver's vehicle.
  //
  // Both capacity sources are selected because `capabilityOf` needs both: the
  // vehicle's OWN driver-declared `payloadKg`/`cargoLengthM`/`cargoWidthM`/
  // `cargoHeightM`, preferred per field, with the class spec as the fallback
  // wherever one is null. Selecting the spec alone would silently make this
  // route stricter than the board that sent the driver here — see the fit
  // re-check below.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, driverProfileId: driverProfile.id },
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
        },
      },
    },
  });

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  if (vehicle.vehicleTypeSpecId !== existing.vehicleTypeSpecId) {
    return NextResponse.json(
      {
        error: "This vehicle's type doesn't match what this delivery requires.",
      },
      { status: 400 },
    );
  }

  // A second, independent check alongside the type match above. The board
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
  // **The null pre-check is a deliberate asymmetry with the listing, not an
  // oversight.** `loadFits` resolves a null load dimension to "does not fit",
  // which is right for a *listing* — hiding a load of unknown size costs nobody
  // anything, while sending a driver to one that turns out not to fit costs them
  // the trip. It is wrong for *this* route, which is also the legacy claim path
  // behind `GET /api/orders`: that endpoint predates cargo capture and still
  // returns every legacy `PENDING` order with null weight and dimensions, and
  // applying the listing's rule here would make every one of those orders
  // permanently unclaimable by the same endpoint that has always claimed them.
  // So an order with no declared cargo AT ALL skips the check (nothing to
  // measure), and an order that declares any cargo is measured by `loadFits`
  // exactly as the board measures it — including its all-or-nothing rule, under
  // which a partially declared load does not fit. That case cannot strand a
  // board user, because the board never lists such a load either.
  const declaredCargo: LoadDimensions = {
    weightKg: existing.cargoWeightKg,
    lengthM: existing.cargoLengthM,
    widthM: existing.cargoWidthM,
    heightM: existing.cargoHeightM,
  };

  const hasDeclaredCargo =
    declaredCargo.weightKg !== null ||
    declaredCargo.lengthM !== null ||
    declaredCargo.widthM !== null ||
    declaredCargo.heightM !== null;

  if (
    hasDeclaredCargo &&
    !loadFits(declaredCargo, capabilityOf(vehicle, vehicle.vehicleTypeSpec))
  ) {
    return NextResponse.json(
      {
        error:
          "This vehicle can't carry this load's cargo — it exceeds the weight or size limit.",
      },
      { status: 400 },
    );
  }

  // Atomic claim: only rows that are still PENDING and unassigned are updated.
  const { count } = await prisma.order.updateMany({
    where: { id, status: OrderStatus.PENDING, driverId: null },
    data: {
      driverId: session.user.id,
      vehicleId: vehicle.id,
      status: OrderStatus.ACCEPTED,
    },
  });

  // Losing the race is the one failure a well-behaved concurrent client has to
  // branch on, so it carries a machine-readable `code` and the load's
  // `reference` — the board's dedicated "just claimed by another driver" dialog
  // names the load, and a cuid is not something a driver can recognise. The
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
  // never `ORDER_PARTY_SELECT` here. Every caller of this route is a driver
  // (`session.user.role === "DRIVER"`, checked at the top of the handler), and a
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
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      ...CARRIER_ORDER_PARTY_SELECT,
      handlingTags: true,
    },
  });
  return NextResponse.json(order, { status: 200 });
}
