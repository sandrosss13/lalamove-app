"use client";

import { useEffect, useState } from "react";

/**
 * The fields of a vehicle type this picker needs. `GET /api/vehicle-types`
 * returns more per entry (cargo dimensions, loading access, pricing rule);
 * anything not listed here is simply ignored.
 */
export type VehicleTypeOption = {
  code: string;
  label: string;
  category: "MEDIUM_DUTY" | "HEAVY_DUTY";
  maxPayloadKg: number;
};

/** Duty classes in the order they are offered, lightest first. */
const CATEGORY_ORDER: VehicleTypeOption["category"][] = [
  "MEDIUM_DUTY",
  "HEAVY_DUTY",
];

const CATEGORY_LABELS: Record<VehicleTypeOption["category"], string> = {
  MEDIUM_DUTY: "Medium duty",
  HEAVY_DUTY: "Heavy duty",
};

const LOAD_FAILED_MESSAGE =
  "Could not load the vehicle types. Please refresh and try again.";

/**
 * Vehicle-type picker shared by every form that registers a vehicle (a driver's
 * own, a company's fleet, and the edit form).
 *
 * The taxonomy is seeded database rows rather than a hardcoded enum, so the
 * options are fetched from the public `GET /api/vehicle-types` endpoint on
 * mount and grouped by duty class. Payload capacity is no longer entered per
 * vehicle — it comes from the chosen type — so the selected type's limit is
 * shown read-only underneath, which is the number the owner is committing to.
 *
 * The `<select>` carries `name`, so the uncontrolled `FormData`-based forms
 * pick its value up without any extra wiring; `value`/`onChange` exist so the
 * caller can render the selection elsewhere and so the edit form can start from
 * a stored type.
 */
export function VehicleTypeSelect({
  value,
  onChange,
  name = "vehicleTypeCode",
  label = "Vehicle type",
}: {
  value: string;
  onChange: (vehicleTypeCode: string) => void;
  name?: string;
  label?: string;
}) {
  const [options, setOptions] = useState<VehicleTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Aborts the request if the form unmounts before it resolves, so the
    // response never lands on a dead component.
    const controller = new AbortController();

    async function loadVehicleTypes() {
      try {
        const response = await fetch("/api/vehicle-types", {
          signal: controller.signal,
        });

        if (!response.ok) {
          setError(LOAD_FAILED_MESSAGE);
          return;
        }

        setOptions((await response.json()) as VehicleTypeOption[]);
      } catch {
        // An abort lands here too, but the component is on its way out by then
        // so the state update is skipped along with everything else.
        if (!controller.signal.aborted) {
          setError(LOAD_FAILED_MESSAGE);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadVehicleTypes();

    return () => {
      controller.abort();
    };
  }, []);

  const selected = options.find((option) => option.code === value) ?? null;

  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select
        name={name}
        required
        // Disabled while loading so the form can't be submitted with a type the
        // picker hasn't offered yet.
        disabled={loading || error !== null}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded border px-3 py-2 disabled:opacity-50"
      >
        <option value="" disabled>
          {loading ? "Loading vehicle types…" : "Select a vehicle type…"}
        </option>
        {CATEGORY_ORDER.map((category) => {
          const grouped = options.filter(
            (option) => option.category === category,
          );

          if (grouped.length === 0) {
            return null;
          }

          return (
            <optgroup key={category} label={CATEGORY_LABELS[category]}>
              {grouped.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>

      {error ? (
        <span className="text-sm text-red-600">{error}</span>
      ) : selected ? (
        <span className="text-xs opacity-60">
          Max payload: {selected.maxPayloadKg} kg
        </span>
      ) : null}
    </label>
  );
}
