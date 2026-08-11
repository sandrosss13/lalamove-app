import { NextResponse } from "next/server";
import type { GeorgianCity } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * One entry of a company's driver roster, as returned by `GET`.
 * `userId` (not the profile id) is the key the roster UI removes by, because
 * that is what identifies the driver's account.
 */
type RosterEntry = {
  userId: string;
  driverProfileId: string;
  name: string;
  email: string;
  phone: string;
  city: GeorgianCity;
  isOnline: boolean;
};

/** The profile shape `GET` selects, flattened by `toRosterEntry`. */
type RosterProfile = {
  id: string;
  phone: string;
  city: GeorgianCity;
  isOnline: boolean;
  user: { id: string; name: string; email: string };
};

/** Prisma selection producing a `RosterProfile`. */
const ROSTER_PROFILE_SELECT = {
  id: true,
  phone: true,
  city: true,
  isOnline: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

function toRosterEntry(profile: RosterProfile): RosterEntry {
  return {
    userId: profile.user.id,
    driverProfileId: profile.id,
    name: profile.user.name,
    email: profile.user.email,
    phone: profile.phone,
    city: profile.city,
    isOnline: profile.isOnline,
  };
}

/**
 * GET /api/logistics-company/drivers — list the drivers on the signed-in
 * company's roster. Only COMPANY users may call this. A company that hasn't
 * completed its profile yet has no roster, which is an empty list rather than
 * an error.
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
