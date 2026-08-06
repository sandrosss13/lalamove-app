"use client";

import { useMemo, useState } from "react";

import type {
  CompanyDashboardData,
  OpsDriver,
} from "@/lib/company-dashboard-data";
import { formatCity } from "@/lib/format-city";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";

type DriverStatus = "online" | "offline" | "on_delivery";

/**
 * A driver is "on delivery" whenever they are mid-order, regardless of the
 * online flag — an in-transit driver reading as "offline" because their app
 * lost its heartbeat would be misleading on a dispatch board.
 *
 * The Fleet tab derives the same three states for its card grid. The duplication
 * is deliberate: the two tabs are built in parallel and must not import from one
 * another, so each owns its copy of this helper.
 */
function driverStatus(driver: OpsDriver): DriverStatus {
  if (driver.hasActiveDelivery) return "on_delivery";
  return driver.isOnline ? "online" : "offline";
}

const STATUS_DOT: Record<DriverStatus, string> = {
  online: "bg-emerald-400",
  offline: "bg-ops-text-muted",
  on_delivery: "bg-sky-400",
};

const STATUS_LABEL: Record<DriverStatus, string> = {
  online: "Online",
  offline: "Offline",
  on_delivery: "On delivery",
};

/**
 * Shared by the header row and every body row so the two can never drift apart.
 * Written as one complete class string, which is what Tailwind's scanner needs
 * to emit the arbitrary column template.
 */
const COLUMN_GRID = "grid-cols-[1.4fr_1fr_1fr_1fr_130px]";

/**
 * The Drivers tab: the whole roster as a searchable table of contact details,
 * vehicle assignment, region and live status. It renders the same `drivers`
 * array the Fleet tab shows as a status card grid — this is the reference view
 * (who they are, how to reach them), the Fleet tab is the live board.
 *
 * Rows open the driver-detail drawer by id rather than passing the row object,
 * so the drawer always reads the freshest copy out of the shell's data.
 */
export function OpsDriversTab({
  drivers,
}: {
  drivers: CompanyDashboardData["drivers"];
}) {
  const { openDrawer } = useOpsDashboard();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") return drivers;
    return drivers.filter((driver) =>
      driver.name.toLowerCase().includes(query),
    );
  }, [drivers, search]);

  return (
    <div className="flex flex-col gap-4.5">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search driver name…"
        aria-label="Search drivers by name"
        className="w-60 rounded-lg border border-ops-border bg-ops-surface px-3 py-2.5 text-sm outline-none placeholder:text-ops-text-muted focus:border-ops-accent"
      />

      <div className="overflow-hidden rounded-xl border border-ops-border">
        <div
          className={`grid ${COLUMN_GRID} gap-3 border-b border-ops-border px-4.5 py-3 text-[11px] tracking-wide uppercase text-ops-text-muted`}
        >
          <div>Driver</div>
          <div>Contact</div>
          <div>Vehicle</div>
          <div>Region</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-ops-text-muted">
            {drivers.length === 0
              ? "No drivers on your roster yet."
              : "No drivers match your filters."}
          </div>
        ) : (
          filtered.map((driver) => {
            const status = driverStatus(driver);
            return (
              <button
                key={driver.userId}
                type="button"
                onClick={() =>
                  openDrawer({ type: "driver", id: driver.userId })
                }
                className={`grid w-full ${COLUMN_GRID} items-center gap-3 border-b border-ops-border/60 px-4.5 py-3 text-left text-sm last:border-none hover:bg-ops-surface-raised`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ops-surface-raised text-[11px] font-semibold">
                    {driver.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{driver.name}</span>
                </span>
                <span className="truncate text-xs text-ops-text-muted">
                  {driver.phone}
                </span>
                <span className="truncate text-ops-text-muted">
                  {driver.assignedVehicle
                    ? driver.assignedVehicle.plateNumber
                    : "Unassigned"}
                </span>
                <span className="truncate text-ops-text-muted">
                  {formatCity(driver.city)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[status]}`}
                  />
                  {STATUS_LABEL[status]}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
