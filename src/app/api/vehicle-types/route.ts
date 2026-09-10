import { NextResponse } from "next/server";

import { serviceableSpecIds } from "@/lib/orders/class-serviceability";
import { prisma } from "@/lib/prisma";
import { visibleVehicleTypeWhere } from "@/lib/vehicle-type-visibility";

/**
 * GET /api/vehicle-types — the supported vehicle taxonomy with its pricing
 * rules, the source both the booking form and the landing page calculator build
 * their pickers from.
 *
 * Public and unauthenticated: this is reference data a visitor needs before
 * signing up, and unlike the estimate endpoint it spends no third-party API
 * budget, so it carries no rate limit.
 *
 * **It is no longer "one indexed read", and the rate-limit decision above has
 * not been revisited in light of that.** `serviceableSpecIds()` adds a second
 * and a third query, and one of them is a `Vehicle.findMany` filtered on an `OR`
 * over two *relation* predicates (`company.activatedAt`,
 * `driverProfile.activatedAt`) with no `take`. `Vehicle` carries only
 * `@@index([driverProfileId])` and `@@index([companyId])`, neither of which
 * serves a filter on the related row, so that read is a fleet scan whose cost
 * grows with the business — on an endpoint anybody on the internet may call in a
 * loop, with no `revalidate` and no `Cache-Control` on the response.
 * `POST /api/orders` pays the same scan once per booking.
 *
 * The fix this wants is the one `src/lib/orders/class-serviceability.ts`'s own
 * cost note prescribes: cache the snapshot the answer is derived from and
 * invalidate it from every path that writes a `Vehicle` or an account's
 * `activatedAt`. That is deliberately **not** done here yet — a cache without
 * complete invalidation is worse than the scan, because it refuses bookings for
 * a class whose carrier has just been approved. Tracked as follow-up work; do
 * not add a partial version of it. A supporting index on `Vehicle` may also be
 * warranted, but it needs a schema change and a migration and so is a separate
 * decision from the caching.
 *
 * Ordered by category then label, which lists medium-duty types before
 * heavy-duty ones (the enum's declaration order) — a sensible default for a
 * picker; callers are free to regroup.
 *
 * Not every seeded type is returned: `visibleVehicleTypeWhere()` withholds the
 * codes in `HIDDEN_UNTIL_STOCKED` until the fleet holds a dispatchable one, so
 * a visitor is never quoted a price for a vehicle nobody can send. See that
 * module for why this is a short explicit list and not a general
 * "hide types with no vehicles" rule.
 *
 * Every returned type carries a `serviceable` flag: whether any activated
 * carrier could actually take a load booked against it, under the same
 * upgrade-substitution rule the load board and the claim routes apply. Four of
 * the eleven seeded classes fail it today. The flag is *advisory* — it lets the
 * booking form steer a client away from an unbookable class before they fill in
 * a whole booking — and `POST /api/orders` enforces the same fact server-side
 * with the same function, exactly as the cargo-fit check is mirrored between the
 * form and the booking route. See `src/lib/orders/class-serviceability.ts`.
 *
 * **The flag is deliberately body-agnostic, unlike the booking route's check.**
 * This response is fetched once, unauthenticated and before a client has chosen
 * anything, and the booking form narrows it by body type client-side from the
 * `bodyTypes` list already returned; there is no body type to scope it to at this
 * point. So the flag answers "can anybody serve this class at all", which is the
 * weaker question, and a class can in principle be flagged serviceable while a
 * booking naming a particular load space is still refused — the *safe*
 * direction, and the same one `booking-fit.ts` documents for the form's copy of
 * the cargo check: the server is the authority and is never the looser of the
 * two. Making it body-aware would mean a query parameter and one fetch per body
 * type, replacing a single cached request with several.
 */
export async function GET(): Promise<NextResponse> {
  // Both reads are independent, so they go out together rather than in series —
  // `serviceableSpecIds` runs its own pair of queries and does not need this
  // one's result. It answers for the whole catalogue in one fleet scan, which is
  // why the flag below is a set lookup and not a per-row query.
  const [vehicleTypes, serviceable] = await Promise.all([
    prisma.vehicleTypeSpec.findMany({
      where: visibleVehicleTypeWhere(),
      orderBy: [{ category: "asc" }, { label: "asc" }],
      // Explicit select: ids and timestamps are internal, and the response is
      // public. `id` is the one exception and it is stripped again below — it is
      // read only to look each row up in the serviceable set, which is keyed by
      // the same id `Order.vehicleTypeSpecId` carries.
      select: {
        id: true,
        code: true,
        label: true,
        category: true,
        maxPayloadKg: true,
        cargoLengthM: true,
        cargoWidthM: true,
        cargoHeightM: true,
        loadingAccessType: true,
        // The load spaces this type serves, the booking form's body filter.
        // Part of the public projection because the filter is a client-side
        // narrowing of this same list — see the `bodyTypes` doc comment in the
        // schema.
        bodyTypes: true,
        imageUrl: true,
        pricingRule: {
          select: {
            baseFare: true,
            pricePerKm: true,
            pricePerMinute: true,
            freeLoadingMinutes: true,
            overtimeRatePerMinute: true,
            helperFee: true,
            minimumFare: true,
          },
        },
      },
    }),
    serviceableSpecIds(),
  ]);

  // `id` is destructured out rather than deleted, so it never reaches the
  // response object at all: this projection is public, and the id it is looked
  // up by is internal.
  const withServiceability = vehicleTypes.map(({ id, ...vehicleType }) => ({
    ...vehicleType,
    serviceable: serviceable.has(id),
  }));

  return NextResponse.json(withServiceability, { status: 200 });
}
