import type { Metadata } from "next";

import { VehiclesScreen } from "@/components/driver-hub/screens/vehicles-screen";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import { getHubVehicles } from "@/lib/dashboard/hub/vehicles";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vehicles · Driver Hub",
};

/**
 * The fleet a company owns, or the vehicle one driver drives — with its class,
 * its current driver, and the destructive action for taking it off the books.
 *
 * Open to both account kinds, unlike Drivers and Employees: an independent
 * driver has a vehicle too, and `getHubVehicles()` resolves the scope
 * difference (a company's own rows, versus a driver's own rows plus the
 * company van currently assigned to them). There is therefore no business-only
 * redirect here, and adding one would lock a driver out of their own vehicle.
 *
 * `resolveHubAccount()` is React-`cache()`d and `(hub)/layout.tsx` above already
 * called it, so this is a memo hit within the same request rather than a second
 * session validation and query. A `null` account cannot reach here at all — the
 * layout renders its own "profile isn't set up yet" fallback instead of these
 * children — which is what makes the non-null assertion below unnecessary and
 * the early return honest rather than defensive theatre: TypeScript still sees
 * `HubAccount | null`, and this is the narrowing.
 */
export default async function VehiclesPage() {
  const account = await resolveHubAccount();

  if (account === null) {
    return null;
  }

  const data = await getHubVehicles(account);

  return <VehiclesScreen data={data} />;
}
