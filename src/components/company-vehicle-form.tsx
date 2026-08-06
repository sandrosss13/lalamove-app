"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { VehicleTypeSelect } from "@/components/vehicle-type-select";

/** Oldest selectable manufacturing year; mirrors the API's lower bound. */
const MIN_VEHICLE_YEAR = 1980;

/**
 * Company-facing form that registers a fleet vehicle via
 * POST /api/logistics-company/vehicles. The vehicle is owned by the company
 * itself, not by any driver on its roster — dispatch is what pairs a driver
 * with a vehicle, and that happens per order.
 *
 * Deliberately the same shape as `VehicleForm`: uncontrolled and submitted as
 * `FormData` built from the form element, because a `<input type="file">`
 * cannot be a controlled React input and the endpoint takes
 * `multipart/form-data` anyway. A successful add resets the fields and
 * refreshes the server component so the new vehicle appears in the fleet list.
 *
 * `onSuccess` is optional and fires only after a successful add, so a host that
 * renders this inside a drawer can close it and raise a toast.
 */
export function CompanyVehicleForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // The one controlled field: the picker needs it to show the selected type's
  // payload limit. It still submits through `FormData` like the rest.
  const [vehicleTypeCode, setVehicleTypeCode] = useState("");

  // Registrations run a model year ahead of the calendar, so next year is a
  // legitimate choice.
  const maxYear = new Date().getFullYear() + 1;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // `currentTarget` is nulled out once the handler yields at the first
    // `await`, so capture the form while it is still available.
    const form = event.currentTarget;

    setError(null);
    setSuccess(false);
    setSubmitting(true);

    try {
      const response = await fetch("/api/logistics-company/vehicles", {
        method: "POST",
        // No explicit Content-Type: the browser has to set the multipart
        // boundary itself, and passing one here would break the parse.
        body: new FormData(form),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not add this vehicle.");
        return;
      }

      form.reset();
      // `form.reset()` only restores the uncontrolled fields; React state has
      // to be cleared alongside it.
      setVehicleTypeCode("");
      setSuccess(true);
      router.refresh();
      try {
        onSuccess?.();
      } catch {
        // A bug in the caller's callback must not be reported as this
        // component's own failure: the POST succeeded and the refresh already
        // ran, so surfacing a network error here would be a lie.
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Plate number
        <input
          type="text"
          name="plateNumber"
          required
          placeholder="e.g. AA-123-BB"
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Make
        <input
          type="text"
          name="make"
          required
          placeholder="e.g. Mercedes-Benz"
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Model
        <input
          type="text"
          name="model"
          required
          placeholder="e.g. Actros"
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Year
        <input
          type="number"
          name="year"
          required
          min={MIN_VEHICLE_YEAR}
          max={maxYear}
          step={1}
          className="rounded border px-3 py-2"
        />
      </label>

      <VehicleTypeSelect
        value={vehicleTypeCode}
        onChange={setVehicleTypeCode}
      />

      <label className="flex flex-col gap-1 text-sm">
        Photos
        <input
          type="file"
          name="photos"
          accept="image/*"
          multiple
          required
          className="rounded border px-3 py-2"
        />
        <span className="text-xs opacity-60">
          At least one photo is required. You can select several at once.
        </span>
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? (
        <p className="text-sm text-green-700">Vehicle added to your fleet.</p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded border px-4 py-2 font-medium hover:opacity-70 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add vehicle"}
      </button>
    </form>
  );
}
