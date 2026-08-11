"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { OpsDriver } from "@/lib/company-dashboard-data";
import { formatCity } from "@/lib/format-city";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

/** Matches the tabs' money formatting: whole dollars, thousands separated. */
function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ops-surface-raised p-3.5">
      <div className="text-[11px] tracking-wide text-ops-text-muted uppercase">
        {label}
      </div>
      <div className="font-ops mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

/**
 * Read-only profile of one roster driver — contact details, live status,
 * assigned vehicle and delivery figures — plus the single write this view
 * offers: removing the driver from the company's roster.
 *
 * The status line is deliberately *not* a toggle. `isOnline` is self-service
 * only: the driver's own app flips it alongside a geolocation beacon interval,
 * so a company-side force-toggle would leave the flag claiming "online" with no
 * beacon actually running behind it. There is likewise no star rating anywhere
 * here — the schema stores no rating data, so any figure shown would be
 * invented.
 *
 * `driver` is nullable for the same reason as the order drawer's `order`: the
 * shell resolves it by id out of possibly-refreshed data.
 */
export function DriverDetailDrawer({ driver }: { driver: OpsDriver | null }) {
  const router = useRouter();
  const { closeDrawer, showToast } = useOpsDashboard();
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!driver) return null;

  // Captured before the handler so the closure does not depend on narrowing the
  // nullable prop across an early return.
  const { userId, name, assignedVehicle } = driver;

  /**
   * Removal is confirmed with a second click rather than a native dialog, the
   * same interaction `CompanyRemoveVehicleButton` uses, so the whole flow stays
   * inline in the drawer.
   *
   * The DELETE call is reproduced here rather than shared with
   * `CompanyDriverRoster`: that component bundles the request with an
   * add-by-email form and its own list rendering, none of which fits this
   * layout, and the two are free to diverge.
   */
  async function handleRemove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setRemoving(true);

    try {
      const response = await fetch(`/api/logistics-company/drivers/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        showToast(payload?.error ?? "Could not remove this driver.", "error");
        setConfirming(false);
        return;
      }

      showToast(`${name} removed from your roster.`);
      // Server component re-renders without the removed driver.
      router.refresh();
      closeDrawer();
    } catch {
      showToast(
        "Network error. Please check your connection and try again.",
        "error",
      );
      setConfirming(false);
    } finally {
      setRemoving(false);
    }
  }

  // Mid-order beats the online flag: an in-transit driver reading as "offline"
  // because their heartbeat lapsed would be misleading. Same precedence the
  // Fleet and Drivers tabs use.
  const statusLabel = driver.hasActiveDelivery
    ? "On delivery"
    : driver.isOnline
      ? "Online"
      : "Offline";

  return (
    <OpsDrawerShell title={name} widthClassName="w-[380px]">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-ops-surface-raised text-[15px] font-semibold">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 text-sm text-ops-text-muted">
          {assignedVehicle ? assignedVehicle.plateNumber : "No vehicle"} ·{" "}
          {formatCity(driver.city)}
        </div>
      </div>

      <div className="mb-5 rounded-lg bg-ops-surface-raised py-2.5 text-center text-sm font-medium">
        {statusLabel}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatTile label="Today" value={String(driver.deliveriesTodayCount)} />
        <StatTile
          label="Completed"
          value={String(driver.completedTotalCount)}
        />
        <StatTile
          label="Earned this month"
          value={formatCurrency(driver.earnedThisMonthTotal)}
        />
        <StatTile label="Vehicle" value={assignedVehicle?.plateNumber ?? "—"} />
      </div>

      <div className="mb-5 text-sm break-words text-ops-text-muted">
        Contact: {driver.phone} · {driver.email}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          aria-label={`Remove ${name} from your roster`}
          className="rounded-lg border border-ops-border px-3 py-2 text-sm font-medium text-ops-danger hover:opacity-70 disabled:opacity-50"
        >
          {removing
            ? "Removing…"
            : confirming
              ? "Confirm remove"
              : "Remove from roster"}
        </button>
        {confirming && !removing ? (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-sm text-ops-text-muted hover:opacity-70"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </OpsDrawerShell>
  );
}
