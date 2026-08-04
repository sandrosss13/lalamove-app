"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CargoCategory } from "@prisma/client";

import { useSession } from "@/lib/auth-client";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { LandingPage } from "@/components/landing/landing-page";
import type { VehicleTypeOption } from "@/components/vehicle-type-select";
import {
  CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES,
  CARGO_CATEGORY_LABELS,
} from "@/lib/cargo";

/**
 * Selectable cargo categories, in the order the taxonomy declares them. The
 * cast is safe because `CARGO_CATEGORY_LABELS` is keyed by `CargoCategory`,
 * which `Object.entries` widens to `string`.
 */
const CARGO_CATEGORY_OPTIONS = Object.entries(CARGO_CATEGORY_LABELS) as [
  CargoCategory,
  string,
][];

const DEFAULT_CARGO_CATEGORY: CargoCategory = "FURNITURE_FURNISHINGS";

/** Duty classes in the order they are offered, lightest first. */
const VEHICLE_CATEGORY_ORDER: VehicleTypeOption["category"][] = [
  "MEDIUM_DUTY",
  "HEAVY_DUTY",
];

const VEHICLE_CATEGORY_LABELS: Record<VehicleTypeOption["category"], string> = {
  MEDIUM_DUTY: "Medium duty",
  HEAVY_DUTY: "Heavy duty",
};

const VEHICLE_TYPES_FAILED_MESSAGE =
  "Could not load the vehicle types. Please refresh and try again.";

/**
 * Tolerance, in currency units, for comparing a total against the sum of its
 * parts: half a cent absorbs floating-point drift without ever masking a real
 * difference, which is at least one whole cent.
 */
const CURRENCY_EPSILON = 0.005;

/**
 * Fields of the created order the form surfaces back to the user — the itemised
 * quote it was booked at, not just the total.
 */
type CreatedOrder = {
  id: string;
  distanceKm: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  helperFee: number;
  price: number;
};

export default function Home() {
  const { data: session, isPending } = useSession();

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [cargoCategory, setCargoCategory] = useState<CargoCategory>(
    DEFAULT_CARGO_CATEGORY,
  );
  const [vehicleTypeCode, setVehicleTypeCode] = useState("");
  const [requiresHelper, setRequiresHelper] = useState(false);
  const [description, setDescription] = useState("");

  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeOption[]>([]);
  const [loadingVehicleTypes, setLoadingVehicleTypes] = useState(true);
  const [vehicleTypesError, setVehicleTypesError] = useState<string | null>(
    null,
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedOrder | null>(null);

  // Drivers get pointed at their deliveries instead of this form, so they never
  // need the taxonomy — see the branch further down.
  const showsBookingForm = Boolean(session) && session?.user.role !== "DRIVER";

  // The vehicle taxonomy is seeded database rows rather than a hardcoded enum,
  // so the picker is built from the public `GET /api/vehicle-types`.
  useEffect(() => {
    if (!showsBookingForm) {
      return;
    }

    // Aborts the request if the form unmounts before it resolves, so the
    // response never lands on a dead component.
    const controller = new AbortController();

    async function loadVehicleTypes() {
      try {
        const response = await fetch("/api/vehicle-types", {
          signal: controller.signal,
        });

        if (!response.ok) {
          setVehicleTypesError(VEHICLE_TYPES_FAILED_MESSAGE);
          return;
        }

        setVehicleTypes((await response.json()) as VehicleTypeOption[]);
      } catch {
        // An abort lands here too, but the form is on its way out by then so
        // the state update is skipped along with everything else.
        if (!controller.signal.aborted) {
          setVehicleTypesError(VEHICLE_TYPES_FAILED_MESSAGE);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingVehicleTypes(false);
        }
      }
    }

    void loadVehicleTypes();

    return () => {
      controller.abort();
    };
  }, [showsBookingForm]);

  const allowedVehicleCategories =
    CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory];

  // Heavy cargo cannot travel in a medium-duty van, so the picker only ever
  // offers types the chosen cargo is actually allowed in.
  const availableVehicleTypes = vehicleTypes.filter((vehicleType) =>
    allowedVehicleCategories.includes(vehicleType.category),
  );

  const selectedVehicleType =
    availableVehicleTypes.find(
      (vehicleType) => vehicleType.code === vehicleTypeCode,
    ) ?? null;

  function handleCargoCategoryChange(next: CargoCategory) {
    setCargoCategory(next);

    // A type picked for the previous category may not be eligible for the new
    // one; dropping it stops a stale selection being submitted invisibly.
    const nextAllowed = CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[next];
    const selected = vehicleTypes.find(
      (vehicleType) => vehicleType.code === vehicleTypeCode,
    );

    if (selected && !nextAllowed.includes(selected.category)) {
      setVehicleTypeCode("");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          dropoffAddress,
          cargoCategory,
          vehicleTypeCode,
          requiresHelper,
          description: description.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as
        CreatedOrder | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : "Could not create the order. Please try again.";
        setError(message);
        return;
      }

      setResult(payload as CreatedOrder);
      setPickupAddress("");
      setDropoffAddress("");
      setDescription("");
      setRequiresHelper(false);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isPending) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
        <p className="text-center opacity-50">Loading…</p>
      </main>
    );
  }

  if (!session) {
    return <LandingPage />;
  }

  // Drivers don't book deliveries — they fulfil them. Point them at their
  // available-deliveries view instead of showing the client booking form.
  if (session.user.role === "DRIVER") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">
          You&apos;re signed in as a driver
        </h1>
        <p className="opacity-70">
          Clients book deliveries here — drivers fulfil them. Head to your
          deliveries to see what&apos;s available and accept a job.
        </p>
        <div className="flex justify-center">
          <Link
            href="/orders"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            View available deliveries →
          </Link>
        </div>
      </main>
    );
  }

  // The quoted total is floored at the vehicle type's minimum fare, so it can
  // come out above the sum of the components — worth saying, or the breakdown
  // reads as bad arithmetic.
  const minimumFareApplied =
    result !== null &&
    result.price - CURRENCY_EPSILON >
      result.baseFare +
        result.distanceFare +
        result.timeFare +
        result.helperFee;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Book a delivery</h1>
        <Link href="/orders" className="text-sm font-medium hover:opacity-70">
          My orders →
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AddressAutocomplete
          id="pickup-address"
          label="Pickup address"
          value={pickupAddress}
          onChange={setPickupAddress}
          placeholder="e.g. 10 Downing Street, London"
          required
        />

        <AddressAutocomplete
          id="dropoff-address"
          label="Dropoff address"
          value={dropoffAddress}
          onChange={setDropoffAddress}
          placeholder="e.g. Buckingham Palace, London"
          required
        />

        <label className="flex flex-col gap-1 text-sm">
          Cargo category
          <select
            value={cargoCategory}
            onChange={(event) =>
              handleCargoCategoryChange(event.target.value as CargoCategory)
            }
            className="rounded border px-3 py-2"
          >
            {CARGO_CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Vehicle type
          <select
            value={vehicleTypeCode}
            onChange={(event) => setVehicleTypeCode(event.target.value)}
            required
            // Disabled while loading so the form can't be submitted with a type
            // the picker hasn't offered yet.
            disabled={loadingVehicleTypes || vehicleTypesError !== null}
            className="rounded border px-3 py-2 disabled:opacity-50"
          >
            <option value="" disabled>
              {loadingVehicleTypes
                ? "Loading vehicle types…"
                : "Select a vehicle type…"}
            </option>
            {VEHICLE_CATEGORY_ORDER.map((category) => {
              const grouped = availableVehicleTypes.filter(
                (vehicleType) => vehicleType.category === category,
              );

              if (grouped.length === 0) {
                return null;
              }

              return (
                <optgroup
                  key={category}
                  label={VEHICLE_CATEGORY_LABELS[category]}
                >
                  {grouped.map((vehicleType) => (
                    <option key={vehicleType.code} value={vehicleType.code}>
                      {vehicleType.label}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {vehicleTypesError ? (
            <span className="text-sm text-red-600">{vehicleTypesError}</span>
          ) : selectedVehicleType ? (
            <span className="text-xs opacity-60">
              Max payload: {selectedVehicleType.maxPayloadKg} kg
            </span>
          ) : null}
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={requiresHelper}
            onChange={(event) => setRequiresHelper(event.target.checked)}
            className="mt-1"
          />
          <span>
            Request a helper / mover
            <span className="block text-xs opacity-60">
              An extra pair of hands for loading and unloading, charged as a
              flat fee on top of the fare.
            </span>
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Anything the driver should know"
            className="rounded border px-3 py-2"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="rounded border px-3 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          {submitting ? "Getting a quote…" : "Get quote & book"}
        </button>
      </form>

      {result ? (
        <div className="rounded border border-green-600 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-800">Order created!</p>

          <dl className="mt-2 flex flex-col gap-1 text-green-900">
            <div className="flex justify-between gap-4">
              <dt>Distance</dt>
              <dd>{result.distanceKm.toFixed(2)} km</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Base fare</dt>
              <dd>${result.baseFare.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Distance fare</dt>
              <dd>${result.distanceFare.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Time fare</dt>
              <dd>${result.timeFare.toFixed(2)}</dd>
            </div>
            {result.helperFee > 0 ? (
              <div className="flex justify-between gap-4">
                <dt>Helper</dt>
                <dd>${result.helperFee.toFixed(2)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between gap-4 border-t border-green-600 pt-1 font-semibold">
              <dt>Total</dt>
              <dd>${result.price.toFixed(2)}</dd>
            </div>
          </dl>

          {minimumFareApplied ? (
            <p className="mt-1 text-xs text-green-900 opacity-70">
              Minimum fare applied for this vehicle type.
            </p>
          ) : null}

          <Link
            href="/orders"
            className="mt-2 inline-block font-medium underline hover:opacity-70"
          >
            View your orders
          </Link>
        </div>
      ) : null}
    </main>
  );
}
