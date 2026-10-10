import { NextResponse } from "next/server";

import type { AdminRole, VehicleCategory } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { listAdminVehiclePhotoRows } from "@/lib/admin/vehicle-photos";

/**
 * Staff who may read and change the marketing photo on a vehicle type. Stated
 * per route rather than imported from one shared constant so the gate on each
 * endpoint can be read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * One vehicle type as the photo manager renders it.
 *
 * Carries the photo and the two homepage display settings — the only things a
 * content manager may change on a vehicle type.
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
  /** Whether the public marketing surfaces show this type. */
  showOnHomepage: boolean;
  /** Position within its category on the homepage, ascending. */
  homepageSortOrder: number;
};

/** Body of `GET /api/admin/content/vehicle-photos`. */
export type AdminVehiclePhotoListResponse = {
  items: AdminVehiclePhotoRow[];
};

/**
 * GET /api/admin/content/vehicle-photos — every vehicle type with its current
 * photo and homepage display settings, in homepage order (category, then
 * `homepageSortOrder`, then label). Hidden types are included — the admin page
 * lists them, marked, so they can be shown again.
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

  const vehicleTypes = await listAdminVehiclePhotoRows();

  const body: AdminVehiclePhotoListResponse = { items: vehicleTypes };

  return NextResponse.json(body, { status: 200 });
}
