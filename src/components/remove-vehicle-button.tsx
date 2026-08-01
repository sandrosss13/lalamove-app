"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Driver-facing button that deletes one of their vehicles via
 * DELETE /api/driver-profile/vehicles/{vehicleId}. Loading and error state are
 * surfaced inline (no `alert()`), and a successful delete refreshes the server
 * component so the vehicle list reflects the removal.
 *
 * The removal is irreversible — the photos go with it — so it is confirmed with
 * a second click rather than a native dialog, keeping the interaction inline
 * with the rest of the page.
 */
export function RemoveVehicleButton({
  vehicleId,
  plateNumber,
}: {
  vehicleId: string;
  plateNumber: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/driver-profile/vehicles/${vehicleId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not remove this vehicle.");
        setConfirming(false);
        return;
      }

      // Server component re-renders without the deleted vehicle.
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRemove}
          disabled={submitting}
          aria-label={`Remove vehicle ${plateNumber}`}
          className="rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70 disabled:opacity-50"
        >
          {submitting ? "Removing…" : confirming ? "Confirm remove" : "Remove"}
        </button>
        {confirming && !submitting ? (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-sm hover:opacity-70"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
