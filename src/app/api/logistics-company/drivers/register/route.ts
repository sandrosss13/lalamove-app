import { NextResponse } from "next/server";
import {
  DriverAccountType,
  GeorgianCity,
  LicenceCategory,
  Prisma,
  type VehicleClass,
} from "@prisma/client";
import { APIError } from "better-auth/api";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { findVehicleClass } from "@/lib/driver-onboarding/vehicle-classes";
import {
  isPhonePlaceholderEmail,
  placeholderEmailForPhone,
} from "@/lib/phone-auth";
import { normalizePhoneNumber } from "@/lib/phone-number";
import { prisma } from "@/lib/prisma";

/** The request-locale translator the body parsers below phrase their errors with. */
type RequestTranslator = Awaited<ReturnType<typeof getRequestTranslations>>;

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
 *
 * ## Sign-in is by phone
 *
 * The driver app signs drivers in with their mobile number and an SMS code
 * (`src/lib/phone-auth.ts`), so the phone number is required and becomes the
 * account's verified `User.phoneNumber` — the column the phone plugin looks
 * the driver up by. The email is optional contact information: when none is
 * given the account gets the same placeholder address a self-registered phone
 * account gets (`placeholderEmailForPhone`). No password is issued; the account
 * has no credential row at all, exactly like an app sign-up.
 */

/** Valid `GeorgianCity` values, derived from the generated Prisma enum. */
const GEORGIAN_CITIES = Object.values(GeorgianCity);

/** Valid `LicenceCategory` values, derived from the generated Prisma enum. */
const LICENCE_CATEGORIES = Object.values(LicenceCategory);

/** Validated shape of a driver-registration request body. */
type RegisterDriverInput = {
  /** `null` when the admin left the optional email blank. */
  email: string | null;
  firstName: string;
  lastName: string;
  /** E.164 (`+995555123456`) — the driver's sign-in number. */
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
 * Whether an error is the database refusing a second account with the same
 * sign-in number (`User.phoneNumber @unique`) — the losing side of a race past
 * the pre-check in the handler.
 */
function isDuplicatePhoneNumberError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes("phoneNumber")
    : typeof target === "string" && target.includes("phoneNumber");
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
 *
 * The phone is required and normalised to E.164, because it is the driver's
 * sign-in number. The email is optional — absent, `null`, or blank all mean
 * "none".
 */
function parseRegisterDriverBody(
  body: unknown,
  t: RequestTranslator,
): { data: RegisterDriverInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const record = body as Record<string, unknown>;

  const { email: rawEmail } = record;
  if (
    rawEmail !== undefined &&
    rawEmail !== null &&
    typeof rawEmail !== "string"
  ) {
    return {
      error: t("errors.logisticsCompanyDriversRegister.emailMustBeAString"),
    };
  }

  const email = nonEmptyString(rawEmail);
  // Placeholder addresses belong to phone accounts and are derived from the
  // number; letting one be typed in would let it collide with that account.
  if (email !== null && isPhonePlaceholderEmail(email)) {
    return {
      error: t("errors.logisticsCompanyDriversRegister.thisEmailCannotBeUsed"),
    };
  }

  const firstName = nonEmptyString(record.firstName);
  if (firstName === null) {
    return { error: t("common.shared.firstnameIsRequiredAndMustBe") };
  }

  const lastName = nonEmptyString(record.lastName);
  if (lastName === null) {
    return { error: t("common.shared.lastnameIsRequiredAndMustBe") };
  }

  if (nonEmptyString(record.phone) === null) {
    return { error: t("common.shared.phoneIsRequiredAndMustBe") };
  }

  const phone = normalizePhoneNumber(record.phone);
  if (phone === null) {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.enterAValidMobileNumber",
      ),
    };
  }

  const { city } = record;
  if (
    typeof city !== "string" ||
    !GEORGIAN_CITIES.includes(city as GeorgianCity)
  ) {
    return {
      error: t("errors.logisticsCompanyDriversRegister.cityMustBeOneOf", {
        cities: GEORGIAN_CITIES.join(", "),
      }),
    };
  }

  const licenceNumber = nonEmptyString(record.licenceNumber);
  if (licenceNumber === null) {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.licencenumberIsRequiredAndMustBe",
      ),
    };
  }

  const { licenceExpiresAt: rawLicenceExpiresAt } = record;
  if (typeof rawLicenceExpiresAt !== "string") {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.licenceexpiresatMustBeAValidIso",
      ),
    };
  }

  const licenceExpiresAt = new Date(rawLicenceExpiresAt);
  if (Number.isNaN(licenceExpiresAt.getTime())) {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.licenceexpiresatMustBeAValidIso",
      ),
    };
  }

  // Strictly after "now": a licence expiring today has already stopped being
  // usable by the time the driver takes their first order.
  if (licenceExpiresAt.getTime() <= Date.now()) {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.theLicenceExpiryDateMustBe",
      ),
    };
  }

  const { licenceCategories: rawLicenceCategories } = record;
  if (
    !Array.isArray(rawLicenceCategories) ||
    rawLicenceCategories.length === 0
  ) {
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.licencecategoriesMustBeAnArrayWith",
      ),
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
      error: t(
        "errors.logisticsCompanyDriversRegister.licenceCategoriesMustContainOnly",
        {
          categories: LICENCE_CATEGORIES.join(", "),
        },
      ),
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
    return {
      error: t(
        "errors.logisticsCompanyDriversRegister.vehicleidMustBeAStringWhen",
      ),
    };
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
 * account on the signed-in company's roster. The driver signs in to the app
 * with the registered phone number and an SMS code. Only COMPANY users may call
 * this, and only once their company profile exists (the driver is attached to
 * it at creation, so there is nothing to attach to before then).
 *
 * The roster membership is never taken from the request: the `DriverProfile` is
 * always written with the caller's own company id.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      {
        error: t(
          "errors.logisticsCompanyDriversRegister.onlyLogisticsCompaniesCanRegisterDrivers",
        ),
      },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseRegisterDriverBody(rawBody, t);
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
      {
        error: t(
          "errors.logisticsCompanyDriversRegister.completeYourCompanyProfileBeforeRegistering",
        ),
      },
      { status: 400 },
    );
  }

  // Checked up front so a taken number produces a specific, actionable
  // message. The number is the driver's sign-in identity, so a second account
  // holding it could never be signed in to.
  const existingPhoneUser = await prisma.user.findUnique({
    where: { phoneNumber: phone },
    select: { id: true },
  });

  if (existingPhoneUser) {
    return NextResponse.json(
      {
        error: t(
          "errors.logisticsCompanyDriversRegister.anAccountWithThatPhoneNumber",
        ),
      },
      { status: 400 },
    );
  }

  // The same for the email, when one was given. Case-insensitive because the
  // admin types the address the way the driver wrote it to them; `email` is
  // unique, so at most one row can match either way.
  if (email !== null) {
    const existingEmailUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (existingEmailUser) {
      return NextResponse.json(
        { error: t("common.shared.anAccountWithThatEmailAddress") },
        { status: 400 },
      );
    }
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
        {
          error: t(
            "errors.logisticsCompanyDriversRegister.thatVehicleWasNotFoundIn",
          ),
        },
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
        {
          error: t(
            "errors.logisticsCompanyDriversRegister.thisVehicleIsAlreadyAssignedTo",
          ),
        },
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
          error: t(
            "errors.logisticsCompanyDriversRegister.thisVehicleNeedsCategory",
            { category: required },
          ),
        },
        { status: 400 },
      );
    }
  }

  const name = `${firstName} ${lastName}`.trim();
  const accountEmail = email ?? placeholderEmailForPhone(phone);

  // The user is created through Better Auth's internal adapter rather than a
  // raw Prisma insert, so it gets Better Auth's own id and runs the
  // `databaseHooks.user.create` checks in `src/lib/auth.ts`. Not through
  // `signUpEmail`: that endpoint insists on a password, and refuses the
  // placeholder domain a phone-only account needs.
  //
  // No session is created, so the admin's own session is untouched.
  let createdUserId: string;
  try {
    const authContext = await auth.$context;
    const createdUser = await authContext.internalAdapter.createUser({
      email: accountEmail,
      name,
      emailVerified: false,
      role: "DRIVER",
    });
    createdUserId = createdUser.id;
  } catch (error) {
    // Better Auth rejects with its own message for cases this handler doesn't
    // pre-check (a race on the email uniqueness check); surfacing that
    // verbatim is more useful than a generic failure. Anything that is not an
    // `APIError` is a genuine fault and is rethrown.
    if (error instanceof APIError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode ?? 400 },
      );
    }

    throw error;
  }

  // One transaction so a driver never ends up on the roster without their
  // licence or their vehicle, or with a sign-in number but no profile to log in
  // to. The licence in particular is what makes the driver assignable at all,
  // so a profile without one would be a roster entry no classed vehicle could
  // ever be given to.
  let driverProfileId: string;
  try {
    driverProfileId = await prisma.$transaction(async (tx) => {
      // The sign-in number, set through Prisma because Better Auth's own
      // writes refuse it outside the SMS verify endpoint. Marked verified on
      // the company's word: whoever holds this phone is who can sign in, so
      // a wrong number locks out nobody but the driver the company meant.
      await tx.user.update({
        where: { id: createdUserId },
        data: { phoneNumber: phone, phoneNumberVerified: true },
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
    // noticing a status code change.
    // Another request registered the same number between the pre-check and
    // this write. The `User` row created above survives, as below.
    if (isDuplicatePhoneNumberError(error)) {
      console.error(
        "Driver registration lost a race for the sign-in phone number:",
        error,
      );
      return NextResponse.json(
        {
          error: t(
            "errors.logisticsCompanyDriversRegister.anAccountWithThatPhoneNumber",
          ),
        },
        { status: 400 },
      );
    }

    if (isLiveVehicleAssignmentConflict(error)) {
      console.error(
        "Driver registration lost a race for the vehicle's live assignment:",
        error,
      );
      // The transaction rolled back, so no profile, licence, assignment or
      // sign-in number was written — but the `User` row created above is
      // outside it and survives. Retrying with the same email will therefore
      // hit "An account with that email address already exists.", which is the
      // same interrupted state the 500 branch below describes.
      return NextResponse.json(
        {
          error: t(
            "errors.logisticsCompanyDriversRegister.thisVehicleIsAlreadyAssignedTo",
          ),
        },
        { status: 400 },
      );
    }

    // The `User` row already exists at this point and cannot be rolled
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
        error: t(
          "errors.logisticsCompanyDriversRegister.theDriverAccountWasCreatedBut",
        ),
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      userId: createdUserId,
      driverProfileId,
      name,
      email,
      phone,
      categories: licenceCategories,
      vehicleAssigned: vehicleId !== null,
    },
    { status: 201 },
  );
}
