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
 * **Nothing constrains a driver to one open assignment.**
 * `model DriverVehicleAssignment` carries two plain indexes and no unique of
 * any kind, so a fleet manager may leave several rows open on one driver and
 * this clause then returns every one of those vehicles. That is handled, not
 * merely tolerated: the confirm dialog's picker exists precisely for the case
 * where more than one vehicle qualifies, and the header pill names the newest
 * by `createdAt`. Do not rewrite this as a single-vehicle lookup on the
 * strength of the one-truck-per-driver convention — the database does not
 * enforce it.
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
