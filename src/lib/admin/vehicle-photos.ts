import "server-only";

// Type-only import, erased at compile time: the row shape is owned by the list
// endpoint that ships it, and this module only produces it.
import type { AdminVehiclePhotoRow } from "@/app/api/admin/content/vehicle-photos/route";
import { prisma } from "@/lib/prisma";

/**
 * The columns every vehicle-photos endpoint returns, matching
 * `AdminVehiclePhotoRow`. Shared by the list, the `PATCH` and the reorder
 * endpoint so the three responses cannot drift.
 */
export const ADMIN_VEHICLE_PHOTO_SELECT = {
  id: true,
  code: true,
  label: true,
  category: true,
  imageUrl: true,
  showOnHomepage: true,
  homepageSortOrder: true,
} as const;

/**
 * Every vehicle type in homepage order: category (enum declaration order, so
 * medium-duty first), then the admin's homepage position, then label.
 *
 * Postgres sorts an enum column by its *declaration* order, not
 * alphabetically, so `category: "asc"` yields MEDIUM_DUTY before HEAVY_DUTY —
 * the same order the seed writes and the homepage presents. Spelled out
 * because it reads like alphabetical order by accident, and someone would
 * otherwise "fix" it into the wrong order.
 */
export function listAdminVehiclePhotoRows(): Promise<AdminVehiclePhotoRow[]> {
  return prisma.vehicleTypeSpec.findMany({
    orderBy: [
      { category: "asc" },
      { homepageSortOrder: "asc" },
      { label: "asc" },
    ],
    select: ADMIN_VEHICLE_PHOTO_SELECT,
  });
}
