import { randomInt } from "node:crypto";

import { NextResponse } from "next/server";
import { DriverAccountType, GeorgianCity } from "@prisma/client";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Company-originated driver registration: the admin creates the whole driver
 * account (and optionally hands them a fleet vehicle) in one call, rather than
 * sending the driver to `/sign-up` and linking them afterwards.
 *
 * This is now the only way a driver joins a company's roster — the old
 * "link an already-registered independent driver by email" flow has been
 * removed entirely (`POST /api/logistics-company/drivers` is `GET`-only now),
 * since it produced the wrong onboarding history for a company-employed
 * driver. `GET /api/logistics-company/drivers` (the roster list) is unrelated
 * and untouched.
 */

/** Valid `GeorgianCity` values, derived from the generated Prisma enum. */
const GEORGIAN_CITIES = Object.values(GeorgianCity);

/**
 * Alphabet the temporary password is drawn from. Excludes visually ambiguous
 * characters (0/O, 1/l/I) because an admin typically reads this off-screen to
 * the driver over the phone, where "zero or oh?" costs a second attempt.
 */
const TEMP_PASSWORD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * Long enough to stay well clear of Better Auth's minimum password length while
 * remaining short enough to dictate out loud.
 */
const TEMP_PASSWORD_LENGTH = 12;

/** Validated shape of a driver-registration request body. */
type RegisterDriverInput = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: GeorgianCity;
  /** `null` when the admin chose not to assign a vehicle yet. */
  vehicleId: string | null;
};

/** Trims a value and returns it only if it is a non-empty string, else null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Builds a temporary password from cryptographically strong randomness.
 * `randomInt` is used rather than `Math.random` because this value is a real
 * credential until the driver changes it on first login.
 */
function generateTempPassword(): string {
  return Array.from(
    { length: TEMP_PASSWORD_LENGTH },
    () => TEMP_PASSWORD_CHARSET[randomInt(TEMP_PASSWORD_CHARSET.length)],
  ).join("");
}

/**
 * Hand-rolled body validation (the project has no validation library, and this
 * stage does not warrant adding one). Returns the typed input or an error
 * message describing the first problem encountered.
 *
 * Account type is not accepted from the request: a driver a company creates for
 * its own fleet is always an INDIVIDUAL, so the personal name fields are always
 * the required ones.
 *
 * `vehicleId` is optional — absent, `null`, or an empty string all mean "no
 * vehicle yet". Its existence and ownership need a database read and so are
 * checked in the handler.
 */
function parseRegisterDriverBody(
  body: unknown,
): { data: RegisterDriverInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const email = nonEmptyString(record.email);
  if (email === null) {
    return { error: "email is required and must be a non-empty string." };
  }

  const firstName = nonEmptyString(record.firstName);
  if (firstName === null) {
    return { error: "firstName is required and must be a non-empty string." };
  }

  const lastName = nonEmptyString(record.lastName);
  if (lastName === null) {
    return { error: "lastName is required and must be a non-empty string." };
  }

  const phone = nonEmptyString(record.phone);
  if (phone === null) {
    return { error: "phone is required and must be a non-empty string." };
  }

  const { city } = record;
  if (
    typeof city !== "string" ||
    !GEORGIAN_CITIES.includes(city as GeorgianCity)
  ) {
    return { error: `city must be one of: ${GEORGIAN_CITIES.join(", ")}.` };
  }

  const { vehicleId: rawVehicleId } = record;
  if (
    rawVehicleId !== undefined &&
    rawVehicleId !== null &&
    typeof rawVehicleId !== "string"
  ) {
    return { error: "vehicleId must be a string when provided." };
  }

  return {
    data: {
      email,
      firstName,
      lastName,
      phone,
      city: city as GeorgianCity,
      vehicleId: nonEmptyString(rawVehicleId),
    },
  };
}

/**
 * POST /api/logistics-company/drivers/register — create a brand-new driver
 * account on the signed-in company's roster, with a temporary password returned
 * once so the admin can relay it to the driver. Only COMPANY users may call
 * this, and only once their company profile exists (the driver is attached to
 * it at creation, so there is nothing to attach to before then).
 *
 * The roster membership is never taken from the request: the `DriverProfile` is
 * always written with the caller's own company id.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can register drivers." },
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

  const parsed = parseRegisterDriverBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { email, firstName, lastName, phone, city, vehicleId } = parsed.data;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Complete your company profile before registering drivers." },
      { status: 400 },
    );
  }

  // Checked up front so a taken address produces a specific, actionable message
  // instead of whatever `signUpEmail` happens to throw. Case-insensitive
  // because the admin types the address the way the driver wrote it to them;
  // `email` is unique, so at most one row can match either way.
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "An account with that email address already exists." },
      { status: 400 },
    );
  }

  // Ownership and availability are both verified before anything is written, so
  // a bad `vehicleId` never leaves a half-registered driver behind.
  if (vehicleId !== null) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        companyId: true,
        assignments: {
          where: { unassignedAt: null },
          select: { id: true },
        },
      },
    });

    // A vehicle owned by another company is reported as "not found" rather than
    // "not yours": a company cannot see other fleets, so one message covers
    // both and leaks nothing about who owns what.
    if (!vehicle || vehicle.companyId !== company.id) {
      return NextResponse.json(
        { error: "That vehicle was not found in your fleet." },
        { status: 400 },
      );
    }

    // "At most one active assignment per vehicle" has no database constraint
    // behind it (see `DriverVehicleAssignment` in the schema), so it is enforced
    // here.
    if (vehicle.assignments.length > 0) {
      return NextResponse.json(
        { error: "This vehicle is already assigned to another driver." },
        { status: 400 },
      );
    }
  }

  const name = `${firstName} ${lastName}`.trim();
  const tempPassword = generateTempPassword();

  // The account is created through Better Auth's own sign-up logic rather than a
  // raw Prisma insert, so the password is hashed with the same algorithm the
  // sign-in path verifies against — a hand-rolled `Account` row would not
  // actually let the driver log in.
  //
  // The incoming request's headers are deliberately *not* forwarded: doing so
  // would make Better Auth issue a session for the new driver and set its cookie
  // on this response, silently signing the admin out of their own account.
  let createdUserId: string;
  try {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        name,
        password: tempPassword,
        role: "DRIVER",
      },
    });
    createdUserId = signUpResult.user.id;
  } catch (error) {
    // Better Auth rejects with its own message for cases this handler doesn't
    // pre-check (a password policy, a race on the email uniqueness check);
    // surfacing that verbatim is more useful than a generic failure. Anything
    // that is not an `APIError` is a genuine fault and is rethrown.
    if (error instanceof APIError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode ?? 400 },
      );
    }

    throw error;
  }

  // One transaction so a driver never ends up on the roster without their
  // vehicle, or flagged for a password change without a profile to log in to.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: createdUserId },
        data: { mustChangePassword: true },
      });

      const profile = await tx.driverProfile.create({
        data: {
          userId: createdUserId,
          companyId: company.id,
          // Company-created drivers are always individuals working the
          // company's own fleet, never a separately registered business.
          accountType: DriverAccountType.INDIVIDUAL,
          firstName,
          lastName,
          // Business-only columns stay null for this account type, matching
          // what `POST /api/driver-profile` writes for an INDIVIDUAL.
          companyName: null,
          vatId: null,
          phone,
          city,
          // A company-created driver never sees the self-serve onboarding
          // wizard, so no application will ever exist for an admin to approve.
          // Activating at creation is what stops them being permanently locked
          // out of going online, seeing open orders, and accepting one.
          activatedAt: new Date(),
        },
        select: { id: true },
      });

      if (vehicleId !== null) {
        await tx.driverVehicleAssignment.create({
          data: { driverProfileId: profile.id, vehicleId },
        });
      }
    });
  } catch (error) {
    // The `User`/`Account` rows already exist at this point and cannot be rolled
    // back by the transaction, leaving an account with no profile — the same
    // interrupted state the public `/sign-up` flow can reach when its follow-up
    // profile call fails. Say so explicitly so the admin doesn't retry with the
    // same email and hit "already exists" with no idea why.
    console.error(
      "Driver account was created but profile/vehicle setup failed:",
      error,
    );
    return NextResponse.json(
      {
        error:
          "The driver account was created, but finishing setup failed. Contact support before retrying with the same email.",
      },
      { status: 500 },
    );
  }

  // `tempPassword` is returned exactly once, here. It is never persisted in
  // readable form and must not be logged by callers.
  return NextResponse.json(
    {
      userId: createdUserId,
      name,
      email,
      tempPassword,
      vehicleAssigned: vehicleId !== null,
    },
    { status: 201 },
  );
}
