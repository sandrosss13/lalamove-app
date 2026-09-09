import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  LoadsScreen,
  type HubVehiclePill,
} from "@/components/driver-hub/screens/loads-screen";
import type { LoadsClaimVehicle } from "@/components/driver-hub/screens/loads-context";
import {
  resolveHubAccount,
  type HubAccount,
} from "@/lib/dashboard/hub/account";
import { capabilityOf, widestCapability } from "@/lib/orders/vehicle-fit";
import { prisma } from "@/lib/prisma";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Load Board · Driver Hub",
};

/** Where a driver who has no board of their own is sent instead. */
const HUB_HOME = "/dashboard/today";

/**
 * The capacity columns every vehicle read on this page needs, plus the class
 * spec `capabilityOf` falls back to per field.
 *
 * `id` and `vehicleTypeSpecId` are here for a second purpose the pill does not
 * care about: a driver's claim must name a vehicle, and it must be one of the
 * class the client booked. See `LoadsClaimVehicle`.
 */
const VEHICLE_SELECT = {
  id: true,
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
    },
  },
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
};

/**
 * An INDIVIDUAL account (a driver or a sole proprietor) resolves to their own
 * registered vehicles: the most recent one labels the pill, and all of them are
 * candidates for a claim.
 *
 * Only their *own* vehicles, with no fallback to a fleet assignment — unlike
 * `resolveHubAccount()`'s identifier line, which does fall back. It cannot
 * matter here: a driver with a fleet assignment is a roster driver, and a
 * roster driver was redirected away several lines above this ever runs.
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
 * mid-onboarding with no vehicle registered. The pill is then absent rather
 * than rendered as a garbage string, the same reasoning `driverIdentifier()` in
 * `account.ts` gives for falling back to just the city.
 */
async function resolveVehicles(
  account: HubAccount,
): Promise<LoadsPageVehicles> {
  if (account.kind === "BUSINESS") {
    if (account.companyId === null) {
      return { vehiclePill: null, claimVehicles: [] };
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
    };
  }

  if (account.driverProfileId === null) {
    return { vehiclePill: null, claimVehicles: [] };
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { driverProfileId: account.driverProfileId },
    orderBy: { createdAt: "desc" },
    select: VEHICLE_SELECT,
  });

  const [newest] = vehicles;

  return {
    vehiclePill:
      newest === undefined
        ? null
        : {
            label: newest.vehicleTypeSpec.label,
            capability: capabilityOf(newest, newest.vehicleTypeSpec),
          },
    claimVehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      vehicleTypeSpecId: vehicle.vehicleTypeSpecId,
    })),
  };
}

/**
 * The load board — open client bookings, first come first served, at
 * `/dashboard/loads` inside the existing driver hub shell.
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

  // The roster-driver gate, server-side — the hidden sidebar link is cosmetic
  // and does nothing about a hand-typed URL.
  //
  // The test is `kind` **and** `companyId`, never `companyId` alone. A BUSINESS
  // account's `companyId` names its *own* company and that account is exactly
  // who this board is for; only an INDIVIDUAL with a non-null `companyId` is an
  // employed driver on somebody else's roster. Per the requirements'
  // Assumptions, they receive work through their company's dispatcher rather
  // than the open market — and `GET /api/loads` 403s them for the same reason,
  // so without this redirect they would land on a screen that can only ever
  // show them an error.
  if (account.kind === "INDIVIDUAL" && account.companyId !== null) {
    redirect(HUB_HOME);
  }

  const { vehiclePill, claimVehicles } = await resolveVehicles(account);

  return (
    <LoadsScreen
      accountKind={account.kind}
      claimVehicles={claimVehicles}
      vehiclePill={vehiclePill}
    />
  );
}
