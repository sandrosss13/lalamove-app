import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { LicenceCategory, VehicleClass } from "@prisma/client";

import { DriversScreen } from "@/components/driver-hub/screens/drivers-screen";
import type { DriversVehicleOption } from "@/components/driver-hub/screens/drivers-add-panel";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import { getHubDrivers } from "@/lib/dashboard/hub/drivers";
import { getHubVehicles } from "@/lib/dashboard/hub/vehicles";
import type { HubVehicle } from "@/lib/dashboard/hub/vehicles";
import { VEHICLE_CLASSES } from "@/lib/driver-onboarding/vehicle-classes";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Drivers · Driver Hub",
};

/**
 * Where a non-business account is sent — the board, which the hub labels
 * "Dashboard" and puts first in every persona's rail.
 *
 * The one hub screen that bounces nobody: `(hub)/loads/page.tsx` carries no
 * guard of its own, so a redirect here always comes to rest rather than
 * starting a second hop. It is also where `src/app/dashboard/page.tsx` sends
 * this account in the first place, so a driver who follows a stale Drivers
 * bookmark is returned to the screen they signed in on.
 */
const HUB_HOME = "/dashboard/loads";

/**
 * The licence category a vehicle's class demands, or null when it declares no
 * class.
 *
 * Deliberately total rather than reusing `findVehicleClass()`, which throws:
 * `VehicleClass` is a database enum and `VEHICLE_CLASSES` is a hand-maintained
 * TypeScript list, so a class added to the schema first would take this page
 * down instead of degrading to "no category requirement" — which is exactly how
 * the register route treats an unknown class too, so the form and the endpoint
 * agree.
 */
function requiredCategoryFor(
  vehicleClass: VehicleClass | null,
): LicenceCategory | null {
  if (vehicleClass === null) {
    return null;
  }

  return (
    VEHICLE_CLASSES.find((entry) => entry.id === vehicleClass)
      ?.requiredLicenceCategory ?? null
  );
}

/**
 * The fleet vehicles the register form may offer: company-owned, and held by
 * nobody right now.
 *
 * Both filters mirror what `POST /api/logistics-company/drivers/register`
 * enforces — it rejects a vehicle from another owner and a vehicle with a live
 * assignment — so the list never contains a choice that would come back a 400.
 */
function vehicleOptions(vehicles: HubVehicle[]): DriversVehicleOption[] {
  return vehicles
    .filter(
      (vehicle) =>
        vehicle.ownership === "COMPANY" && vehicle.assignment === null,
    )
    .map((vehicle) => ({
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      description: `${vehicle.make} ${vehicle.model} · ${vehicle.vehicleClassLabel}`,
      requiredLicenceCategory: requiredCategoryFor(vehicle.vehicleClass),
    }));
}

/**
 * The fleet's driver roster: who is on it, who is online, and what each of
 * them earned.
 *
 * Business-only, and the guard below — not the sidebar — is what enforces
 * that. `hubNavForKind()` merely hides the link, which does nothing about a
 * hand-typed URL, a bookmark, or a driver who was a company yesterday. The
 * check therefore lives here, in the page.
 *
 * `resolveHubAccount()` is React-`cache()`d and the layout above already called
 * it, so this is a memo hit within the same request, not a second query. A
 * `null` account cannot reach here at all: the layout renders its own
 * "profile isn't set up yet" fallback instead of these children.
 *
 * `getHubDrivers()` re-derives the business-only rule itself and answers `null`
 * for anything else. That cannot happen after the guard above, but it is
 * honoured rather than asserted away — a `null!` here would turn a future
 * change in either check into a runtime crash instead of a redirect.
 *
 * The vehicle list is fetched alongside the roster because the register form in
 * the right rail offers a vehicle to assign; the two queries are independent,
 * so they run together rather than in sequence.
 */
export default async function DriversPage() {
  const account = await resolveHubAccount();

  if (account?.kind !== "BUSINESS") {
    redirect(HUB_HOME);
  }

  const [drivers, vehicles] = await Promise.all([
    getHubDrivers(account),
    getHubVehicles(account),
  ]);

  if (drivers === null) {
    redirect(HUB_HOME);
  }

  return (
    <DriversScreen
      data={drivers}
      vehicles={vehicleOptions(vehicles.vehicles)}
    />
  );
}
