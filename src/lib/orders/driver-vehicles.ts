/**
 * Which vehicles one driver may put behind a load — the `where` clause every
 * surface that asks that question shares.
 *
 * **A driver holds vehicles two ways, and counting only one of them is what
 * would make the Load Board useless to an employed driver.** An INDEPENDENT
 * driver registers their own truck through the onboarding wizard and it hangs
 * off `Vehicle.driverProfileId`. A ROSTER driver registers nothing: the truck
 * belongs to their employer (`Vehicle.companyId`) and a fleet manager pairs the
 * two with a `DriverVehicleAssignment` row, leaving `Vehicle.driverProfileId`
 * null — `model Vehicle`'s single-owner rule gives a company vehicle exactly one
 * owner, and that owner is the company. A bare `where: { driverProfileId }`
 * therefore returns *nothing at all* for a roster driver, and a board that can
 * name no claim vehicle is a board on which nothing can ever be claimed.
 *
 * An assignment counts while `unassignedAt` is null. The row is closed by
 * stamping that column rather than deleted, so reassignment keeps its history
 * and the vehicle a driver drove last month must not count as theirs today.
 *
 * **A driver holds at most one *assigned* vehicle, but this clause can still
 * return several — and the difference is why it must not be rewritten as a
 * single-vehicle lookup.**
 *
 * `model DriverVehicleAssignment` declares only `@@index([driverProfileId])`
 * and `@@index([vehicleId])`, which is where the belief that nothing is
 * enforced comes from: reading the Prisma schema alone, there is no unique of
 * any kind. The schema is not the whole story.
 * `prisma/migrations/20260829121728_add_business_fleet_onboarding/migration.sql`
 * adds two **partial** unique indexes that Prisma's schema language cannot
 * express and therefore does not show —
 * `driver_vehicle_assignment_live_driver_unique` on `("driverProfileId") WHERE
 * "unassignedAt" IS NULL` and `driver_vehicle_assignment_live_vehicle_unique`
 * on `("vehicleId")` under the same predicate. Their own migration comments
 * give the reason: the "one live assignment" rule used to be enforced only
 * inside the assignment route's transaction, which under READ COMMITTED narrows
 * the race window without closing it. So the database does enforce it, and
 * `GET /api/logistics-company/drivers` already relies on that, taking its live
 * assignment with an exact `take: 1`.
 *
 * What is *not* constrained is the other half of the `OR`. `Vehicle
 * .driverProfileId` carries a plain `@@index` and no unique, so an INDEPENDENT
 * driver may own any number of trucks outright, and this clause returns every
 * one of them alongside the single company vehicle a ROSTER driver may hold.
 * More than one vehicle qualifying is therefore still an ordinary case, not a
 * data error: the confirm dialog's picker exists precisely for it, and the
 * header pill names the newest by `createdAt`. Do not collapse this to a
 * single-vehicle lookup on the strength of the live-assignment index — that
 * index says nothing about owned vehicles.
 *
 * **Exported as one `where` rather than written out per call site, and that is
 * the whole reason this module exists.** Three surfaces ask this question and
 * they have to give the same answer: `/dashboard/loads` resolves the header
 * pill and the confirm dialog's vehicle picker from it, `GET /api/loads` runs
 * the board's fit filter over it, and `POST /api/orders/[id]/accept` scopes the
 * lookup that decides whether a named `vehicleId` is this driver's to commit. A
 * board that filters on a wider fleet than the claim route accepts advertises
 * work Accept then refuses; a board that filters on a narrower one hides work
 * the driver could have taken. Both are the divergence this codebase has been
 * closing since the board shipped, and three copies of one `OR` is exactly how
 * it comes back.
 *
 * `getHubVehicles` in `src/lib/dashboard/hub/vehicles.ts` builds the same union
 * inline, and is deliberately left alone rather than switched over: that screen
 * asks a different question — everything this driver may *look at*, including
 * rows no board would ever claim with — and routing it through a claim-scoped
 * helper would tie a listing's breadth to a claim's. If the two are ever
 * required to agree, this is the module to move it into.
 */

import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * The vehicles this driver owns outright, plus the one they currently hold on
 * an open fleet assignment.
 *
 * Returned as a bare `{ OR: [...] }` so a caller can spread it alongside its own
 * clauses: `{ id: vehicleId, ...driverVehiclesWhere(id) }` is the ownership
 * scope the accept route needs, and Prisma ANDs top-level fields. A caller that
 * already carries an `OR` of its own must nest this under `AND` instead, or the
 * spread silently replaces theirs.
 */
export function driverVehiclesWhere(
  driverProfileId: string,
): Prisma.VehicleWhereInput {
  return {
    OR: [
      { driverProfileId },
      { assignments: { some: { driverProfileId, unassignedAt: null } } },
    ],
  };
}
