/**
 * Vehicle type taxonomy, grouped into the two categories the business
 * operates: light trucks and cargo vans. Plain data only (no `@prisma/client`
 * import) so this is safe to import from both client components and server
 * route handlers — the values must exactly match the `VehicleType` Prisma enum.
 */
export type VehicleTypeOption = { value: string; label: string };
export type VehicleTypeGroup = {
  category: string;
  options: VehicleTypeOption[];
};

export const VEHICLE_TYPE_GROUPS: VehicleTypeGroup[] = [
  {
    category: "Light Truck (<3.5t)",
    options: [
      { value: "FLATBED", label: "Flatbed" },
      { value: "PICKUP", label: "Pickup" },
      { value: "VENDING_TRUCK", label: "Vending Truck" },
      { value: "REFRIGERATED_TRUCK", label: "Refrigerated Truck" },
      { value: "ICE_CREAM_TRUCK", label: "Ice Cream Truck" },
      { value: "CURTAINSIDER_TRUCK", label: "Curtainsider Truck" },
      { value: "BOX_TRUCK", label: "Box Truck" },
      { value: "CHASSIS_TRUCK", label: "Chassis Truck" },
      { value: "DUMP_TRUCK", label: "Dump Truck" },
    ],
  },
  {
    category: "Cargo Van",
    options: [
      { value: "CARGO_DERIVED_VAN", label: "Cargo-derived Van" },
      { value: "CLOSED_BOX_VAN", label: "Closed Box Van" },
      { value: "COMBO_VAN", label: "Combo Van" },
      { value: "ISOTHERMAL_VAN", label: "Isothermal Van" },
      { value: "REFRIGERATED_VAN", label: "Refrigerated Van" },
    ],
  },
];

/**
 * Human-readable label for a stored `VehicleType` value. Falls back to the raw
 * value so a newly added enum member renders as something rather than blank if
 * the list above hasn't caught up yet.
 */
export function vehicleTypeLabel(value: string): string {
  for (const group of VEHICLE_TYPE_GROUPS) {
    const option = group.options.find((candidate) => candidate.value === value);
    if (option) {
      return option.label;
    }
  }

  return value;
}
