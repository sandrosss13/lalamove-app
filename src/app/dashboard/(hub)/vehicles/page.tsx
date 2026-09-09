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
 * Open to all three personas, unlike Drivers and Employees: an INDEPENDENT
 * driver has a vehicle too, a ROSTER driver has the one their employer assigned
 * them, and `getHubVehicles()` resolves the scope difference (a company's own
 * rows, versus a driver's own rows plus the company van currently assigned to
 * them). There is therefore no business-only redirect here, and adding one
 * would lock a driver out of their own vehicle.
 *
 * A ROSTER driver is restricted on this screen, but the restriction is a
 * *write*, not a read: they may not register a personal vehicle, because it
 * would be one their employer's fleet screens cannot see and no dispatch path
 * would assign. That is enforced where the write happens — `POST
 * /api/driver-profile/vehicles` answers them `403` — and surfaced to the screen
 * as `canAddVehicle` on `HubVehiclesData`, which hides the button. None of it
 * belongs here: withholding the page would take away the one place a roster
 * driver can see the van they actually drive. Contrast
 * `src/app/dashboard/(hub)/earnings/page.tsx` and
 * `src/app/dashboard/(hub)/loads/page.tsx`, which do redirect, because those
 * whole screens are withheld.
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
