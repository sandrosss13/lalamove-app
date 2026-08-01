import type { ReactNode } from "react";

import { vehicleTypeLabel } from "@/lib/vehicle-types";

/** The subset of `Vehicle` fields a vehicle card needs to render. */
type VehicleCardVehicle = {
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  vehicleType: string;
  capacityKg: number | null;
  photoUrls: string[];
};

/**
 * Presentation for a single registered vehicle: its photos, plate, and specs.
 * `children` renders after the spec grid (e.g. the remove button) so the card
 * itself stays a server component and only the interactive part ships JS —
 * the same split `OrderCard`/`AcceptOrderButton` uses.
 */
export function VehicleCard({
  vehicle,
  children,
}: {
  vehicle: VehicleCardVehicle;
  children?: ReactNode;
}) {
  return (
    <li className="rounded border p-4">
      {vehicle.photoUrls.length === 0 ? (
        <div className="flex h-24 w-32 items-center justify-center rounded border border-dashed text-xs opacity-60">
          No photo
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {vehicle.photoUrls.map((photoUrl) => (
            <li key={photoUrl}>
              {/*
                Plain <img> rather than next/image: the photos live on the
                project's own Supabase host, which is configured per deployment
                via SUPABASE_URL, so it can't be pinned in `remotePatterns` at
                build time.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt={`${vehicle.make} ${vehicle.model}, plate ${vehicle.plateNumber}`}
                loading="lazy"
                className="h-24 w-32 rounded border object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-sm font-semibold tracking-wider">
          {vehicle.plateNumber}
        </span>
        <span className="text-sm opacity-70">
          {vehicleTypeLabel(vehicle.vehicleType)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="opacity-60">Vehicle</dt>
        <dd>
          {vehicle.make} {vehicle.model}
        </dd>
        <dt className="opacity-60">Year</dt>
        <dd>{vehicle.year}</dd>
        {vehicle.capacityKg === null ? null : (
          <>
            <dt className="opacity-60">Capacity</dt>
            <dd>{vehicle.capacityKg} kg</dd>
          </>
        )}
      </dl>

      {children}
    </li>
  );
}
