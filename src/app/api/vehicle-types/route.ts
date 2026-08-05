import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

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
 */
export async function GET(): Promise<NextResponse> {
  const vehicleTypes = await prisma.vehicleTypeSpec.findMany({
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
