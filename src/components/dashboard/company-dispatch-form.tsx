"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

/** One driver on the company's roster this delivery may be dispatched to. */
export type DispatchDriverOption = { userId: string; name: string };

/** One fleet vehicle of the type this delivery asks for. */
export type DispatchVehicleOption = { id: string; label: string };

/**
 * Company-facing dispatch form for an order the company has claimed: pick a
 * driver from the roster and a vehicle from the fleet, and the delivery becomes
 * that driver's (CLAIMED → ACCEPTED) via
 * POST /api/logistics-company/orders/{orderId}/dispatch.
 *
 * `vehicles` has already been narrowed by the caller to the type this order
 * requires — this component never re-checks the match, the same division of
 * labour `AcceptOrderButton` uses. Both lists come from the server render, so an
 * empty one means the company genuinely has nothing to dispatch with and is told
 * what is missing rather than shown a form that cannot be submitted.
 *
 * Loading and error state are surfaced inline (no `alert()`), and a successful
 * dispatch refreshes the server component so the card reflects the assignment.
 */
export function CompanyDispatchForm({
  orderId,
  drivers,
  vehicles,
}: {
  orderId: string;
  drivers: DispatchDriverOption[];
  vehicles: DispatchVehicleOption[];
}) {
  const router = useRouter();
  const driverSelectId = useId();
  const vehicleSelectId = useId();
  const [driverUserId, setDriverUserId] = useState(drivers[0]?.userId ?? "");
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (drivers.length === 0 || vehicles.length === 0) {
    return (
      <p className="mt-3 text-sm opacity-70">
        {drivers.length === 0
          ? "Add a driver to your roster to dispatch this delivery."
          : "None of your fleet vehicles match the type this delivery requires."}
      </p>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/logistics-company/orders/${orderId}/dispatch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverUserId, vehicleId }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not dispatch this delivery.");
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
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={driverSelectId} className="text-sm opacity-60">
          Driver
        </label>
        <select
          id={driverSelectId}
          value={driverUserId}
          onChange={(event) => setDriverUserId(event.target.value)}
          disabled={submitting}
          className="self-start rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {drivers.map((driver) => (
            <option key={driver.userId} value={driver.userId}>
              {driver.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={vehicleSelectId} className="text-sm opacity-60">
          Vehicle
        </label>
        <select
          id={vehicleSelectId}
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
          disabled={submitting}
          className="self-start rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={submitting || driverUserId === "" || vehicleId === ""}
        className="self-start rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70 disabled:opacity-50"
      >
        {submitting ? "Dispatching…" : "Dispatch delivery"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
