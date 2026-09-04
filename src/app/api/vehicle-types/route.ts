import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { visibleVehicleTypeWhere } from "@/lib/vehicle-type-visibility";

/**
 * GET /api/vehicle-types — the supported vehicle taxonomy with its pricing
 * rules, the source both the booking form and the landing page calculator build
 * their pickers from.
 *
 * Public and unauthenticated: this is reference data a visitor needs before
 * signing up, and unlike the estimate endpoint it spends no third-party API
 * budget — one indexed read — so it carries no rate limit.
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
 */
export async function GET(): Promise<NextResponse> {
  const vehicleTypes = await prisma.vehicleTypeSpec.findMany({
    where: visibleVehicleTypeWhere(),
    orderBy: [{ category: "asc" }, { label: "asc" }],
    // Explicit select: ids and timestamps are internal, and the response is
    // public.
    select: {
      code: true,
      label: true,
      category: true,
      maxPayloadKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
      loadingAccessType: true,
      // The load spaces this type serves, the booking form's body filter. Part
      // of the public projection because the filter is a client-side narrowing
      // of this same list — see the `bodyTypes` doc comment in the schema.
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
  });

  return NextResponse.json(vehicleTypes, { status: 200 });
}
