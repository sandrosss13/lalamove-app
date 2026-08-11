"use client";

import type { DriverDashboardData } from "@/lib/driver-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { VehicleCard } from "@/components/vehicle-card";
import { EditVehicleForm } from "@/components/edit-vehicle-form";
import { RemoveVehicleButton } from "@/components/remove-vehicle-button";

/**
 * The Vehicle tab: the driver's own vehicles as a card grid, each with the
 * existing edit and remove controls, plus the entry point to registering
 * another one.
 *
 * Only independent drivers ever reach it — a rostered driver's fleet belongs to
 * their company, so the shell omits both the rail entry and the render for them.
 *
 * `VehicleCard`, `EditVehicleForm` and `RemoveVehicleButton` are reused
 * unmodified from the standalone vehicles page: the mutation logic (PATCH/DELETE
 * plus `router.refresh()`) is identical here, and forking it for the console
 * would mean two implementations of the same endpoints drifting apart.
 */
export function DriverOpsVehicleTab({
  vehicles,
}: {
  vehicles: DriverDashboardData["vehicles"];
}) {
  const { openDrawer } = useOpsDashboard();

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => openDrawer({ type: "add-vehicle" })}
          className="rounded-lg bg-ops-accent px-4 py-2.5 text-sm font-medium text-ops-accent-fg hover:opacity-90"
        >
          + Register vehicle
        </button>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-xl border border-ops-border bg-ops-surface p-12 text-center text-sm text-ops-text-muted">
          No vehicles yet — register your first one above.
        </div>
      ) : (
        // `VehicleCard` renders an <li>, so the grid has to be the <ul>.
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={{
                plateNumber: vehicle.plateNumber,
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                photoUrls: vehicle.photoUrls,
                // `DriverOpsVehicle` flattens the type spec for the tabs that
                // only need a label; the card wants the relation shape back.
                vehicleTypeSpec: {
                  label: vehicle.vehicleTypeLabel,
                  maxPayloadKg: vehicle.maxPayloadKg,
                },
              }}
            >
              <EditVehicleForm
                vehicle={{
                  id: vehicle.id,
                  plateNumber: vehicle.plateNumber,
                  make: vehicle.make,
                  model: vehicle.model,
                  year: vehicle.year,
                  vehicleTypeCode: vehicle.vehicleTypeCode,
                }}
              />
              <RemoveVehicleButton
                vehicleId={vehicle.id}
                plateNumber={vehicle.plateNumber}
              />
            </VehicleCard>
          ))}
        </ul>
      )}
    </div>
  );
}
