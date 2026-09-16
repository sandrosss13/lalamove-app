import type { Metadata } from "next";

import {
  LoadsScreen,
  type HubVehiclePill,
} from "@/components/driver-hub/screens/loads-screen";
import type {
  LoadsClaimVehicle,
  LoadsVehicleClass,
} from "@/components/driver-hub/screens/loads-context";
import {
  resolveHubAccount,
  type HubAccount,
} from "@/lib/dashboard/hub/account";
import { driverVehiclesWhere } from "@/lib/orders/driver-vehicles";
import { capabilityOf, widestCapability } from "@/lib/orders/vehicle-fit";
import { prisma } from "@/lib/prisma";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard · Driver Hub",
};

/**
 * The capacity columns every vehicle read on this page needs, plus the class
 * spec `capabilityOf` falls back to per field.
 *
 * **`vehicleTypeSpecId` is selected, and nothing on this screen compares it.**
 * It was once here so the board could pick a claim vehicle by matching class ids
 * against the order's — exact-class identity matching, the rule
 * `src/lib/orders/class-substitution.ts` replaced. It comes back as an *input*
 * to that rule rather than as the rule: `meetsBookedClass` admits a vehicle
 * registered under the booked class outright, because registration floors only
 * `payloadKg` against the class spec and a vehicle can therefore resolve below
 * the very class it is approved to operate in. `POST /api/orders/[id]/accept`
 * selects it again for the same reason and uses it the same way.
 *
 * `plateNumber` and `vehicleTypeSpec.label` are the only two fields here that no
 * rule reads: they name a vehicle to the driver in the confirm dialog's picker,
 * which appears when more than one of their vehicles qualifies. A cuid is not
 * something a driver can recognise; the plate on the truck outside is.
 *
 * Shared by both branches of `resolveVehicles` below. The BUSINESS branch needs
 * neither the plate nor the body types — a company claims with its account and
 * names no vehicle — and over-selecting two columns for it is a smaller cost
 * than a second, near-identical select that has to be kept in step with this one.
 */
const VEHICLE_SELECT = {
  id: true,
  plateNumber: true,
  vehicleTypeSpecId: true,
  payloadKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
  vehicleTypeSpec: {
    select: {
      label: true,
      maxPayloadKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
      bodyTypes: true,
    },
  },
} as const;

/**
 * The catalogue rows the board needs to build a *booked class floor* from
 * `HubLoad.vehicleTypeSpecId`.
 *
 * The board's own endpoint cannot supply these. `GET /api/loads` returns the
 * booked class as a bare id (`LoadBoardItem.vehicleTypeSpecId`) and nothing
 * else, because until the substitution rule landed the id was all anyone
 * compared. A floor is a comparison against numbers, so the numbers have to be
 * in hand on the client too — the same reason the endpoint's own eligibility
 * pass added a `vehicleTypeSpec.findMany` beside its load query.
 *
 * The whole catalogue is read rather than the classes this driver's board
 * happens to show, because this page cannot know that: the board is fetched from
 * the browser after this component has finished rendering, and it re-fetches
 * every ten seconds thereafter. It is eleven seeded rows of five scalar columns
 * that change only when the catalogue is reseeded, so shipping all of them once
 * per page load is cheaper than any arrangement that would let the client ask
 * for them later.
 */
const VEHICLE_CLASS_SELECT = {
  id: true,
  maxPayloadKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
} as const;

/**
 * What this page resolves that the board's own API does not: the account's
 * vehicles.
 *
 * `GET /api/loads` describes *loads*, not the caller's own truck, so the header
 * pill and the claim's `vehicleId` both have to come from somewhere else. Kept
 * as a page-local Prisma read rather than a new `src/lib/dashboard/hub/*.ts`
 * module: it is one query used from exactly one screen, and it does not need
 * the discoverability a shared module earns elsewhere in the hub.
 */
type LoadsPageVehicles = {
  /** `null` when there is nothing to show — the pill renders nothing at all. */
  vehiclePill: HubVehiclePill | null;
  /** Empty for a company, which claims with its identity and assigns later. */
  claimVehicles: LoadsClaimVehicle[];
  /**
   * The vehicle-class catalogue the board measures a booked class floor from.
   *
   * Empty for a company for the same reason `claimVehicles` is: a BUSINESS claim
   * names no vehicle, so there is no candidate to admit or refuse and nothing
   * for a floor to be compared against. Shipping the catalogue to an account
   * that cannot use it would be a query and a payload spent on nothing.
   */
  vehicleClasses: LoadsVehicleClass[];
};

/**
 * An INDIVIDUAL account (a driver, employed or not, or a sole proprietor)
 * resolves to the vehicles they hold: the most recent one labels the pill, and
 * all of them are candidates for a claim.
 *
 * Both halves of "hold", through `driverVehiclesWhere` — the vehicles they own
 * outright *and* the company vehicle they currently drive on an open
 * `DriverVehicleAssignment`, the same fallback `resolveHubAccount()`'s
 * identifier line makes. A roster driver owns no `Vehicle` row of their own, so
 * without the assignment half this screen would hand them a null pill and an
 * empty `claimVehicles`: a board they can browse and never claim from. The
 * board's own fit filter and the claim route scope themselves with the very
 * same helper, so all three agree on what this driver may turn up in.
 *
 * A BUSINESS account has no single vehicle. Per the requirements' "claim first,
 * assign afterwards" resolution it resolves to `widestCapability` across the
 * whole fleet — the same aggregate `GET /api/loads` runs a company's fit filter
 * against, so the pill previews exactly what is being filtered on rather than a
 * different number. Its `claimVehicles` is empty because
 * `POST /api/logistics-company/orders/[id]/claim` takes no body: which truck
 * fulfils the order is a dispatch decision made later, and pinning one at claim
 * time would only go stale while the order waits.
 *
 * Returns a `null` pill when there is nothing to show — a driver or company
 * mid-onboarding with no vehicle registered, or a roster driver a fleet manager
 * has not assigned one to yet. The pill is then absent rather than rendered as
 * a garbage string, the same reasoning `driverIdentifier()` in `account.ts`
 * gives for falling back to just the city.
 */
async function resolveVehicles(
  account: HubAccount,
): Promise<LoadsPageVehicles> {
  if (account.kind === "BUSINESS") {
    if (account.companyId === null) {
      return { vehiclePill: null, claimVehicles: [], vehicleClasses: [] };
    }

    const vehicles = await prisma.vehicle.findMany({
      where: { companyId: account.companyId },
      select: VEHICLE_SELECT,
    });

    const capability = widestCapability(
      vehicles.map((vehicle) => capabilityOf(vehicle, vehicle.vehicleTypeSpec)),
    );

    return {
      vehiclePill: capability === null ? null : { label: "Fleet", capability },
      claimVehicles: [],
      vehicleClasses: [],
    };
  }

  if (account.driverProfileId === null) {
    return { vehiclePill: null, claimVehicles: [], vehicleClasses: [] };
  }

  // Issued together: neither query reads the other's result, and the board
  // cannot paint until both have landed.
  const [vehicles, vehicleClasses] = await Promise.all([
    prisma.vehicle.findMany({
      where: driverVehiclesWhere(account.driverProfileId),
      orderBy: { createdAt: "desc" },
      select: VEHICLE_SELECT,
    }),
    prisma.vehicleTypeSpec.findMany({ select: VEHICLE_CLASS_SELECT }),
  ]);

  const [newest] = vehicles;

  return {
    vehiclePill:
      newest === undefined
        ? null
        : {
            label: newest.vehicleTypeSpec.label,
            capability: capabilityOf(newest, newest.vehicleTypeSpec),
          },
    // Copied field by field rather than handed over as the Prisma rows
    // themselves. The select above and `LoadsClaimVehicle` are two statements of
    // the same shape that have to agree, and writing the mapping out is what
    // makes a column added to one and forgotten in the other a compile error
    // here — at the boundary — instead of an undefined arriving in the browser.
    //
    // The field names are the server's, not new ones: the four vehicle columns
    // and the nested `vehicleTypeSpec` are named exactly as
    // `POST /api/orders/[id]/accept` selects them, so the board's
    // `capabilityOf(vehicle, vehicle.vehicleTypeSpec)` call and the claim
    // route's read as one line of code in two places, which is what they are.
    claimVehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      vehicleTypeSpecId: vehicle.vehicleTypeSpecId,
      payloadKg: vehicle.payloadKg,
      cargoLengthM: vehicle.cargoLengthM,
      cargoWidthM: vehicle.cargoWidthM,
      cargoHeightM: vehicle.cargoHeightM,
      vehicleTypeSpec: {
        label: vehicle.vehicleTypeSpec.label,
        maxPayloadKg: vehicle.vehicleTypeSpec.maxPayloadKg,
        cargoLengthM: vehicle.vehicleTypeSpec.cargoLengthM,
        cargoWidthM: vehicle.vehicleTypeSpec.cargoWidthM,
        cargoHeightM: vehicle.vehicleTypeSpec.cargoHeightM,
        bodyTypes: vehicle.vehicleTypeSpec.bodyTypes,
      },
    })),
    vehicleClasses,
  };
}

/**
 * The load board — open client bookings, first come first served, at
 * `/dashboard/loads` inside the existing driver hub shell.
 *
 * **Every kind of driver gets this board, employed ones included.** A roster
 * driver — an INDIVIDUAL account with a non-null `companyId`, on a fleet's
 * payroll — used to be redirected off this route on the grounds that work
 * reaches them through their company's dispatcher rather than the open
 * market. That is no longer the rule: they browse, claim and reject
 * exactly as an independent driver does, and `GET /api/loads`, `POST
 * /api/orders/[id]/accept` and `POST /api/loads/[id]/reject` dropped the
 * matching refusals in the same change, so nothing left in the stack disagrees.
 * What an employed driver *lacks* is a vehicle of their own, which is why
 * `resolveVehicles` below resolves a fleet assignment as well as ownership —
 * without that, removing the redirect would only have moved the dead end one
 * screen later.
 *
 * `resolveHubAccount()` is React-`cache()`d and `(hub)/layout.tsx` above already
 * called it, so this is a memo hit within the same request rather than a second
 * session validation. A `null` account cannot reach here — the layout renders
 * its own "profile isn't set up yet" fallback instead of these children — which
 * is what makes the early return below the narrowing rather than defensive
 * theatre.
 *
 * The board's own data is **not** fetched here. `LoadsProvider` calls
 * `GET /api/loads` from the browser instead; the reasoning is in
 * `loads-context.tsx`'s module comment, and it is a deliberate departure from
 * Jobs/Vehicles/Drivers rather than an omission.
 */
export default async function LoadsPage() {
  const account = await resolveHubAccount();

  if (account === null) {
    return null;
  }

  const { vehiclePill, claimVehicles, vehicleClasses } =
    await resolveVehicles(account);

  return (
    <LoadsScreen
      accountKind={account.kind}
      claimVehicles={claimVehicles}
      vehicleClasses={vehicleClasses}
      vehiclePill={vehiclePill}
    />
  );
}
