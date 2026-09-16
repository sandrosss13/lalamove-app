import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import {
  bookedClassFor,
  dispatchVerdictFor,
  isDispatchApproved,
  type DispatchVerdict,
} from "@/lib/orders/dispatch-fit";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/logistics-company/orders/[id]/dispatch-options — everything the
 * dispatch dialog needs to let a fleet put a driver and a vehicle behind a load
 * it has already claimed.
 *
 * A company claim records `companyId` only and names no vehicle; naming one is
 * `POST .../dispatch`. This is that POST's read half: the fleet, each vehicle
 * pre-judged against *this* order by the very function the POST refuses with,
 * plus the driver roster for the dispatcher to override the paired driver.
 *
 * **The verdicts come from `dispatchVerdictFor`, not from a rule restated
 * here.** That is the entire reason this endpoint exists rather than the dialog
 * filtering `GET /api/logistics-company/vehicles` client-side. A second copy of
 * "may this vehicle take this load" would be free to drift from the handler that
 * decides, and the two directions of drift are both bad: a picker that offers a
 * vehicle the POST then bounces wastes a dispatcher's submit, and one that hides
 * a vehicle the POST would have accepted quietly shrinks the fleet. `GET
 * /api/loads` and the three claim routes already lived through exactly that
 * divergence (see `hasDeclaredEnvelope`), and the fix there was the same fix:
 * one exported predicate, read by every surface that asks.
 *
 * **Scoped exactly as the POST is, deliberately including the status.** Same
 * 401, same 403s with the same copy, same `{ id, companyId, status: CLAIMED }`
 * lookup answered with 404. Opening the dialog on an order this company did not
 * claim, or that is cancelled, or that has already been dispatched, therefore
 * fails the same way submitting it would — the alternative, a laxer read scope,
 * is a dialog that renders a full fleet picker for an order no vehicle can be
 * assigned to, and a refusal only after the dispatcher has chosen one.
 *
 * Read-only; nothing here writes. The 404-not-403 convention for another
 * company's order is the POST's and the roster endpoints', for their reason: a
 * 403 confirms the id exists, letting a caller enumerate a competitor's book.
 */

/** A driver as the dialog names one — the roster rows and the paired driver alike. */
type DispatchDriverOption = {
  /**
   * `User.id`, not `DriverProfile.id`. This is what `POST .../dispatch` takes as
   * `driverUserId` and what its roster lookup scopes on, so the value the dialog
   * submits is the value it was handed rather than one it had to map.
   */
  userId: string;
  name: string;
  isOnline: boolean;
};

/**
 * One vehicle in the picker: what to render, and whether it may be chosen.
 *
 * `capability` is the vehicle's *resolved* figures — its own declared
 * payload/dimensions, class catalogue as the per-field fallback — not the
 * catalogue row. Those are the numbers the verdict was reached from, so showing
 * the catalogue's instead would let the dialog display a limit the refusal was
 * not computed against.
 */
type DispatchVehicleOption = {
  vehicleId: string;
  plateNumber: string;
  /** `VehicleTypeSpec.label`, e.g. "Box Truck" — the class's display name. */
  classLabel: string;
  capability: {
    payloadKg: number;
    lengthM: number;
    widthM: number;
    /**
     * **`null` means UNBOUNDED (an open bed), never unknown.** `VehicleTypeSpec
     * .cargoHeightM` carries a `0` sentinel for a class with no cargo box —
     * seeded for `FLATBED_TRUCK` — which `capabilityOf` translates to `Infinity`,
     * and `Infinity` has no JSON representation: `JSON.stringify` emits `null`
     * for it silently. Rather than let that happen by accident, the translation
     * is made explicitly on the way out (see `serialisableHeight`), so this
     * field's `null` is a documented value with a meaning rather than a
     * serialisation artefact with two possible readings.
     *
     * **The client must translate back**, to `Infinity` or to a "no height
     * limit" label — whichever it needs — and must not render it as "—" or treat
     * it as a missing measurement. An open flatbed is the *least* restricted
     * vehicle in the fleet on this axis, and showing it as the most restricted
     * would invert the one figure a dispatcher uses to pick a truck for a tall
     * load.
     *
     * The other three axes are non-null because only height carries a sentinel:
     * `maxPayloadKg`, `cargoLengthM` and `cargoWidthM` have no documented `0`
     * meaning anywhere in the schema or the seed, and a `0` in them is a genuine
     * zero that fits nothing (see `capabilityOf`). Do not generalise this field's
     * nullability to them.
     */
    heightM: number | null;
  };
  /**
   * The driver currently holding this vehicle on an open `DriverVehicleAssignment`,
   * or null when nobody does — the dialog's pre-selected driver.
   *
   * A suggestion, not a constraint: the dispatcher may send any driver on the
   * roster, which is why `roster` is returned alongside. The pairing is the
   * fleet's own record of who drives what, so defaulting to it is right far more
   * often than not; overriding it is an ordinary action, not an exception.
   */
  pairedDriver: DispatchDriverOption | null;
  /**
   * Why this vehicle may or may not be dispatched against this order — the same
   * verdict, from the same function, that `POST .../dispatch` refuses on.
   *
   * `{ kind: "FITS" }` is the only choosable one. The rest are returned rather
   * than filtered out on purpose: a dispatcher looking for a truck needs to know
   * *why* the obvious one is unavailable ("not approved" sends them to review;
   * "too small for the booked class" does not), and a picker that simply omits
   * two thirds of a fleet is one a dispatcher cannot trust or act on.
   */
  verdict: DispatchVerdict;
};

/** The frozen response body. The dispatch dialog codes against exactly this. */
type DispatchOptionsResponse = {
  /** The whole fleet, newest first — never filtered by verdict. */
  vehicles: DispatchVehicleOption[];
  /**
   * Every driver on the company's roster, oldest first, for the dialog's
   * editable driver override. Unfiltered and unsorted by availability: `POST
   * .../dispatch` accepts any roster driver, so narrowing here would hide
   * choices the server permits.
   *
   * `isOnline` is carried so the dialog can mark an offline driver rather than
   * withhold them — dispatch does not require the driver to be online (that is
   * the individual-driver claim path's rule, not this one), so it is information
   * and not a gate.
   */
  roster: DispatchDriverOption[];
};

/**
 * `VehicleCapability.heightM` as JSON can carry it: a finite metre figure, or
 * `null` for an open bed with no height limit.
 *
 * **Written as a `Number.isFinite` test rather than `=== Infinity`.** The only
 * value `capabilityOf` produces here today is `Infinity`, but a `NaN` — from a
 * corrupt column, say — would also serialise to `null` under `JSON.stringify`,
 * and would do so without anyone choosing it. Folding every non-finite value
 * into the one documented `null` means the response never carries a number the
 * client cannot reason about, and the field means exactly one thing whatever
 * arrives on the vehicle row.
 */
function serialisableHeight(heightM: number): number | null {
  return Number.isFinite(heightM) ? heightM : null;
}

/** Flattens a driver profile join into the shape both `roster` and `pairedDriver` use. */
function toDriverOption(profile: {
  userId: string;
  isOnline: boolean;
  user: { name: string };
}): DispatchDriverOption {
  return {
    userId: profile.userId,
    name: profile.user.name,
    isOnline: profile.isOnline,
  };
}

export async function GET(
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

  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true, activatedAt: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // The activation gate, with the POST's copy verbatim. An unactivated fleet
  // cannot dispatch, so it must not be shown a dialog that implies it can —
  // and the sentence it reads here is the same one it would read on submit,
  // rather than a second phrasing of the same rule that could drift from it.
  if (company.activatedAt === null) {
    return NextResponse.json(
      {
        error:
          "Your fleet is still under review. Operations must activate the company before you can dispatch deliveries.",
      },
      { status: 403 },
    );
  }

  // Ownership *and* status, exactly as the POST scopes it. `status: CLAIMED` is
  // the load-bearing half: a cancelled or already-dispatched order is not
  // dispatchable, and reading its fleet options would offer a choice the submit
  // could never honour.
  //
  // The same select the POST takes, for the same consumers: `bodyType` and the
  // booked class's four capacity columns feed `dispatchVerdictFor` through
  // `bookedClassFor`, and the four cargo columns are the declared envelope.
  const order = await prisma.order.findFirst({
    where: { id, companyId: company.id, status: OrderStatus.CLAIMED },
    select: {
      id: true,
      bodyType: true,
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

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // The fleet, scoped by owner exactly as `GET /api/logistics-company/vehicles`
  // scopes it — but selected, not `include`d. That route returns raw Prisma rows;
  // this one returns the pre-shaped `DispatchVehicleOption`, so it asks for the
  // handful of columns the shape and the verdict actually need and nothing else.
  //
  // The capacity pair is both sources `capabilityOf` resolves between: this
  // vehicle's OWN declared figures, preferred per field, with the class spec as
  // the fallback. Selecting the spec alone would make the dialog systematically
  // stricter than the POST it feeds. `bodyTypes` is the one non-capacity spec
  // field (`offersBodyType`), `label` the one display field, and
  // `vehicleTypeSpecId` exists solely for `meetsBookedClass`'s identity clause.
  const fleet = await prisma.vehicle.findMany({
    where: { companyId: company.id },
    select: {
      id: true,
      plateNumber: true,
      vehicleTypeSpecId: true,
      payloadKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
      vehicleTypeSpec: {
        select: {
          label: true,
          maxPayloadKg: true,
          cargoLengthM: true,
          cargoWidthM: true,
          cargoHeightM: true,
          bodyTypes: true,
        },
      },
      // The review row, or null for a vehicle predating business applications.
      // Singular, because `BusinessApplicationVehicle.vehicleId` is `@unique`.
      applicationVehicle: { select: { status: true } },
      // The live pairing. `take: 1` is exact rather than defensive: the partial
      // unique index `driver_vehicle_assignment_live_vehicle_unique`
      // (prisma/migrations/20260829121728_add_business_fleet_onboarding) permits
      // at most one row per vehicle with a null `unassignedAt`, at the database
      // level. Closed assignments are kept rather than deleted, so the
      // `unassignedAt` filter is what separates "drives this today" from "drove
      // it last month".
      assignments: {
        where: { unassignedAt: null },
        take: 1,
        select: {
          driverProfile: {
            select: {
              userId: true,
              isOnline: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Built once for the whole fleet: it is a fact about the booking, and no
  // vehicle can change it. Through `bookedClassFor` rather than an object
  // literal over the four spec columns, because `capabilityOf` is the one place
  // a catalogue `cargoHeightM` of `0` becomes `Infinity` for an open bed — a
  // literal would give a flatbed booking a height floor of zero that every
  // vehicle trivially clears, and the dialog would offer the whole fleet for a
  // booking only an open bed can serve.
  const bookedClass = bookedClassFor(order);

  // Likewise hoisted: the declared envelope is the order's, not each vehicle's.
  const cargo = {
    weightKg: order.cargoWeightKg,
    lengthM: order.cargoLengthM,
    widthM: order.cargoWidthM,
    heightM: order.cargoHeightM,
  };

  const vehicles: DispatchVehicleOption[] = fleet.map((vehicle) => {
    // One call per vehicle, and the capability it resolved comes back with the
    // verdict rather than being recomputed for the response. `capabilityOf` is
    // cheap, but a second independent call is a second chance to be handed the
    // wrong spec and disagree with the first — so the figures the dialog
    // displays are, by construction, the figures the verdict was reached from.
    const { verdict, capability } = dispatchVerdictFor(
      {
        vehicleTypeSpecId: vehicle.vehicleTypeSpecId,
        approved: isDispatchApproved(vehicle.applicationVehicle),
        payloadKg: vehicle.payloadKg,
        cargoLengthM: vehicle.cargoLengthM,
        cargoWidthM: vehicle.cargoWidthM,
        cargoHeightM: vehicle.cargoHeightM,
        vehicleTypeSpec: vehicle.vehicleTypeSpec,
      },
      { bodyType: order.bodyType, cargo, bookedClass },
    );

    const assignment = vehicle.assignments[0];

    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      classLabel: vehicle.vehicleTypeSpec.label,
      capability: {
        payloadKg: capability.payloadKg,
        lengthM: capability.lengthM,
        widthM: capability.widthM,
        // The one axis that can arrive unbounded — see `serialisableHeight` and
        // `DispatchVehicleOption.capability.heightM`.
        heightM: serialisableHeight(capability.heightM),
      },
      pairedDriver: assignment
        ? toDriverOption(assignment.driverProfile)
        : null,
      verdict,
    };
  });

  // The roster, scoped and ordered exactly as `GET /api/logistics-company/drivers`
  // scopes and orders it, so the dialog's list and the roster screen's agree on
  // membership and on sequence. Narrowed to the three fields the picker renders:
  // a driver's phone, city and licence are not needed to name a row here, and an
  // endpoint should not hand out more than its consumer asked for.
  //
  // A paired driver is normally also a roster row — a company vehicle is
  // assigned from this same roster — but the two lists are read independently
  // and nothing here forces that. If a pairing survives a driver leaving the
  // roster (`DriverProfile.companyId` is `onDelete: SetNull`), `pairedDriver`
  // names someone `roster` does not contain, and the POST would refuse them.
  // Surfaced as-is rather than suppressed: hiding the stale pairing would leave
  // the dispatcher wondering why the vehicle has no default driver, where
  // showing a name the submit rejects at least points at the real problem.
  const roster = await prisma.driverProfile.findMany({
    where: { companyId: company.id },
    select: { userId: true, isOnline: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const body: DispatchOptionsResponse = {
    vehicles,
    roster: roster.map(toDriverOption),
  };

  return NextResponse.json(body, { status: 200 });
}
