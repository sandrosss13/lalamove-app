import { NextResponse } from "next/server";
import type { GeorgianCity, LicenceCategory } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * One entry of a company's driver roster, as returned by `GET`.
 * `userId` (not the profile id) is the key the roster UI removes by, because
 * that is what identifies the driver's account.
 *
 * The licence and assignment fields are what let the fleet wizard's driver step
 * decide, without a second request per driver, whether a given driver may hold a
 * given vehicle. They are facts only: this route never filters the roster.
 * Eligibility is *presented* by the wizard (an ineligible row is dimmed with a
 * note) and *enforced* by `vehicles/[id]/assignment` and the register route —
 * neither of which trusts anything the client computed from this payload.
 */
type RosterEntry = {
  userId: string;
  driverProfileId: string;
  name: string;
  email: string;
  phone: string;
  city: GeorgianCity;
  isOnline: boolean;
  /**
   * Empty when the driver has no licence on file — an older company-created
   * account, predating licence capture at registration. Such a driver is
   * ineligible for every classed vehicle, which is the correct answer to "does
   * this licence cover Category C?" when no licence exists, not a bug to work
   * around. The company fixes it by supplying the licence details.
   */
  categories: LicenceCategory[];
  /** ISO, or null when there is no licence row. */
  licenceExpiresAt: string | null;
  /** The vehicle this driver currently holds, or null. Drives the roster's
   *  "already on 34 ABC 128" ineligibility note. */
  currentAssignment: {
    vehicleId: string;
    plateNumber: string;
  } | null;
};

/** The profile shape `GET` selects, flattened by `toRosterEntry`. */
type RosterProfile = {
  id: string;
  phone: string;
  city: GeorgianCity;
  isOnline: boolean;
  user: { id: string; name: string; email: string };
  licence: { categories: LicenceCategory[]; expiresAt: Date } | null;
  assignments: { vehicle: { id: string; plateNumber: string } }[];
};

/** Prisma selection producing a `RosterProfile`. */
const ROSTER_PROFILE_SELECT = {
  id: true,
  phone: true,
  city: true,
  isOnline: true,
  user: { select: { id: true, name: true, email: true } },
  licence: { select: { categories: true, expiresAt: true } },
  assignments: {
    where: { unassignedAt: null },
    // `take: 1` is exact rather than defensive: the partial unique index
    // `driver_vehicle_assignment_live_driver_unique` guarantees at most one
    // live row per driver at the database level.
    take: 1,
    select: { vehicle: { select: { id: true, plateNumber: true } } },
  },
} as const;

function toRosterEntry(profile: RosterProfile): RosterEntry {
  const currentAssignment = profile.assignments[0];

  return {
    userId: profile.user.id,
    driverProfileId: profile.id,
    name: profile.user.name,
    email: profile.user.email,
    phone: profile.phone,
    city: profile.city,
    isOnline: profile.isOnline,
    categories: profile.licence?.categories ?? [],
    licenceExpiresAt: profile.licence?.expiresAt.toISOString() ?? null,
    currentAssignment: currentAssignment
      ? {
          vehicleId: currentAssignment.vehicle.id,
          plateNumber: currentAssignment.vehicle.plateNumber,
        }
      : null,
  };
}

/**
 * GET /api/logistics-company/drivers — list the drivers on the signed-in
 * company's roster. Only COMPANY users may call this. A company that hasn't
 * completed its profile yet has no roster, which is an empty list rather than
 * an error.
 *
 * The response is a bare JSON array, not an object with a `drivers` key: every
 * consumer reads `await response.json()` as an array directly, and the empty
 * case is `[]`. Wrapping it would break them for no gain.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies have a driver roster." },
      { status: 403 },
    );
  }

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json([], { status: 200 });
  }

  const profiles = await prisma.driverProfile.findMany({
    where: { companyId: company.id },
    select: ROSTER_PROFILE_SELECT,
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(profiles.map(toRosterEntry), { status: 200 });
}
