"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Company-facing button that retires a fleet vehicle via
 * DELETE /api/logistics-company/vehicles/{vehicleId}.
 *
 * Deliberately a mirror of `RemoveVehicleButton` rather than a shared component
 * parameterised by endpoint: the two differ only in the URL today, but they
 * belong to different owners and are free to diverge (a fleet vehicle may later
 * need a "reassign before retiring" step that a driver's own vehicle never
 * will).
 *
 * The removal is irreversible — the photos go with it — so it is confirmed with
 * a second click rather than a native dialog, keeping the interaction inline
 * with the rest of the page.
 */
export function CompanyRemoveVehicleButton({
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
        `/api/logistics-company/vehicles/${vehicleId}`,
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
          aria-label={`Remove vehicle ${plateNumber} from your fleet`}
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
