import { NextResponse } from "next/server";

import type { AdminRole, VehicleCategory } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may read and change the marketing photo on a vehicle type. Stated
 * per route rather than imported from one shared constant so the gate on each
 * endpoint can be read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * One vehicle type as the photo manager renders it.
 *
 * Deliberately narrow: `maxPayloadKg`, the three cargo dimensions,
 * `loadingAccessType` and the 1-1 `PricingRule` are all absent, because this
 * surface neither shows nor edits them. Shipping them to the browser would
 * invite the next change to make them editable here, which is exactly what this
 * endpoint pair exists not to do — see the guardrail note on the `PATCH`
 * beside it.
 */
export type AdminVehiclePhotoRow = {
  id: string;
  code: string;
  label: string;
  category: VehicleCategory;
  /** Public `site-media` URL, or null while the type has no photography. */
  imageUrl: string | null;
};

/** Body of `GET /api/admin/content/vehicle-photos`. */
export type AdminVehiclePhotoListResponse = {
  items: AdminVehiclePhotoRow[];
};

/**
 * GET /api/admin/content/vehicle-photos — every vehicle type with its current
 * photo, in the order the admin page groups them.
 *
 * Unpaginated and unfiltered: `prisma/seed.ts` creates exactly eleven rows, and
 * the whole point of the page is seeing every type's photo at once to spot the
 * ones still missing one.
 */
export async function GET(): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const vehicleTypes = await prisma.vehicleTypeSpec.findMany({
    // Postgres sorts an enum column by its *declaration* order, not
    // alphabetically, so `category: "asc"` yields MEDIUM_DUTY before
    // HEAVY_DUTY — the same order the seed writes and the booking picker
    // presents. Spelled out because it reads like alphabetical order by
    // accident, and someone would otherwise "fix" it into the wrong order.
    orderBy: [{ category: "asc" }, { label: "asc" }],
    // Only the five columns the page renders. Widening this select is the
    // first step towards widening what this surface can change; keep it as it
    // is.
    select: {
      id: true,
      code: true,
      label: true,
      category: true,
      imageUrl: true,
    },
  });

  const body: AdminVehiclePhotoListResponse = { items: vehicleTypes };

  return NextResponse.json(body, { status: 200 });
}
