import { NextResponse } from "next/server";
import type { GeorgianCity } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * One entry of a company's driver roster, as returned by both handlers here.
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

/** The profile shape both handlers select, flattened by `toRosterEntry`. */
type RosterProfile = {
  id: string;
  phone: string;
  city: GeorgianCity;
  isOnline: boolean;
  user: { id: string; name: string; email: string };
};

/** Prisma selection producing a `RosterProfile`, shared by both handlers. */
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

/** Trims a value and returns it only if it is a non-empty string, else null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
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

/**
 * POST /api/logistics-company/drivers — add an existing independent driver to
 * the signed-in company's roster, identified by the email they signed up with.
 * Only COMPANY users may call this.
 *
 * There is no invite/accept handshake at this stage: the driver must already
 * have an account with a completed profile and no current company, and joining
 * is a single write the company makes. Each failure mode gets its own message,
 * since "we couldn't add that driver" leaves the company with nothing to act
 * on.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can add drivers." },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const driverEmail = nonEmptyString(
    (rawBody as Record<string, unknown>).driverEmail,
  );
  if (driverEmail === null) {
    return NextResponse.json(
      { error: "driverEmail is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Complete your company profile before adding drivers." },
      { status: 400 },
    );
  }

  // Case-insensitive: a company types the address the way the driver wrote it
  // to them, which need not match the casing stored at sign-up. `email` is
  // unique, so at most one row can match either way.
  const user = await prisma.user.findFirst({
    where: { email: { equals: driverEmail, mode: "insensitive" } },
    select: {
      id: true,
      role: true,
      driverProfile: { select: { id: true, companyId: true } },
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "No account was found with that email address." },
      { status: 400 },
    );
  }

  if (user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "That account is not a driver account." },
      { status: 400 },
    );
  }

  if (!user.driverProfile) {
    return NextResponse.json(
      { error: "This driver hasn't completed their driver profile yet." },
      { status: 400 },
    );
  }

  // Deliberately does not special-case "already on *your* roster": a company
  // cannot see who else a driver works for, so one message covers both.
  if (user.driverProfile.companyId !== null) {
    return NextResponse.json(
      { error: "This driver already belongs to a company." },
      { status: 400 },
    );
  }

  const profile = await prisma.driverProfile.update({
    where: { id: user.driverProfile.id },
    data: { companyId: company.id },
    select: ROSTER_PROFILE_SELECT,
  });

  return NextResponse.json(toRosterEntry(profile), { status: 201 });
}
