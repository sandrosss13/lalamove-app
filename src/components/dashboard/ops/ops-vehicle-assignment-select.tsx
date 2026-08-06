"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";

/**
 * The `<option>` value standing for "no driver". The empty string is safe as a
 * sentinel because it can never collide with a real `User.id`.
 */
const UNASSIGNED_VALUE = "";

/**
 * The per-row driver control on the Vehicles tab: reads the vehicle's current
 * pairing and writes a new one through the assignment resource
 * (`/api/logistics-company/vehicles/[id]/assignment`).
 *
 * The route deliberately refuses to overwrite a live pairing — unassigning is a
 * decision about a named driver, so it must be explicit — which makes a
 * reassignment two calls here: DELETE the existing assignment, then POST the new
 * one. A fresh assignment is POST only, and choosing "unassigned" is DELETE only.
 *
 * Follows the app's hand-rolled mutation pattern (`useState` + `fetch` +
 * `router.refresh()`), reporting through the dashboard's shared toast rather
 * than inline error text: the control sits in a narrow table cell with no room
 * for a message, and unlike the form components it has no `onSuccess` prop
 * because it is only ever rendered inside the ops shell.
 */
export function OpsVehicleAssignmentSelect({
  vehicle,
  drivers,
}: {
  vehicle: CompanyDashboardData["fleet"][number];
  drivers: CompanyDashboardData["drivers"];
}) {
  const router = useRouter();
  const { showToast } = useOpsDashboard();
  const [submitting, setSubmitting] = useState(false);

  const currentValue =
    vehicle.activeAssignment?.driverUserId ?? UNASSIGNED_VALUE;

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextDriverUserId = event.target.value;

    setSubmitting(true);

    // Tracks whether the DELETE below already went through, so a failure in the
    // POST that follows still refreshes: at that point the vehicle really is
    // unassigned on the server, and leaving the row showing the old driver would
    // contradict the database until the next unrelated refresh.
    let unassigned = false;

    try {
      if (vehicle.activeAssignment) {
        const deleteResponse = await fetch(
          `/api/logistics-company/vehicles/${vehicle.id}/assignment`,
          { method: "DELETE" },
        );

        if (!deleteResponse.ok) {
          const payload = (await deleteResponse.json().catch(() => null)) as {
            error?: string;
          } | null;
          showToast(
            payload?.error ?? "Could not unassign this vehicle.",
            "error",
          );
          return;
        }

        unassigned = true;
      }

      if (nextDriverUserId !== UNASSIGNED_VALUE) {
        const assignResponse = await fetch(
          `/api/logistics-company/vehicles/${vehicle.id}/assignment`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ driverUserId: nextDriverUserId }),
          },
        );

        if (!assignResponse.ok) {
          const payload = (await assignResponse.json().catch(() => null)) as {
            error?: string;
          } | null;
          showToast(
            payload?.error ?? "Could not assign this vehicle.",
            "error",
          );
          return;
        }
      }

      const driverName = drivers.find(
        (driver) => driver.userId === nextDriverUserId,
      )?.name;

      showToast(
        nextDriverUserId === UNASSIGNED_VALUE
          ? `${vehicle.plateNumber} unassigned.`
          : `${driverName ?? "Driver"} assigned to ${vehicle.plateNumber}.`,
      );

      // Re-runs the server component so this row — and the driver's row on the
      // other tabs, which reads the same pairing — shows the new assignment.
      unassigned = false;
      router.refresh();
    } catch {
      showToast(
        "Network error. Please check your connection and try again.",
        "error",
      );
    } finally {
      // Only reached on a failure path that already closed the old assignment;
      // the success path refreshed above and reset the flag.
      if (unassigned) {
        router.refresh();
      }
      setSubmitting(false);
    }
  }

  return (
    <select
      value={currentValue}
      onChange={handleChange}
      disabled={submitting}
      aria-label={`Driver assigned to ${vehicle.plateNumber}`}
      className="w-full rounded-md border border-ops-border bg-ops-surface-raised px-2 py-1.5 text-xs text-ops-text outline-none focus-visible:border-ops-accent disabled:opacity-50"
    >
      <option value={UNASSIGNED_VALUE}>— Unassigned —</option>
      {drivers.map((driver) => {
        // A driver may hold only one active assignment, so choosing one who is
        // already on another vehicle is a guaranteed rejection. The option stays
        // selectable — this roster snapshot can be stale, and the route's error
        // message is clearer than an option that silently isn't there — but it
        // names the vehicle in the way so the operator can free it first.
        const heldElsewhere =
          driver.assignedVehicle && driver.assignedVehicle.id !== vehicle.id
            ? driver.assignedVehicle.plateNumber
            : null;

        return (
          <option key={driver.userId} value={driver.userId}>
            {driver.name}
            {heldElsewhere ? ` — on ${heldElsewhere}` : ""}
          </option>
        );
      })}
    </select>
  );
}
