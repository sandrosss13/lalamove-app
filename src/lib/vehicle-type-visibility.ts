import type { Prisma } from "@prisma/client";

/**
 * Vehicle type codes that stay hidden from the public booking surfaces until
 * the fleet actually has one that could serve an order.
 *
 * The problem this solves is narrow and specific. `VehicleTypeSpec` has no
 * draft or feature-flag state: the moment a row is seeded it is selectable in
 * the booking picker and the landing-page quote calculator, and
 * `src/lib/pricing.ts` quotes real money against it. `TRAILER_TRUCK` was seeded
 * ahead of any trailer existing, so a client could book — and be charged for —
 * a 24 t articulated semi-trailer that no vehicle on the platform can fulfil.
 *
 * **This is deliberately a short list, not a general rule.** The obvious
 * generalisation — hide every type with no vehicles — is wrong here: 9 of the
 * 11 seeded types currently have zero vehicles, so applying it globally would
 * collapse the picker to two entries and take the rest of the catalogue off
 * sale. The other nine are established types the business expects to quote on
 * and recruit drivers into; only a type introduced *before* its supply exists
 * needs this gate.
 *
 * Remove a code from this list once its supply is established and the business
 * wants it quotable regardless of live availability — that is a business call,
 * not a technical one. An empty list restores the previous behaviour exactly.
 */
export const HIDDEN_UNTIL_STOCKED: readonly string[] = ["TRAILER_TRUCK"];

/**
 * A `VehicleTypeSpec` `where` clause that keeps every non-gated type and admits
 * a gated one only once it has at least one **dispatchable** vehicle.
 *
 * "Dispatchable" matches the rule the company dispatch route enforces, rather
 * than merely "a `Vehicle` row exists": a vehicle whose business application is
 * still pending or was flagged cannot be dispatched, so counting it here would
 * un-hide the type while every order against it still failed. A vehicle with no
 * `applicationVehicle` at all is a pre-existing/admin-created one and counts —
 * that is the same grandfathering escape hatch the dispatch gate uses.
 *
 * Expressed as a `where` rather than a post-`findMany` filter so the endpoint
 * stays a single indexed read.
 */
export function visibleVehicleTypeWhere(): Prisma.VehicleTypeSpecWhereInput {
  if (HIDDEN_UNTIL_STOCKED.length === 0) {
    return {};
  }

  return {
    OR: [
      { code: { notIn: [...HIDDEN_UNTIL_STOCKED] } },
      {
        vehicles: {
          some: {
            OR: [
              { applicationVehicle: null },
              { applicationVehicle: { status: "APPROVED" } },
            ],
          },
        },
      },
    ],
  };
}
