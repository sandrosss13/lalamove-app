/**
 * Cargo taxonomy: what each `CargoCategory` is called in the UI, and which
 * vehicle categories it may be booked with.
 *
 * Plain data only. The Prisma enums are imported as *types* (erased at compile
 * time) and the values are written as string literals, so importing this module
 * from a client component never pulls `@prisma/client`'s runtime into the
 * browser bundle — the same reason the vehicle option list this replaces
 * duplicated its enum values instead of importing them. The `Record` keys keep
 * the tables exhaustive: adding an enum member fails typecheck until it is
 * listed here.
 */

import type { CargoCategory, VehicleCategory } from "@prisma/client";

export const CARGO_CATEGORY_LABELS: Record<CargoCategory, string> = {
  FURNITURE_FURNISHINGS: "Furniture & Furnishings",
  APPLIANCES: "Home & Office Appliances",
  RETAIL_STOCK: "Store & Retail Stock",
  EVENT_EQUIPMENT: "Event & Exhibition Equipment",
  FULL_RELOCATION: "Full Relocation",
  INDUSTRIAL_SUPPLIES: "Industrial & Commercial Supplies",
  CONSTRUCTION_MATERIALS: "Construction & Hardware Materials",
};

/**
 * Which vehicle categories a cargo category may be booked with. The heavy
 * categories (a full relocation, industrial supplies, construction materials)
 * are heavy-duty only: no medium-duty van can legally or physically take them.
 */
export const CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES: Record<
  CargoCategory,
  VehicleCategory[]
> = {
  FURNITURE_FURNISHINGS: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  APPLIANCES: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  RETAIL_STOCK: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  EVENT_EQUIPMENT: ["MEDIUM_DUTY", "HEAVY_DUTY"],
  FULL_RELOCATION: ["HEAVY_DUTY"],
  INDUSTRIAL_SUPPLIES: ["HEAVY_DUTY"],
  CONSTRUCTION_MATERIALS: ["HEAVY_DUTY"],
};
