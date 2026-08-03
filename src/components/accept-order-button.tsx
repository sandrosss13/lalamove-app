"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

/** One vehicle the driver may fulfil this delivery with. */
export type EligibleVehicle = { id: string; label: string };

/**
 * Driver-facing control that claims a pending delivery via
 * POST /api/orders/{orderId}/accept.
 *
 * Every accept records *which* vehicle is being used, so `eligibleVehicles`
 * carries the driver's vehicles whose type matches this order — the caller has
 * already filtered them, this component never re-checks the match. The picker
 * only appears when there is a real choice to make; with a single vehicle the
 * selection is implicit and the button alone is shown.
 *
 * Loading and error state are surfaced inline (no `alert()`), and a successful
 * accept refreshes the server component so the order list reflects the new
 * status/assignment.
 */
export function AcceptOrderButton({
  orderId,
  eligibleVehicles,
}: {
  orderId: string;
  eligibleVehicles: EligibleVehicle[];
}) {
  const router = useRouter();
  const selectId = useId();
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    eligibleVehicles[0]?.id ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Callers only surface orders matching a registered vehicle type, so this is
  // a defensive branch: with nothing to accept with, there is nothing to render.
  const [firstVehicle] = eligibleVehicles;
  if (firstVehicle === undefined) {
    return null;
  }

  async function handleAccept() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/orders/${orderId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: selectedVehicleId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not accept this delivery.");
        return;
      }

      // Server component re-renders with the updated order data.
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {eligibleVehicles.length > 1 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="text-sm opacity-60">
            Vehicle
          </label>
          <select
            id={selectId}
            value={selectedVehicleId}
            onChange={(event) => setSelectedVehicleId(event.target.value)}
            disabled={submitting}
            className="self-start rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {eligibleVehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-sm opacity-60">Vehicle: {firstVehicle.label}</p>
      )}

      <button
        type="button"
        onClick={handleAccept}
        disabled={submitting || selectedVehicleId === ""}
        className="self-start rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70 disabled:opacity-50"
      >
        {submitting ? "Accepting…" : "Accept delivery"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
