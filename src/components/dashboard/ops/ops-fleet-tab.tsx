"use client";

import { useMemo, useState } from "react";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { formatCity } from "@/lib/format-city";

type OpsDriver = CompanyDashboardData["drivers"][number];

type DriverStatus = "online" | "offline" | "on_delivery";

type StatusFilter = "all" | DriverStatus;

/** Chip order, and the order the counts are rendered in. */
const STATUS_FILTERS = ["all", "online", "offline", "on_delivery"] as const;

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

const FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All",
  ...STATUS_LABEL,
};

/**
 * Status is derived rather than stored: a driver mid-delivery is reported as
 * "on delivery" even though `isOnline` is also true, because that is the more
 * specific fact an operator needs. Hence the ordering here — the active-delivery
 * check must come first.
 */
function driverStatus(driver: OpsDriver): DriverStatus {
  if (driver.hasActiveDelivery) return "on_delivery";
  return driver.isOnline ? "online" : "offline";
}

/**
 * The Fleet tab: the roster as a scannable card grid, filtered by name search
 * and status chip. It is deliberately a second view of the same `drivers` array
 * the Drivers tab renders as a table — cards for at-a-glance status, the table
 * for contact details — not a duplicate to collapse.
 *
 * Cards carry no rating: the schema stores none, so there is nothing to show.
 */
export function OpsFleetTab({
  drivers,
}: {
  drivers: CompanyDashboardData["drivers"];
}) {
  const { openDrawer } = useOpsDashboard();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Counts stay on the whole roster, not the filtered slice, so the chips keep
  // reading as "how many drivers are in this state" after one is selected.
  const counts = useMemo<Record<StatusFilter, number>>(() => {
    const tally: Record<StatusFilter, number> = {
      all: drivers.length,
      online: 0,
      offline: 0,
      on_delivery: 0,
    };
    for (const driver of drivers) {
      tally[driverStatus(driver)] += 1;
    }
    return tally;
  }, [drivers]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return drivers.filter((driver) => {
      if (statusFilter !== "all" && driverStatus(driver) !== statusFilter) {
        return false;
      }
      if (query === "") return true;
      return driver.name.toLowerCase().includes(query);
    });
  }, [drivers, search, statusFilter]);

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search driver name…"
          aria-label="Search drivers by name"
          className="w-60 rounded-lg border border-ops-border bg-ops-surface px-3 py-2.5 text-sm outline-none placeholder:text-ops-text-muted focus-visible:border-ops-accent"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((status) => {
            const active = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(status)}
                className={`rounded-full border px-3.5 py-2 text-xs font-medium whitespace-nowrap ${
                  active
                    ? "border-ops-accent bg-ops-accent/20 text-ops-accent"
                    : "border-ops-border text-ops-text-muted hover:bg-ops-surface-raised"
                }`}
              >
                {FILTER_LABEL[status]} · {counts[status]}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-sm text-ops-text-muted">
          {drivers.length === 0
            ? "No drivers on your roster yet."
            : "No drivers match your filters."}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
          {filtered.map((driver) => {
            const status = driverStatus(driver);
            return (
              <button
                key={driver.userId}
                type="button"
                onClick={() =>
                  openDrawer({ type: "driver", id: driver.userId })
                }
                className="rounded-xl border border-ops-border bg-ops-surface p-4.5 text-left hover:border-ops-accent/50 hover:bg-ops-surface-raised"
              >
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="relative flex h-9.5 w-9.5 flex-shrink-0 items-center justify-center rounded-full bg-ops-surface-raised text-[13px] font-semibold">
                    {driver.name.slice(0, 2).toUpperCase()}
                    {/* The dot repeats the status shown in the card footer, so it
                        is decorative — the footer text carries it for readers. */}
                    <span
                      aria-hidden="true"
                      className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-ops-surface ${STATUS_DOT[status]}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {driver.name}
                    </div>
                    <div className="truncate text-xs text-ops-text-muted">
                      {driver.assignedVehicle
                        ? driver.assignedVehicle.plateNumber
                        : "No vehicle"}{" "}
                      · {formatCity(driver.city)}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between border-t border-ops-border pt-2.5 text-xs text-ops-text-muted">
                  <span>{STATUS_LABEL[status]}</span>
                  <span className="tabular-nums">
                    {driver.deliveriesTodayCount} today
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
