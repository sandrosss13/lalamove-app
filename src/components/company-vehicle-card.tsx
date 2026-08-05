import type { ReactNode } from "react";

/**
 * The subset of `Vehicle` fields a fleet vehicle card needs to render.
 *
 * `vehicleTypeSpec` is the vehicle's `VehicleTypeSpec` relation: the type's
 * label, payload limit and loading access are no longer columns on `Vehicle`,
 * so the caller resolves them. A server component fetching the vehicle with
 * `include: { vehicleTypeSpec: true }` satisfies this prop as-is.
 */
type CompanyVehicleCardVehicle = {
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  photoUrls: string[];
  vehicleTypeSpec: {
    label: string;
    maxPayloadKg: number;
    loadingAccessType: string;
  };
};

/** Human-readable form of the `LoadingAccessType` enum values. */
const LOADING_ACCESS_LABELS: Record<string, string> = {
  REAR_DOOR: "Rear door",
  SIDE_DOOR: "Side door",
  RAMP: "Ramp",
  TAIL_LIFT: "Tail lift",
  OPEN_FLATBED: "Open flatbed",
};

/**
 * Presentation for a single company-owned vehicle: its photos, plate, and the
 * specs a dispatcher picks by. Loading access is shown here (and not on the
 * driver's own card) because choosing between trucks for a load is a fleet
 * concern.
 *
 * `children` renders after the spec grid (e.g. the remove button) so the card
 * itself stays a server component and only the interactive part ships JS — the
 * same split `VehicleCard` uses.
 */
export function CompanyVehicleCard({
  vehicle,
  children,
}: {
  vehicle: CompanyVehicleCardVehicle;
  children?: ReactNode;
}) {
  const { vehicleTypeSpec } = vehicle;

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
        <span className="text-sm opacity-70">{vehicleTypeSpec.label}</span>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="opacity-60">Vehicle</dt>
        <dd>
          {vehicle.make} {vehicle.model}
        </dd>
        <dt className="opacity-60">Year</dt>
        <dd>{vehicle.year}</dd>
        <dt className="opacity-60">Max payload</dt>
        <dd>{vehicleTypeSpec.maxPayloadKg} kg</dd>
        <dt className="opacity-60">Loading</dt>
        <dd>
          {/* Falls back to the raw value so a newly added access type still
              renders as something rather than blank. */}
          {LOADING_ACCESS_LABELS[vehicleTypeSpec.loadingAccessType] ??
            vehicleTypeSpec.loadingAccessType}
        </dd>
      </dl>

      {children}
    </li>
  );
}
