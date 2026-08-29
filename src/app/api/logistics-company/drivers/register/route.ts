import { randomInt } from "node:crypto";

import { NextResponse } from "next/server";
import {
  DriverAccountType,
  GeorgianCity,
  LicenceCategory,
  Prisma,
  type VehicleClass,
} from "@prisma/client";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { findVehicleClass } from "@/lib/driver-onboarding/vehicle-classes";
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
 *
 * The licence details are captured here and nowhere else. A company driver
 * never walks the self-serve onboarding wizard, so this is the only moment the
 * platform learns which categories they hold — and without that, the rule
 * "a Category CE vehicle needs a CE driver" has nothing to evaluate. The
 * `DriverLicence` row is written in the same transaction as the profile so a
 * driver can never reach the roster unassignable for want of a licence record.
 *
 * What is *not* enforced anywhere: licence **photographs**. Company vehicle and
 * licence document upload is an explicit v1 non-goal, so no code blocks a first
 * order on a missing licence scan — the wizard's "must upload their own licence
 * photos before their first order" note is a message to the driver, not a
 * server-side gate. The gap is deliberate; do not assume an enforcement path
 * exists behind it.
 */

/** Valid `GeorgianCity` values, derived from the generated Prisma enum. */
const GEORGIAN_CITIES = Object.values(GeorgianCity);

/** Valid `LicenceCategory` values, derived from the generated Prisma enum. */
const LICENCE_CATEGORIES = Object.values(LicenceCategory);

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
  licenceNumber: string;
  /** Parsed and already known to be in the future. */
  licenceExpiresAt: Date;
  /** Already de-duplicated, and every entry a valid `LicenceCategory`. */
  licenceCategories: LicenceCategory[];
};

/** Trims a value and returns it only if it is a non-empty string, else null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The licence category a vehicle's class requires, or `null` when the class is
 * unknown. `Vehicle.vehicleClass` is nullable because rows written before this
 * feature have none — for those, the gate does not apply and the assignment is
 * allowed through. Refusing them instead would make every pre-existing fleet
 * vehicle permanently unassignable, which is a worse failure than the gate not
 * covering rows that predate the column.
 *
 * The mapping itself is never restated here: it lives in
 * `src/lib/driver-onboarding/vehicle-classes.ts`, shared with the individual
 * driver wizard, so a class that changes category changes it for both flows at
 * once. The Prisma `VehicleClass` enum and the taxonomy's `VehicleClassId`
 * literal union hold identical members, so the column value passes straight in.
 *
 * Duplicated in `vehicles/[id]/assignment/route.ts` rather than lifted into a
 * `lib` module, matching how `findVehicleClassNameBySpecCode` is already
 * duplicated across the admin/onboarding routes: six lines whose only real
 * content is the import above.
 */
function requiredCategoryForVehicle(vehicle: {
  vehicleClass: VehicleClass | null;
}): LicenceCategory | null {
  return vehicle.vehicleClass
    ? findVehicleClass(vehicle.vehicleClass).requiredLicenceCategory
    : null;
}

/**
 * Whether an error is the database refusing a second live assignment for a
 * vehicle that already has one — the partial unique index
 * `driver_vehicle_assignment_live_vehicle_unique`
 * (`ON "DriverVehicleAssignment"("vehicleId") WHERE "unassignedAt" IS NULL`).
 *
 * Postgres reports either the offending column list (an array) or the index
 * name (a string) depending on how the constraint was created, so both shapes
 * are matched — the same technique `isDuplicatePhoneError` uses in
 * `api/logistics-company/route.ts`.
 *
 * Only the vehicle-side index is checked. The driver-side index
 * (`driver_vehicle_assignment_live_driver_unique`) cannot fire in this route:
 * the `DriverProfile` is created microseconds earlier in the same transaction
 * and no other row can reference an id nothing else has seen yet. Matching its
 * `driverProfileId` column here would also collide with the unrelated
 * `DriverLicence.driverProfileId @unique`, so it is deliberately left out.
 */
function isLiveVehicleAssignmentConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("vehicleId");
  }

  return (
    typeof target === "string" &&
    target.includes("driver_vehicle_assignment_live_vehicle_unique")
  );
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
 *
 * The licence fields are all required. Whether the categories actually cover
 * the chosen vehicle is a separate question needing the vehicle row, so it is
 * answered in the handler too.
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

  const licenceNumber = nonEmptyString(record.licenceNumber);
  if (licenceNumber === null) {
    return {
      error: "licenceNumber is required and must be a non-empty string.",
    };
  }

  const { licenceExpiresAt: rawLicenceExpiresAt } = record;
  if (typeof rawLicenceExpiresAt !== "string") {
    return { error: "licenceExpiresAt must be a valid ISO date." };
  }

  const licenceExpiresAt = new Date(rawLicenceExpiresAt);
  if (Number.isNaN(licenceExpiresAt.getTime())) {
    return { error: "licenceExpiresAt must be a valid ISO date." };
  }

  // Strictly after "now": a licence expiring today has already stopped being
  // usable by the time the driver takes their first order.
  if (licenceExpiresAt.getTime() <= Date.now()) {
    return { error: "The licence expiry date must be in the future." };
  }

  const { licenceCategories: rawLicenceCategories } = record;
  if (
    !Array.isArray(rawLicenceCategories) ||
    rawLicenceCategories.length === 0
  ) {
    return {
      error: "licenceCategories must be an array with at least one category.",
    };
  }

  if (
    !rawLicenceCategories.every(
      (category): category is LicenceCategory =>
        typeof category === "string" &&
        LICENCE_CATEGORIES.includes(category as LicenceCategory),
    )
  ) {
    return {
      error: `licenceCategories must contain only: ${LICENCE_CATEGORIES.join(", ")}.`,
    };
  }

  // De-duplicated rather than rejected: a repeated "C" is a slip in whatever
  // built the payload, not something the admin can act on, and the stored
  // array is a set either way.
  const licenceCategories = [...new Set(rawLicenceCategories)];

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
      licenceNumber,
      licenceExpiresAt,
      licenceCategories,
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

  const {
    email,
    firstName,
    lastName,
    phone,
    city,
    vehicleId,
    licenceNumber,
    licenceExpiresAt,
    licenceCategories,
  } = parsed.data;

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

  // Ownership, availability and licence category are all verified before
  // anything is written, so a bad `vehicleId` never leaves a half-registered
  // driver behind.
  if (vehicleId !== null) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        companyId: true,
        vehicleClass: true,
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

    // "At most one active assignment per vehicle" is backed by the partial
    // unique index `driver_vehicle_assignment_live_vehicle_unique`
    // (`ON "DriverVehicleAssignment"("vehicleId") WHERE "unassignedAt" IS
    // NULL`), so the database is the thing that actually enforces it. This
    // pre-check is kept anyway, because it is what turns "unique constraint
    // violated" into a sentence the admin can act on — and because it runs
    // before the account is created, so the common case never leaves a
    // half-registered driver behind. The losing side of a genuine race is
    // caught off the insert below and mapped back to this same message.
    if (vehicle.assignments.length > 0) {
      return NextResponse.json(
        { error: "This vehicle is already assigned to another driver." },
        { status: 400 },
      );
    }

    // The licence-category gate, checked here rather than after `signUpEmail`
    // so a mismatch never leaves a half-created account behind — the same
    // reasoning as the ownership and availability checks above. The identical
    // string is produced by `vehicles/[id]/assignment`, so a company sees one
    // message for one rule regardless of which door it came through.
    const required = requiredCategoryForVehicle(vehicle);
    if (required !== null && !licenceCategories.includes(required)) {
      return NextResponse.json(
        {
          error: `This vehicle needs category ${required}. Assign a different driver or vehicle.`,
        },
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
  // licence or their vehicle, or flagged for a password change without a
  // profile to log in to. The licence in particular is what makes the driver
  // assignable at all, so a profile without one would be a roster entry no
  // classed vehicle could ever be given to.
  let driverProfileId: string;
  try {
    driverProfileId = await prisma.$transaction(async (tx) => {
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
          // `activatedAt` is written by exactly one other thing in this
          // codebase — the driver-application approval path — and that path can
          // never run for this account. Leaving it null therefore means null
          // forever: the driver could never go online, never see open orders,
          // never accept one, and no screen anywhere would let them or their
          // company fix it. It is a permanent, silent lockout, not a safeguard.
          //
          // This is not a bypass of fleet review either. Dispatch for a fleet
          // is gated on `LogisticsCompany.activatedAt` (written only by the
          // admin activate endpoint) and on each vehicle's review status, so a
          // fleet under review dispatches nothing no matter how many activated
          // drivers sit on its roster. The two timestamps answer different
          // questions and only the company one is a review verdict.
          activatedAt: new Date(),
        },
        select: { id: true },
      });

      // Written in the same transaction as the profile, so neither can exist
      // without the other. This row is the whole reason the category gate can
      // be enforced at all.
      await tx.driverLicence.create({
        data: {
          driverProfileId: profile.id,
          licenceNumber,
          expiresAt: licenceExpiresAt,
          categories: licenceCategories,
        },
      });

      if (vehicleId !== null) {
        await tx.driverVehicleAssignment.create({
          data: { driverProfileId: profile.id, vehicleId },
        });
      }

      return profile.id;
    });
  } catch (error) {
    // The vehicle was free when it was checked above, but another request can
    // claim it between that read and this insert. The partial unique index
    // makes the database reject the second one rather than quietly allowing
    // two live assignments — so the loser lands here. Answering with the
    // catch-all 500 below would send the admin to support over a race they can
    // resolve themselves in a second, so it is discriminated and mapped back
    // onto the pre-check's own verbatim message: from the admin's point of view
    // the outcome is identical ("someone already has it"), and giving one
    // condition two different messages depending on which microsecond it
    // happened in would be a worse API.
    //
    // Logged first, so the race stays observable and does not depend on anyone
    // noticing a status code change. The temp password is never included —
    // `error` only.
    if (isLiveVehicleAssignmentConflict(error)) {
      console.error(
        "Driver registration lost a race for the vehicle's live assignment:",
        error,
      );
      // The transaction rolled back, so no profile, licence or assignment was
      // written — but the `User`/`Account` rows created by `signUpEmail` are
      // outside it and survive. Retrying with the same email will therefore hit
      // "An account with that email address already exists.", which is the same
      // interrupted state the 500 branch below describes.
      return NextResponse.json(
        { error: "This vehicle is already assigned to another driver." },
        { status: 400 },
      );
    }

    // The `User`/`Account` rows already exist at this point and cannot be rolled
    // back by the transaction, leaving an account with no profile — the same
    // interrupted state the public `/sign-up` flow can reach when its follow-up
    // profile call fails. Say so explicitly so the admin doesn't retry with the
    // same email and hit "already exists" with no idea why.
    console.error(
      "Driver account was created but profile/licence/vehicle setup failed:",
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
      driverProfileId,
      name,
      email,
      phone,
      categories: licenceCategories,
      tempPassword,
      vehicleAssigned: vehicleId !== null,
    },
    { status: 201 },
  );
}
