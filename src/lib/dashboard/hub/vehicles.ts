/**
 * The Driver Hub's Vehicles screen, fetched and shaped in one pass.
 *
 * One loader serves all three personas because the screen is the same screen:
 * the handoff calls it "Vehicles" for a fleet and "Vehicle" for one driver, but
 * the row, the detail panel and the tiles are identical — only the scope
 * differs. A BUSINESS sees the vehicles its company owns; an INDEPENDENT or
 * ROSTER driver sees the vehicles they own *plus* the company vehicle currently
 * assigned to them, because a roster driver owns no `Vehicle` row at all and
 * would otherwise be shown an empty screen while driving a van every day.
 *
 * Server-only: it talks to Prisma directly. The object it returns is handed
 * from a server component into a `"use client"` tree, so every value in it is
 * plain serialisable data — in particular every timestamp is an ISO string,
 * never a `Date`.
 *
 * ## This loader also carries a permission verdict
 *
 * Unusually for a hub loader, `HubVehiclesData` exports more than data:
 * `canAddVehicle` is a decided answer to "may this account register a vehicle
 * at all", which is `false` for exactly one persona (`ROSTER`). It lives here
 * rather than in the screen because the rule is enforced server-side — `POST
 * /api/driver-profile/vehicles` returns `403` to a roster driver — and a client
 * that re-derived the rule would be a second copy of it, free to drift away
 * from the endpoint that actually decides. The button follows the verdict; the
 * verdict follows the route.
 *
 * ## Real vs sample
 *
 * Everything at the top level of `HubVehicle` is read from the database.
 * Everything the schema cannot answer is quarantined under `sampled`, one
 * sub-object per vehicle, sourced entirely from `@/lib/dashboard/hub/sample`.
 * The same split applies to the tiles: `tiles.sampled` holds the one figure
 * that is invented. The screen renders a `<SampleNote />` beside anything it
 * reads out of a `sampled` object, and nothing else — which is why the boundary
 * is a nested object rather than a naming convention that a future edit could
 * quietly cross.
 *
 * Time boundaries are Tbilisi days, from `@/lib/dashboard/hub/timezone` — the
 * one zone every hub screen and every hub loader agrees on, for display and for
 * day-bucketing alike. This module has no time-bucketed figure today; the
 * convention is stated so the first one added does not have to rediscover it,
 * and so nobody reinstates the UTC boundary that used to be stated here and put
 * every tile four hours off the driver's own day.
 */
import "server-only";

import type {
  BusinessApplicationVehicleStatus,
  LoadingAccessType,
  VehicleCategory,
  VehicleClass,
} from "@prisma/client";

import type {
  HubAccount,
  HubAccountKind,
  HubPersona,
} from "@/lib/dashboard/hub/account";
import type {
  SampleComplianceStatus,
  SampleRunningCost,
} from "@/lib/dashboard/hub/sample";
import {
  SAMPLE_FLEET_COST_PER_KM_GEL,
  sampleRunningCosts,
  sampleVehicleFacts,
} from "@/lib/dashboard/hub/sample";
import { VEHICLE_CLASSES } from "@/lib/driver-onboarding/vehicle-classes";
import { isDispatchApproved } from "@/lib/orders/dispatch-fit";
import { prisma } from "@/lib/prisma";

/**
 * The two states a vehicle can honestly be in.
 *
 * The design's tab strip offers five (All / Active / In service / Idle /
 * Defleeted), but `Vehicle` has no status column: "In service" (at a garage)
 * and "Defleeted" (retired) are facts nothing in the schema records, and the
 * remove endpoint is a hard delete rather than a state change. So the status is
 * derived from the one thing that *is* recorded — whether a driver currently
 * holds this vehicle through an open `DriverVehicleAssignment` — and the screen
 * offers only the tabs those two states can fill.
 *
 * Retire this narrowing once `Vehicle` gains a lifecycle column; the two extra
 * states then become real and the tab strip can be completed.
 */
export type HubVehicleStatus = "Active" | "Idle";

/** Who the `Vehicle` row belongs to. Both kinds appear in a driver's list. */
export type HubVehicleOwnership = "COMPANY" | "DRIVER";

/** The driver currently holding a vehicle, via an open assignment. */
export type HubVehicleAssignment = {
  driverProfileId: string;
  driverUserId: string;
  driverName: string;
  isOnline: boolean;
  /** ISO string — when this pairing started. */
  assignedAt: string;
};

/**
 * The per-vehicle figures the schema cannot source. **Nothing in here is real.**
 *
 * Keyed off `Vehicle.plateNumber`, so a fleet whose plates are not the handoff's
 * seeded ones gets the neutral fallback rather than a plausible-looking
 * invention — see `sampleVehicleFacts()`.
 */
export type HubVehicleSampled = {
  odometerKm: number;
  costPerKmGel: number;
  /** Fuel type, e.g. "Diesel". */
  fuel: string;
  /** Cities this vehicle works, as display labels. */
  operatingCities: readonly string[];
  jobsThisWeek: number;
  insuranceStatus: SampleComplianceStatus;
  /** Human date, e.g. "10 Sep 2026", or "not on file". */
  insuranceDue: string;
  inspectionDue: string;
  /** The detail panel's "Running costs · this month" lines. */
  runningCosts: readonly SampleRunningCost[];
};

export type HubVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  colour: string | null;
  photoUrls: string[];
  /**
   * The class the owner declared at onboarding, or null for a vehicle that
   * predates the class column. Null is "no declared class", never a default —
   * `vehicleClassLabel` falls back to the spec label for exactly that case.
   */
  vehicleClass: VehicleClass | null;
  /** Ready-to-render class name; the spec label when no class was declared. */
  vehicleClassLabel: string;
  vehicleTypeSpecId: string;
  vehicleTypeCode: string;
  vehicleTypeLabel: string;
  category: VehicleCategory;
  /** Class-level capacity from `VehicleTypeSpec` — what pricing and matching use. */
  maxPayloadKg: number;
  /**
   * The owner's declared payload for this specific vehicle, or null when none
   * was collected. An attestation for compliance review, never a pricing input.
   */
  declaredPayloadKg: number | null;
  loadingAccessType: LoadingAccessType;
  ownership: HubVehicleOwnership;
  status: HubVehicleStatus;
  /** null when nobody currently holds this vehicle. */
  assignment: HubVehicleAssignment | null;
  /**
   * This vehicle's fleet-application verdict, or null for one that predates
   * business applications (admin-created, or added through the company's own
   * fleet form). Surfaced separately from `status` on purpose: a PENDING or
   * FLAGGED vehicle is a real, blocking review state the operator needs to see,
   * and folding it into the Active/Idle derivation would hide it behind
   * whichever of those two it happened to be.
   */
  reviewStatus: BusinessApplicationVehicleStatus | null;
  /**
   * Whether the dispatch endpoint will accept this vehicle: no review row at
   * all (grandfathered) or an approved one.
   *
   * No longer *mirrors* that gate — it now calls it. `isDispatchApproved` in
   * `src/lib/orders/dispatch-fit.ts` is the one statement of the rule, read
   * here and by both company dispatch endpoints, so "the hub says dispatchable"
   * and "the POST accepts it" are the same sentence rather than two that agreed
   * by inspection. (`visibleVehicleTypeWhere` in
   * `src/lib/vehicle-type-visibility.ts` states it a third time as a Prisma
   * `where`; that one cannot call a predicate over an already-fetched row
   * without turning an indexed query into a fleet scan, and is cross-referenced
   * from `isDispatchApproved` instead.)
   */
  dispatchable: boolean;
  /** ISO string — when the vehicle joined the fleet. */
  createdAt: string;
  sampled: HubVehicleSampled;
};

/** One segment of the "5 vans · 1 sedan · 2 trucks" tile note. */
export type HubVehicleClassCount = {
  /** null groups every vehicle with no declared class, keyed by spec label. */
  vehicleClass: VehicleClass | null;
  label: string;
  count: number;
};

export type HubVehiclesData = {
  /**
   * The **owner** axis: which owner-scoped API route pair applies to a vehicle
   * on this screen, and whether the fourth tile is a fleet figure or a personal
   * one. `"BUSINESS"` posts and deletes against
   * `/api/logistics-company/vehicles`; `"INDIVIDUAL"` against
   * `/api/driver-profile/vehicles`.
   *
   * Kept, and deliberately **not** replaced by `persona` below. The three
   * places that read it — the "Fleet cost per km" / "Cost per km" tile label,
   * the add form's route choice, and the detail panel's `removable` rule and
   * `DELETE` endpoint — all ask a genuinely two-valued question about
   * *ownership*, and an INDEPENDENT and a ROSTER driver answer it identically.
   * Re-expressing them as `persona !== "BUSINESS"` would be a wider test
   * standing in for a narrower fact, and would make the detail panel's
   * ownership rule read as a persona rule.
   *
   * (The old comment here claimed this picks the screen's heading. It does
   * not — the header title comes from the static `"Vehicles"` literal in
   * `src/components/driver-hub/driver-hub-nav.ts`, which no screen overrides.)
   */
  kind: HubAccountKind;
  /**
   * The **account-shape** axis, for copy. Three sentences are needed where
   * `kind` can only tell two apart: an INDEPENDENT driver reads about a vehicle
   * they own, a ROSTER driver reads about one their employer owns and assigned
   * to them, and a BUSINESS reads about a fleet. This is the field the screen
   * branches on for wording; `canAddVehicle` below is the field it branches on
   * for the one affordance that is actually withheld.
   */
  persona: HubPersona;
  /**
   * Whether this account may register a vehicle at all — `false` for exactly
   * one persona, `ROSTER`.
   *
   * Carried as a decided verdict rather than left to the screen to derive from
   * `persona`, for the same reason `HubAccount.canToggleOnline` exists beside
   * the activation columns it is computed from: the rule is enforced
   * server-side (`POST /api/driver-profile/vehicles` 403s a roster driver, and
   * so does the fleet route for a non-company caller), and a client that
   * re-derives the rule is a second copy of it that can drift. When the rule
   * changes it changes here, and the button follows.
   */
  canAddVehicle: boolean;
  /** Complete, unpaginated, newest first. */
  vehicles: HubVehicle[];
  tiles: {
    /** Total rows in `vehicles`. */
    vehicleCount: number;
    /** Breakdown behind the count, largest group first. */
    classBreakdown: HubVehicleClassCount[];
    /** Vehicles with a live assignment — the design's "On the road". */
    onTheRoadCount: number;
    /** Vehicles nobody currently holds. */
    unassignedCount: number;
    sampled: {
      fleetCostPerKmGel: number;
    };
  };
};

/**
 * The class catalogue's display name for a Prisma `VehicleClass`, or undefined
 * for a value the catalogue does not know.
 *
 * Deliberately total rather than reusing `findVehicleClass()`, which throws:
 * `VehicleClass` is a database enum and `VEHICLE_CLASSES` is a hand-maintained
 * TypeScript list, so a class added to the schema first would take a dashboard
 * page down instead of degrading to the spec label.
 */
function vehicleClassName(vehicleClass: VehicleClass): string | undefined {
  return VEHICLE_CLASSES.find((entry) => entry.id === vehicleClass)?.name;
}

/**
 * Groups the fleet for the count tile's note.
 *
 * Vehicles with no declared class are grouped by their `VehicleTypeSpec` label
 * instead, which is the fallback the schema's own comment prescribes — so a
 * grandfathered fleet still gets a real breakdown rather than one "Unclassified"
 * bucket.
 */
function classBreakdownOf(vehicles: HubVehicle[]): HubVehicleClassCount[] {
  const groups = new Map<string, HubVehicleClassCount>();

  for (const vehicle of vehicles) {
    // The label is the group key, not the enum value: two spec-label fallbacks
    // reading the same must land in the same bucket, and a declared class and a
    // spec label never collide because the catalogues are disjoint.
    const key = vehicle.vehicleClassLabel;
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, {
        vehicleClass: vehicle.vehicleClass,
        label: key,
        count: 1,
      });
      continue;
    }

    existing.count += 1;
    // A group that mixes declared and undeclared vehicles under one label is no
    // longer attributable to a single class, so the enum is dropped.
    if (existing.vehicleClass !== vehicle.vehicleClass) {
      existing.vehicleClass = null;
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

/**
 * Fetches and shapes every vehicle the signed-in account may see.
 *
 * Never returns null: an account with no vehicles is an ordinary, renderable
 * state (a company mid-onboarding, a rostered driver awaiting an assignment),
 * not the "profile row is missing" case that `resolveHubAccount()` already
 * absorbed before this is ever called.
 */
export async function getHubVehicles(
  account: HubAccount,
): Promise<HubVehiclesData> {
  // `HubAccount` types both ids as nullable because one kind of account has
  // each. Reading them into locals is what lets the `where` below narrow, and
  // the empty result is the honest answer for the impossible-but-typed case of
  // a business account with no company id.
  const { companyId, driverProfileId } = account;

  // Decided once for both return paths below. A roster driver's vehicle is
  // their employer's, reached through an open `DriverVehicleAssignment` that a
  // fleet manager creates — there is nothing for them to register, and
  // `POST /api/driver-profile/vehicles` refuses them if they try. An
  // INDEPENDENT driver registers their own; a BUSINESS registers the fleet's
  // through the company route. Computing it here rather than at each `return`
  // is what stops the empty-fleet path and the populated path from drifting
  // into two different answers to the same question.
  //
  // Written as a single withholding rather than an allow-list of the two
  // permitted personas on purpose: a fourth persona added later should default
  // to *allowed* here and be excluded deliberately, not be silently denied by
  // an exhaustive list nobody remembered to extend.
  const canAddVehicle = account.persona !== "ROSTER";

  const scope =
    account.kind === "BUSINESS"
      ? companyId === null
        ? null
        : { companyId }
      : driverProfileId === null
        ? null
        : {
            // Both halves of a driver's fleet: the vehicles they own outright,
            // and the company vehicle they currently hold. A rostered driver
            // only ever matches the second — `Vehicle.driverProfileId` is null
            // for company-owned rows (see the `vehicle_single_owner_check`
            // constraint referenced from the schema).
            OR: [
              { driverProfileId },
              {
                assignments: {
                  some: { driverProfileId, unassignedAt: null },
                },
              },
            ],
          };

  if (scope === null) {
    return {
      kind: account.kind,
      persona: account.persona,
      canAddVehicle,
      vehicles: [],
      tiles: {
        vehicleCount: 0,
        classBreakdown: [],
        onTheRoadCount: 0,
        unassignedCount: 0,
        sampled: { fleetCostPerKmGel: SAMPLE_FLEET_COST_PER_KM_GEL },
      },
    };
  }

  const rawVehicles = await prisma.vehicle.findMany({
    where: scope,
    include: {
      vehicleTypeSpec: true,
      // Singular, because `BusinessApplicationVehicle.vehicleId` is `@unique`:
      // a vehicle appears in at most one review row for its lifetime.
      applicationVehicle: { select: { status: true } },
      // At most one assignment per vehicle is open at a time (enforced by a
      // partial unique index and re-checked at the API layer), so the first
      // open row is *the* current pairing. The `orderBy` is defensive: should a
      // bad write ever leave two rows open, the newest one wins rather than an
      // arbitrary one. Same shape as `company-dashboard-data.ts`'s fleet query.
      assignments: {
        where: { unassignedAt: null },
        include: {
          driverProfile: {
            select: {
              id: true,
              userId: true,
              isOnline: true,
              user: { select: { name: true } },
            },
          },
        },
        orderBy: { assignedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const vehicles: HubVehicle[] = rawVehicles.map((vehicle) => {
    const assignment = vehicle.assignments[0];
    const facts = sampleVehicleFacts(vehicle.plateNumber);
    const declaredClassName =
      vehicle.vehicleClass === null
        ? undefined
        : vehicleClassName(vehicle.vehicleClass);

    return {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      colour: vehicle.colour,
      photoUrls: vehicle.photoUrls,
      vehicleClass: vehicle.vehicleClass,
      vehicleClassLabel: declaredClassName ?? vehicle.vehicleTypeSpec.label,
      vehicleTypeSpecId: vehicle.vehicleTypeSpecId,
      vehicleTypeCode: vehicle.vehicleTypeSpec.code,
      vehicleTypeLabel: vehicle.vehicleTypeSpec.label,
      category: vehicle.vehicleTypeSpec.category,
      maxPayloadKg: vehicle.vehicleTypeSpec.maxPayloadKg,
      declaredPayloadKg: vehicle.payloadKg,
      loadingAccessType: vehicle.vehicleTypeSpec.loadingAccessType,
      ownership: vehicle.companyId === null ? "DRIVER" : "COMPANY",
      status: assignment ? "Active" : "Idle",
      assignment: assignment
        ? {
            driverProfileId: assignment.driverProfile.id,
            driverUserId: assignment.driverProfile.userId,
            driverName: assignment.driverProfile.user.name,
            isOnline: assignment.driverProfile.isOnline,
            assignedAt: assignment.assignedAt.toISOString(),
          }
        : null,
      reviewStatus: vehicle.applicationVehicle?.status ?? null,
      dispatchable: isDispatchApproved(vehicle.applicationVehicle),
      createdAt: vehicle.createdAt.toISOString(),
      sampled: {
        odometerKm: facts.odometerKm,
        costPerKmGel: facts.costPerKmGel,
        fuel: facts.fuel,
        operatingCities: facts.operatingCities,
        jobsThisWeek: facts.jobsThisWeek,
        insuranceStatus: facts.insuranceStatus,
        insuranceDue: facts.insuranceDue,
        inspectionDue: facts.inspectionDue,
        runningCosts: sampleRunningCosts(facts.costPerKmGel),
      },
    };
  });

  const onTheRoadCount = vehicles.filter(
    (vehicle) => vehicle.assignment !== null,
  ).length;

  return {
    kind: account.kind,
    persona: account.persona,
    canAddVehicle,
    vehicles,
    tiles: {
      vehicleCount: vehicles.length,
      classBreakdown: classBreakdownOf(vehicles),
      onTheRoadCount,
      // The complement of `onTheRoadCount` by construction, computed rather than
      // queried so the two tiles can never sum to something other than the
      // fleet size the tile above them shows.
      unassignedCount: vehicles.length - onTheRoadCount,
      sampled: { fleetCostPerKmGel: SAMPLE_FLEET_COST_PER_KM_GEL },
    },
  };
}
