import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import {
  bookedClassFor,
  dispatchVerdictFor,
  isDispatchApproved,
  rankDispatchVehicles,
  type DispatchVerdict,
} from "@/lib/orders/dispatch-fit";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/logistics-company/orders/[id]/dispatch-options — everything the
 * dispatch dialog needs to let a fleet put a vehicle behind a load it has
 * already claimed.
 *
 * A company claim records `companyId` only and names no vehicle; naming one is
 * `POST .../dispatch`. This is that POST's read half: the fleet, each vehicle
 * pre-judged against *this* order by the very function the POST refuses with,
 * ordered so the truck the platform recommends leads the list.
 *
 * **One choice, not two.** Every vehicle carries its own driver — the live
 * `DriverVehicleAssignment` — so picking a vehicle picks a driver, and the
 * dialog's separate driver override is gone. That is why this response no longer
 * carries a `roster`: it existed solely to populate that override, and the
 * driver the POST is submitted with is now always `pairedDriver.userId` off the
 * chosen vehicle. The consequence is that a vehicle nobody is paired with cannot
 * be dispatched at all, however well it fits — there is no id to send for it —
 * which is a rule this endpoint states in the data it returns rather than one
 * the dialog invents; see `DispatchVehicleOption.recommended`.
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

/** A driver as the dialog names one: the driver paired with a fleet vehicle. */
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
   * The driver currently holding this vehicle on an open `DriverVehicleAssignment`
   * *and* still on this company's roster — **the driver this vehicle dispatches
   * with, and the only one.**
   *
   * Null therefore means "no driver this company can dispatch", which is
   * slightly wider than "no assignment": a pairing to a driver who has since
   * been removed from the roster also lands here, because the submit would
   * refuse that id. See the `assignments` select for why the two must agree.
   *
   * A constraint, not a suggestion. The dialog used to render this as a default
   * inside an editable roster select; that select is gone, because a fleet's own
   * record of who drives what is the answer in every case anyone could name, and
   * an override that is almost never the right choice is mostly a way to send
   * the wrong driver. So `pairedDriver.userId` is what the client submits as the
   * POST's `driverUserId`, and `null` here means the vehicle cannot be
   * dispatched at all — there is no id to send. The client shows such a vehicle
   * disabled, with "No driver assigned" as the reason, rather than hiding it:
   * the remedy (pair a driver on the Drivers screen) is one the dispatcher can
   * act on, and a truck that silently vanished from the fleet list is not.
   *
   * `isOnline` is carried so the dialog can mark an offline driver rather than
   * withhold them. Dispatch does not require the driver to be online — that is
   * the individual-driver claim path's rule, not this one — so it is information
   * and not a gate.
   */
  pairedDriver: DispatchDriverOption | null;
  /**
   * Why this vehicle may or may not be dispatched against this order — the same
   * verdict, from the same function, that `POST .../dispatch` refuses on.
   *
   * `{ kind: "FITS" }` is the only choosable one, and it is necessary rather
   * than sufficient: a fitting vehicle with no `pairedDriver` is still not
   * dispatchable. The refusals are returned rather than filtered out on purpose:
   * a dispatcher looking for a truck needs to know *why* the obvious one is
   * unavailable ("not approved" sends them to review; "too small for the booked
   * class" does not), and a picker that simply omits two thirds of a fleet is
   * one a dispatcher cannot trust or act on.
   */
  verdict: DispatchVerdict;
  /**
   * Whether this is the vehicle the platform suggests — true on **exactly one**
   * vehicle in the response, or on none at all when nothing is dispatchable.
   *
   * `rankDispatchVehicles` owns the rule: the smallest dispatchable vehicle,
   * which is the first element once it has sorted. See that function for why
   * "smallest" is the right suggestion and why it stays a suggestion — the
   * dispatcher still chooses, and which truck is actually in the yard today is a
   * fact this server does not hold.
   *
   * A flag rather than a `recommendedVehicleId` beside the array: an id would be
   * a second thing to keep pointing at a row in a list that is already ordered
   * by the same rule, and a stale or dangling one would be silent. Here the
   * invariant is a property of the array itself.
   */
  recommended: boolean;
};

/** The frozen response body. The dispatch dialog codes against exactly this. */
type DispatchOptionsResponse = {
  /**
   * The whole fleet — never filtered by verdict — in the order the dialog
   * renders it, which `rankDispatchVehicles` decides: the dispatchable vehicles
   * first and smallest-payload-first among them, then everything else in the
   * newest-first order the fleet was read in. The client does not re-sort.
   */
  vehicles: DispatchVehicleOption[];
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

/** Flattens the assignment's driver-profile join into the `pairedDriver` shape. */
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
      // The live pairing, **scoped to drivers still on this company's roster**.
      //
      // `unassignedAt: null` is what separates "drives this today" from "drove
      // it last month": closed assignments are kept rather than deleted.
      //
      // `driverProfile.companyId` is the half that mirrors `POST .../dispatch`,
      // whose driver lookup is `{ userId: driverUserId, companyId: company.id }`.
      // Taking a driver off a roster is
      // `DELETE /api/logistics-company/drivers/[userId]`, which used to do
      // exactly one thing — `data: { companyId: null }` (`DriverProfile
      // .companyId` is `onDelete: SetNull` so the account stays intact, just
      // independent again) — and close nothing, so a live pairing to an
      // ex-roster driver was the ordinary outcome of a supported action rather
      // than corrupt data.
      //
      // **That is fixed at the source now.** That endpoint closes every live
      // assignment to a vehicle the company owns in the same transaction as the
      // roster removal, stamping `unassignedAt` rather than deleting the row.
      // This scoping is kept regardless. Nothing backfilled the rows left open
      // by every removal performed before that fix landed, so the stale pairing
      // it was written for is still readable out of the database and the
      // paragraph below still describes what the dispatcher would see without
      // it. The carve-out at the source cannot produce a new one here either
      // way — `fleet` above is already `{ companyId: company.id }`, so a
      // driver's own vehicle, which that fix deliberately leaves paired, never
      // reaches this select at all. Belt-and-braces now rather than
      // load-bearing, but do not drop it on that account.
      //
      // Unscoped, that pairing would be returned, and since this dialog no
      // longer offers a roster override the dispatcher would have no way past
      // it: the row shows a driver's name, reads as dispatchable, can win the
      // recommendation if it is the smallest fitting vehicle, and then the
      // submit answers "Driver not found." with no next move available inside
      // the dialog. Scoped, the vehicle arrives as `pairedDriver: null`, is not
      // dispatchable, is never recommended, and renders "No driver assigned" —
      // which is accurate in the only sense that matters here: no driver *this
      // company* can dispatch. That reads worse than it is (the vehicle may
      // visibly have a driver on the Drivers screen) and is still strictly
      // better than a vehicle that looks fine and cannot be dispatched at all.
      //
      // **This shipped as a symptom fix and is kept as one.** A GET cannot
      // repair rows on a caller's behalf, so scoping was the only thing this
      // endpoint could ever do about a pairing that already existed — which is
      // still its job for the ones the fix at the source could not reach
      // backwards to. The property it holds is the one `dispatchVerdictFor`
      // already gives for fit: the endpoint that offers a choice and the
      // endpoint that accepts it agree on who is eligible, rather than agreeing
      // by coincidence.
      //
      // `take: 1` stays exact rather than defensive: the partial unique index
      // `driver_vehicle_assignment_live_vehicle_unique`
      // (prisma/migrations/20260829121728_add_business_fleet_onboarding) permits
      // at most one row per vehicle with a null `unassignedAt` at the database
      // level, and adding a filter can only narrow that.
      assignments: {
        where: {
          unassignedAt: null,
          driverProfile: { companyId: company.id },
        },
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

  // Judged but not yet ranked, which is why the element type is the response
  // shape *minus* `recommended`: that field is not this map's to invent — it is
  // a property of the whole fleet (exactly one vehicle carries it) and cannot be
  // decided one row at a time. `Omit` rather than a hand-written second type, so
  // adding a field to the response cannot leave the two drifting apart.
  const judged: Omit<DispatchVehicleOption, "recommended">[] = fleet.map(
    (vehicle) => {
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

      // At most one, guaranteed by the partial unique index rather than by this
      // line — see the `assignments` select above.
      //
      // Absent here means "no driver this company can dispatch", which is a
      // wider condition than "no assignment": it also covers a live pairing to
      // a driver who has since left the roster, which that select deliberately
      // filters out so this endpoint and `POST .../dispatch` agree on who is
      // eligible. Do not widen the query without reading that comment first.
      const assignment = vehicle.assignments[0];

      return {
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        classLabel: vehicle.vehicleTypeSpec.label,
        capability: {
          payloadKg: capability.payloadKg,
          lengthM: capability.lengthM,
          widthM: capability.widthM,
          // The one axis that can arrive unbounded — see `serialisableHeight`
          // and `DispatchVehicleOption.capability.heightM`.
          heightM: serialisableHeight(capability.heightM),
        },
        pairedDriver: assignment
          ? toDriverOption(assignment.driverProfile)
          : null,
        verdict,
      };
    },
  );

  // The order and the recommendation, both from the one testable function that
  // owns them. Deliberately *not* an inline comparator here: "the smallest
  // vehicle that fits, and it is the only one recommended" is a product rule
  // worth asserting directly, and a comparator inside a route handler can only
  // be exercised through a request against a database.
  //
  // Note the payload it sorts on is `capability.payloadKg` above — the resolved
  // figure, the vehicle's own where it declared one. Handing it the class
  // catalogue's number instead would make every vehicle in a class tie.
  const body: DispatchOptionsResponse = {
    vehicles: rankDispatchVehicles(judged),
  };

  return NextResponse.json(body, { status: 200 });
}
