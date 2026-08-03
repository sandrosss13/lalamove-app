"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { VEHICLE_TYPE_GROUPS } from "@/lib/vehicle-types";

/** Oldest selectable manufacturing year; mirrors the API's lower bound. */
const MIN_VEHICLE_YEAR = 1980;

/** The `Vehicle` fields this form edits, as stored. */
export type EditableVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  vehicleType: string;
  capacityKg: number | null;
};

/**
 * Driver-facing editor for a vehicle's details, rendered inside its card and
 * collapsed to a single "Edit" button until opened. Saving sends the full field
 * set to PATCH /api/driver-profile/vehicles/{id}.
 *
 * Photos are deliberately not editable here — replacing one still means
 * removing the vehicle and re-adding it — so this form has no file input, which
 * is why it uses controlled inputs (like `AccountProfileForm`) rather than the
 * uncontrolled `FormData` approach `VehicleForm` is forced into.
 */
export function EditVehicleForm({ vehicle }: { vehicle: EditableVehicle }) {
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [plateNumber, setPlateNumber] = useState(vehicle.plateNumber);
  const [make, setMake] = useState(vehicle.make);
  const [model, setModel] = useState(vehicle.model);
  const [year, setYear] = useState(String(vehicle.year));
  const [vehicleType, setVehicleType] = useState(vehicle.vehicleType);
  // Empty string is the "not specified" capacity, which the API stores as null.
  const [capacityKg, setCapacityKg] = useState(
    vehicle.capacityKg === null ? "" : String(vehicle.capacityKg),
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Registrations run a model year ahead of the calendar, so next year is a
  // legitimate choice.
  const maxYear = new Date().getFullYear() + 1;

  /**
   * Discards the in-progress edit and closes the form. The fields go back to
   * the vehicle's stored values so reopening starts from the real data rather
   * than a previously abandoned edit.
   */
  function handleCancel() {
    setPlateNumber(vehicle.plateNumber);
    setMake(vehicle.make);
    setModel(vehicle.model);
    setYear(String(vehicle.year));
    setVehicleType(vehicle.vehicleType);
    setCapacityKg(
      vehicle.capacityKg === null ? "" : String(vehicle.capacityKg),
    );
    setError(null);
    setEditing(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/driver-profile/vehicles/${vehicle.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // The endpoint takes the full field set, not a partial patch.
          body: JSON.stringify({
            plateNumber,
            make,
            model,
            year,
            vehicleType,
            capacityKg,
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // The form stays open with the entered values so the edit isn't lost.
        setError(payload?.error ?? "Could not save this vehicle.");
        return;
      }

      // Server component re-renders the card with the saved details.
      router.refresh();
      setEditing(false);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit vehicle ${vehicle.plateNumber}`}
          className="rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Plate number
        <input
          type="text"
          required
          value={plateNumber}
          onChange={(event) => setPlateNumber(event.target.value)}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Make
        <input
          type="text"
          required
          value={make}
          onChange={(event) => setMake(event.target.value)}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Model
        <input
          type="text"
          required
          value={model}
          onChange={(event) => setModel(event.target.value)}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Year
        <input
          type="number"
          required
          min={MIN_VEHICLE_YEAR}
          max={maxYear}
          step={1}
          value={year}
          onChange={(event) => setYear(event.target.value)}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Vehicle type
        <select
          required
          value={vehicleType}
          onChange={(event) => setVehicleType(event.target.value)}
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
          min={1}
          step="any"
          placeholder="e.g. 1200"
          value={capacityKg}
          onChange={(event) => setCapacityKg(event.target.value)}
          className="rounded border px-3 py-2"
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded border px-4 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="text-sm hover:opacity-70 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
