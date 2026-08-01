"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { VEHICLE_TYPE_GROUPS } from "@/lib/vehicle-types";

/** Oldest selectable manufacturing year; mirrors the API's lower bound. */
const MIN_VEHICLE_YEAR = 1980;

/**
 * Driver-facing form that registers a vehicle via
 * POST /api/driver-profile/vehicles.
 *
 * Unlike the other forms in the app this one is uncontrolled and submitted as
 * `FormData` built from the form element: a `<input type="file">` cannot be a
 * controlled React input, and the endpoint takes `multipart/form-data` anyway,
 * so mirroring the field names here is both simpler and less to keep in sync.
 * A successful add resets the fields and refreshes the server component so the
 * new vehicle appears in the list above.
 */
export function VehicleForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      const response = await fetch("/api/driver-profile/vehicles", {
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
      setSuccess(true);
      router.refresh();
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
          placeholder="e.g. Sprinter"
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

      <label className="flex flex-col gap-1 text-sm">
        Vehicle type
        <select
          name="vehicleType"
          required
          defaultValue=""
          className="rounded border px-3 py-2"
        >
          <option value="" disabled>
            Select a vehicle type…
          </option>
          {VEHICLE_TYPE_GROUPS.map((group) => (
            <optgroup key={group.category} label={group.category}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Load capacity in kg (optional)
        <input
          type="number"
          name="capacityKg"
          min={1}
          step="any"
          placeholder="e.g. 1200"
          className="rounded border px-3 py-2"
        />
      </label>

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
        <p className="text-sm text-green-700">Vehicle added.</p>
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
