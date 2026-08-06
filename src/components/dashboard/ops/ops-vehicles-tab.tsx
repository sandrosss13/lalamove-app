"use client";

import { useMemo, useState } from "react";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsVehicleAssignmentSelect } from "@/components/dashboard/ops/ops-vehicle-assignment-select";

/**
 * Column widths for the table, shared by the header and every row — they have to
 * stay in step or the two grids stop lining up, so they live in one constant.
 */
const COLUMN_TEMPLATE = "grid-cols-[1fr_1fr_1.2fr_100px_1.3fr_110px]";

const COLUMNS = [
  "Plate",
  "Type",
  "Model",
  "Capacity",
  "Assigned driver",
  "Status",
] as const;

/**
 * The Vehicles tab: the company's fleet as a management table, with the
 * driver-assignment control on each row and the entry point to registering a new
 * vehicle.
 *
 * It needs the roster as well as the fleet because assignment pairs one with the
 * other. The two are different views of the same pairing — a vehicle's driver
 * here, a driver's vehicle on the Fleet and Drivers tabs — so a change made here
 * refreshes all of them together (see `OpsVehicleAssignmentSelect`).
 *
 * "Status" is Assigned/Unassigned, derived from `activeAssignment`. There is
 * deliberately no active/maintenance state: the schema stores none, and
 * inventing one in the UI would imply a workflow that does not exist.
 */
export function OpsVehiclesTab({
  fleet,
  drivers,
}: {
  fleet: CompanyDashboardData["fleet"];
  drivers: CompanyDashboardData["drivers"];
}) {
  const { openDrawer } = useOpsDashboard();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") return fleet;

    // Make is matched alongside model because the Model column renders the two
    // together ("Mercedes Sprinter"), and a search that ignored half of what is
    // on screen would read as broken.
    return fleet.filter(
      (vehicle) =>
        vehicle.plateNumber.toLowerCase().includes(query) ||
        vehicle.model.toLowerCase().includes(query) ||
        vehicle.make.toLowerCase().includes(query),
    );
  }, [fleet, search]);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search plate or model…"
          aria-label="Search vehicles by plate or model"
          className="w-60 rounded-lg border border-ops-border bg-ops-surface px-3 py-2.5 text-sm outline-none placeholder:text-ops-text-muted focus-visible:border-ops-accent"
        />
        <button
          type="button"
          onClick={() => openDrawer({ type: "add-vehicle" })}
          className="rounded-lg bg-ops-accent px-4 py-2.5 text-sm font-medium text-ops-accent-fg hover:opacity-90"
        >
          + Register vehicle
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-ops-border">
        <div
          className={`grid ${COLUMN_TEMPLATE} gap-3 border-b border-ops-border px-4.5 py-3 text-[11px] tracking-wide text-ops-text-muted uppercase`}
        >
          {COLUMNS.map((column) => (
            <div key={column}>{column}</div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-ops-text-muted">
            {fleet.length === 0
              ? "No vehicles yet — register your first one above."
              : "No vehicles match your search."}
          </div>
        ) : (
          filtered.map((vehicle) => (
            <div
              key={vehicle.id}
              className={`grid ${COLUMN_TEMPLATE} items-center gap-3 border-b border-ops-border/60 px-4.5 py-3 text-sm last:border-none`}
            >
              <span className="truncate font-medium">
                {vehicle.plateNumber}
              </span>
              <span className="truncate text-ops-text-muted">
                {vehicle.vehicleTypeLabel}
              </span>
              <span className="truncate">
                {vehicle.make} {vehicle.model}
              </span>
              <span className="text-ops-text-muted tabular-nums">
                {vehicle.maxPayloadKg} kg
              </span>
              <span>
                <OpsVehicleAssignmentSelect
                  vehicle={vehicle}
                  drivers={drivers}
                />
              </span>
              <span className="text-xs text-ops-text-muted">
                {vehicle.activeAssignment ? "Assigned" : "Unassigned"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
