import { NextResponse } from "next/server";
import { DriverAccountType, GeorgianCity } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Valid `GeorgianCity` values, derived from the generated Prisma enum. */
const GEORGIAN_CITIES = Object.values(GeorgianCity);

/** Valid `DriverAccountType` values, derived from the generated Prisma enum. */
const DRIVER_ACCOUNT_TYPES = Object.values(DriverAccountType);

/** Validated shape of a driver-profile creation request body. */
type CreateDriverProfileInput = {
  accountType: DriverAccountType;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  vatId: string | null;
  phone: string;
  city: GeorgianCity;
};

/** Trims a value and returns it only if it is a non-empty string, else null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Hand-rolled body validation (the project has no validation library, and this
 * stage does not warrant adding one). Returns the typed input or an error
 * message describing the first problem encountered.
 *
 * INDIVIDUAL and INDIVIDUAL_ENTREPRENEUR accounts require first name, last
 * name, and phone; company fields are stored as null. BUSINESS accounts require
 * company name, VAT id, and phone; the personal name fields are stored as null.
 * City is required regardless of account type.
 */
function parseCreateDriverProfileBody(
  body: unknown,
): { data: CreateDriverProfileInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const { accountType, city } = record;

  if (
    typeof accountType !== "string" ||
    !DRIVER_ACCOUNT_TYPES.includes(accountType as DriverAccountType)
  ) {
    return {
      error: `accountType must be one of: ${DRIVER_ACCOUNT_TYPES.join(", ")}.`,
    };
  }

  if (
    typeof city !== "string" ||
    !GEORGIAN_CITIES.includes(city as GeorgianCity)
  ) {
    return {
      error: `city must be one of: ${GEORGIAN_CITIES.join(", ")}.`,
    };
  }

  const phone = nonEmptyString(record.phone);
  if (phone === null) {
    return { error: "phone is required and must be a non-empty string." };
  }

  if (accountType === DriverAccountType.BUSINESS) {
    const companyName = nonEmptyString(record.companyName);
    if (companyName === null) {
      return {
        error: "companyName is required and must be a non-empty string.",
      };
    }

    const vatId = nonEmptyString(record.vatId);
    if (vatId === null) {
      return { error: "vatId is required and must be a non-empty string." };
    }

    return {
      data: {
        accountType: DriverAccountType.BUSINESS,
        firstName: null,
        lastName: null,
        companyName,
        vatId,
        phone,
        city: city as GeorgianCity,
      },
    };
  }

  const firstName = nonEmptyString(record.firstName);
  if (firstName === null) {
    return { error: "firstName is required and must be a non-empty string." };
  }

  const lastName = nonEmptyString(record.lastName);
  if (lastName === null) {
    return { error: "lastName is required and must be a non-empty string." };
  }

  return {
    data: {
      accountType: accountType as DriverAccountType,
      firstName,
      lastName,
      companyName: null,
      vatId: null,
      phone,
      city: city as GeorgianCity,
    },
  };
}

/**
 * GET /api/driver-profile — return the signed-in driver's profile, or `null`
 * if they haven't completed it yet (a valid state, not an error). Only DRIVER
 * users may call this.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers have a driver profile." },
      { status: 403 },
    );
  }

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json(driverProfile, { status: 200 });
}

/**
 * POST /api/driver-profile — create or update the signed-in driver's profile.
 * Only DRIVER users may call this. The write is an upsert keyed on the user id
 * so retries and re-submits are idempotent rather than an error.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers can create a driver profile." },
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

  const parsed = parseCreateDriverProfileBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { accountType, firstName, lastName, companyName, vatId, phone, city } =
    parsed.data;

  // Read the current row before the upsert, scoped by `userId` so this only
  // ever reads the caller's own profile.
  const existingProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { accountType: true },
  });

  // `accountType` is chosen at sign-up and is not editable through this
  // endpoint. This is what makes it safe for the `update` branch below to never
  // touch `activatedAt` at all: an earlier version of this endpoint recomputed
  // activation on every update (BUSINESS → activate, else → activate only if
  // an approved `DriverApplication` exists), which was exploitable — POST once
  // as BUSINESS (activating immediately), then POST again as INDIVIDUAL, and
  // the recompute cleared or preserved activation based on account type alone.
  // It also had no way to tell a self-activated profile apart from a
  // grandfathered one (backfilled by the onboarding migration) or a
  // company-provisioned one (activated at creation by the company
  // registration flow, see `logistics-company/drivers/register/route.ts`) —
  // both legitimately have `activatedAt` set with no application row, so
  // "no approved application" is not a safe proxy for "not activated". Freezing
  // `accountType` removes the only mechanism the exploit depended on, so this
  // endpoint can leave `activatedAt` alone on every update instead of trying to
  // re-derive it.
  //
  // The check below is a friendly, non-authoritative 400 for the common case —
  // it is a read-then-write and two concurrent POSTs from the same session can
  // both read "no profile" and race past it. The actual guarantee comes from
  // the `update` branch never writing `accountType` at all (below), so even the
  // loser of that race can only patch the identity fields, never flip the type
  // an activation was just granted under.
  if (
    existingProfile !== null &&
    existingProfile.accountType !== accountType
  ) {
    return NextResponse.json(
      { error: "Your account type can't be changed here." },
      { status: 400 },
    );
  }

  // BUSINESS accounts never go through the driver onboarding wizard (only
  // INDIVIDUAL/INDIVIDUAL_ENTREPRENEUR independent sign-ups do), so there will
  // never be an application for an admin to approve. Activating them here is
  // what keeps them out of a permanently non-activated state. `undefined`
  // leaves the column unset, which is what the other account types need: a
  // brand-new profile cannot have an approved application yet.
  const createdActivatedAt =
    accountType === DriverAccountType.BUSINESS ? new Date() : undefined;

  const driverProfile = await prisma.driverProfile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      accountType,
      firstName,
      lastName,
      companyName,
      vatId,
      phone,
      city,
      activatedAt: createdActivatedAt,
    },
    update: {
      // `accountType` is deliberately absent here too — the freeze check above
      // is racy (read-then-write), so this is the real guarantee: even the
      // loser of a concurrent create/update race can only patch the identity
      // fields below, never the account type an activation was just granted
      // under.
      firstName,
      lastName,
      companyName,
      vatId,
      phone,
      city,
      // `activatedAt` is deliberately absent here — see the comment above the
      // accountType-freeze check. Whatever the row already has (null,
      // BUSINESS-activated, admin-approved, grandfathered, or
      // company-provisioned) is left exactly as it is.
    },
  });

  return NextResponse.json(driverProfile, { status: 201 });
}
