import { NextResponse } from "next/server";
import { GeorgianCity, Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDuplicatePlateError } from "@/app/api/driver-profile/vehicles/validation";
import {
  findVehicleClass,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";
import { parseFleetDraft } from "@/lib/fleet-onboarding/draft-schema";
import {
  validateFleetSize,
  validateVehicleInput,
  type ValidatedVehicle,
} from "@/lib/fleet-onboarding/vehicle-validation";

/**
 * POST /api/logistics-company/onboarding/submit — the fleet wizard's single
 * write gate.
 *
 * Until this endpoint succeeds, nothing the wizard collects exists as a
 * `Vehicle`, a `DriverVehicleAssignment` or a `BusinessApplicationVehicle` row.
 * That is deliberate and not an optimisation: `Vehicle.plateNumber` is globally
 * unique, so a draft written straight through to normalized rows would let an
 * abandoned application permanently claim a real plate that another company then
 * cannot register.
 *
 * It takes **no request body and reads none**. Everything it validates is the
 * server's own saved state — the company's persisted `LogisticsCompany` columns
 * and the draft the debounced `PATCH` stored — so a hand-rolled request cannot
 * smuggle a value past the checks. In particular a `vehicleTypeSpecId` sent by a
 * caller is never read: the spec is re-resolved here from the (class, body) map.
 *
 * The same endpoint serves the status screen's Resubmit button after an admin
 * has sent the application back. See `resubmit` for why that path validates the
 * normalized rows rather than a draft, which rules it re-runs, and why it leaves
 * every already-approved vehicle's verdict exactly where the admin left it.
 */

/**
 * How long the write transaction may run. The default is 5 s, and a full
 * 40-vehicle fleet issues 121 statements (three creates per vehicle plus the
 * application update) — comfortably under 5 s against a local database and
 * uncomfortably close to it against a pooled remote one. A submit that times out
 * halfway is the one failure mode this endpoint must not have.
 */
const TRANSACTION_TIMEOUT_MS = 20_000;

const MIN_COMPANY_NAME_LENGTH = 3;

/** Exactly nine digits, matching `POST /api/logistics-company`'s own rule. */
const VAT_ID_PATTERN = /^\d{9}$/;

/** Deliberately loose: real addresses are validated by a human at review. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The design's IBAN floor. Shortest IBAN in use worldwide is 15 characters;
 * Georgian IBANs are 22. Measured after every space is stripped, because an
 * IBAN is conventionally written in groups of four.
 */
const MIN_IBAN_LENGTH = 18;

const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

const GEORGIAN_CITIES: GeorgianCity[] = Object.values(GeorgianCity);

/**
 * The company's own columns, which §3c validates instead of the draft's
 * `company` section: the draft is a UI mirror kept for resumability, and
 * validating it would let a hand-rolled `PATCH` to the draft endpoint route
 * around `POST /api/logistics-company`, which is what actually writes these.
 */
const companySelect = {
  id: true,
  companyName: true,
  vatId: true,
  phone: true,
  city: true,
  registeredAddress: true,
  bankAccountIban: true,
  contactName: true,
  contactRole: true,
  contactEmail: true,
  citiesOfOperation: true,
} satisfies Prisma.LogisticsCompanySelect;

/**
 * Everything the guard reads off the application. The vehicle rows are the
 * *review* rows, not the vehicles: on the resubmit path their statuses are what
 * decides whether the application may go back to the reviewer at all.
 */
const applicationSelect = {
  id: true,
  reference: true,
  status: true,
  draft: true,
  companyFlagReason: true,
  firstSubmittedAt: true,
  vehicles: {
    select: { id: true, vehicleId: true, status: true, flagReason: true },
  },
} satisfies Prisma.BusinessApplicationSelect;

type SubmittableCompany = Prisma.LogisticsCompanyGetPayload<{
  select: typeof companySelect;
}>;

type SubmittableApplication = Prisma.BusinessApplicationGetPayload<{
  select: typeof applicationSelect;
}>;

/** Either the resolved context, or the response to return instead of it. */
type FleetSubmitContext =
  | { company: SubmittableCompany; application: SubmittableApplication }
  | { response: NextResponse };

/**
 * Session, role, company and application-status guard, shared in spirit with
 * `resolveCompanyContext` in the sibling draft route and returned as a
 * discriminated union so the caller consumes it as
 * `if ("response" in context) return context.response;`.
 *
 * Only a `DRAFT` (first submit) or `ACTION_REQUIRED` (resubmit after review)
 * application may be submitted. `PENDING` and `APPROVED` get their own messages
 * rather than one generic refusal, because "already submitted" and "already
 * approved" call for completely different next actions from the company.
 */
async function resolveFleetSubmitContext(
  request: Request,
): Promise<FleetSubmitContext> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  if (session.user.role !== "COMPANY") {
    return {
      response: NextResponse.json(
        { error: "Only logistics companies have a fleet application." },
        { status: 403 },
      ),
    };
  }

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { ...companySelect, application: { select: applicationSelect } },
  });

  if (!company) {
    return {
      response: NextResponse.json(
        { error: "Complete your company profile before onboarding." },
        { status: 404 },
      ),
    };
  }

  const { application, ...companyColumns } = company;

  if (!application) {
    return {
      response: NextResponse.json(
        { error: "Start the application first." },
        { status: 404 },
      ),
    };
  }

  if (application.status === "PENDING") {
    return {
      response: NextResponse.json(
        { error: "This application has already been submitted." },
        { status: 400 },
      ),
    };
  }

  if (application.status === "APPROVED") {
    return {
      response: NextResponse.json(
        { error: "This application has already been approved." },
        { status: 400 },
      ),
    };
  }

  return { company: companyColumns, application };
}

/** A trimmed non-empty string, or null. */
function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * A driver's display name for the messages below.
 *
 * `firstName`/`lastName` are nullable on `DriverProfile` — they are null for
 * account types that never fill them in — so a driver with neither is named
 * generically rather than rendered as "null null" in a message the company is
 * meant to act on.
 */
function driverFullName(driver: {
  firstName: string | null;
  lastName: string | null;
}): string {
  const name = [driver.firstName, driver.lastName]
    .filter((part): part is string => trimmed(part) !== null)
    .join(" ")
    .trim();

  return name === "" ? "This driver" : name;
}

/**
 * §3c — the company block, validated against the persisted columns.
 *
 * Appends to `problems` rather than returning at the first failure, matching
 * every other `validate*` in this codebase: all the checks run, and the response
 * still reports only `problems[0]`.
 */
function validateCompany(
  company: SubmittableCompany,
  problems: string[],
): void {
  const companyName = trimmed(company.companyName);
  if (companyName === null || companyName.length < MIN_COMPANY_NAME_LENGTH) {
    problems.push("Enter the company's registered name.");
  }

  const vatId = trimmed(company.vatId);
  if (vatId === null || !VAT_ID_PATTERN.test(vatId)) {
    problems.push("The VAT or tax ID must be exactly 9 digits.");
  }

  if (trimmed(company.registeredAddress) === null) {
    problems.push("Enter the company's registered address.");
  }

  const citiesOfOperation = company.citiesOfOperation;
  if (
    citiesOfOperation.length < 1 ||
    !citiesOfOperation.every((city) => GEORGIAN_CITIES.includes(city))
  ) {
    problems.push("Choose at least one city of operation.");
  }

  // Split on any run of whitespace, so "  Ana   Beridze " still reads as two
  // words. The same rule `POST /api/logistics-company` applies on the way in;
  // re-checked here because a company row predating that route may have a
  // single-word contact on file.
  const contactName = trimmed(company.contactName);
  const nameParts = contactName?.split(/\s+/).filter(Boolean) ?? [];
  if (nameParts.length < 2) {
    problems.push(
      "Enter the contact person's full name — at least a first and last name.",
    );
  }

  if (trimmed(company.contactRole) === null) {
    problems.push("Enter the contact person's role.");
  }

  const contactEmail = trimmed(company.contactEmail);
  if (contactEmail === null || !EMAIL_PATTERN.test(contactEmail)) {
    problems.push("Enter a valid company email address.");
  }

  const iban = trimmed(company.bankAccountIban)?.replace(/\s/g, "") ?? "";
  if (iban.length < MIN_IBAN_LENGTH) {
    problems.push("Enter a valid IBAN for the payout account.");
  }

  const phoneDigits = trimmed(company.phone)?.replace(/\D/g, "") ?? "";
  if (
    phoneDigits.length < MIN_PHONE_DIGITS ||
    phoneDigits.length > MAX_PHONE_DIGITS
  ) {
    problems.push("Enter a valid company phone number.");
  }
}

/** One vehicle ready to be written, paired with its driver and resolved spec. */
type VehicleWrite = {
  vehicle: ValidatedVehicle;
  driverProfileId: string;
  vehicleTypeSpecId: string;
};

/**
 * The `ACTION_REQUIRED` resubmit path.
 *
 * `draft` is null here: a successful submit clears it, and the draft `PATCH`
 * refuses to write one onto a non-`DRAFT` application. The normalized rows are
 * the source of truth from the first submit onward, and the only things that can
 * have changed since are a **flagged** vehicle (through the per-vehicle `PATCH`)
 * and a **flagged** company block (through `POST /api/logistics-company`). Both
 * of those validate on the way in, so field formats are not re-checked here —
 * their inputs are frozen.
 *
 * What *is* re-run is everything that can have gone stale or been broken by one
 * of those edits. The licence-expiry rule in particular: an action-required
 * round trip can span days, and nothing downstream would catch it, because the
 * admin's approve path reads vehicle verdicts only — an expired licence would
 * otherwise ride all the way to `APPROVED` and activate a driver who may not
 * legally drive.
 *
 * **No `BusinessApplicationVehicle` row is touched.** An `APPROVED` vehicle
 * keeps its verdict and its `decidedAt` across a resubmission; sweeping every
 * row back to `PENDING` would undo the whole point of per-vehicle review, and
 * the status screen's own copy promises it does not happen.
 */
async function resubmit(
  application: SubmittableApplication,
  now: Date,
): Promise<NextResponse> {
  const flaggedCount = application.vehicles.filter(
    (row) => row.status === "FLAGGED",
  ).length;
  if (flaggedCount > 0) {
    return NextResponse.json(
      {
        error: `Fix the ${flaggedCount} flagged vehicle${flaggedCount === 1 ? "" : "s"} before resubmitting.`,
      },
      { status: 400 },
    );
  }

  if (application.companyFlagReason !== null) {
    return NextResponse.json(
      { error: "Correct the flagged company details before resubmitting." },
      { status: 400 },
    );
  }

  // No review rows at all means there was never a successful first submit, so
  // there is nothing to hand back to the reviewer. Rejecting beats moving an
  // empty application to PENDING for someone to puzzle over.
  if (application.vehicles.length === 0) {
    return NextResponse.json(
      {
        error:
          "Your application is incomplete — contact support so we can restore it.",
      },
      { status: 400 },
    );
  }

  // The live pairings, re-read rather than assumed: the per-vehicle `PATCH` can
  // change a flagged vehicle's *class*, and a class change can invalidate a
  // driver pairing the first submit validated.
  const rows = await prisma.businessApplicationVehicle.findMany({
    where: { businessApplicationId: application.id },
    orderBy: { createdAt: "asc" },
    select: {
      vehicleClass: true,
      vehicle: {
        select: {
          plateNumber: true,
          vehicleClass: true,
          assignments: {
            where: { unassignedAt: null },
            select: {
              driverProfile: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  licence: { select: { expiresAt: true, categories: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const problems: string[] = [];
  // Not "one driver, one vehicle" itself — that is checked below — but the
  // bookkeeping it needs, built in the same pass.
  const vehiclesByDriverId = new Map<string, number>();
  const duplicateDrivers = new Map<string, string>();

  for (const row of rows) {
    const { vehicle } = row;

    // `vehicleId` is `SetNull`, so a vehicle the company removed from its fleet
    // out of band leaves a review row with nothing to join to. The row still
    // renders its historical verdict for the admin, but it cannot be resubmitted
    // for review: there is no vehicle left to review.
    if (!vehicle) {
      problems.push(
        "Your application is incomplete — contact support so we can restore it.",
      );
      continue;
    }

    const driverProfile = vehicle.assignments[0]?.driverProfile;
    if (!driverProfile) {
      problems.push(
        `Vehicle ${vehicle.plateNumber} has no driver. Every vehicle needs a named driver.`,
      );
      continue;
    }

    const fullName = driverFullName(driverProfile);
    const { licence } = driverProfile;

    // A missing licence row is treated as an expired one rather than waved
    // through: with no licence on file there is nothing attesting the driver may
    // drive at all, which is strictly worse than an expired one.
    if (licence === null || licence.expiresAt.getTime() <= now.getTime()) {
      problems.push(
        `${fullName}'s licence has expired. Renew it before submitting.`,
      );
    } else {
      // Read from the `Vehicle` row, which the correction `PATCH` writes, and
      // which is therefore the fresher of the two after a class correction.
      // `Vehicle.vehicleClass` is nullable for rows that predate this feature,
      // so the review row's NOT NULL denormalised copy is the fallback; the
      // `PATCH` keeps both in step.
      const classId = (vehicle.vehicleClass ??
        row.vehicleClass) as VehicleClassId;
      const vehicleClass = findVehicleClass(classId);
      if (!licence.categories.includes(vehicleClass.requiredLicenceCategory)) {
        problems.push(
          `${fullName}'s licence does not list category ${vehicleClass.requiredLicenceCategory}, which the ${vehicleClass.name} class requires.`,
        );
      }
    }

    const held = vehiclesByDriverId.get(driverProfile.id) ?? 0;
    vehiclesByDriverId.set(driverProfile.id, held + 1);
    if (held === 1) {
      duplicateDrivers.set(driverProfile.id, fullName);
    }
  }

  for (const fullName of duplicateDrivers.values()) {
    problems.push(
      `${fullName} is assigned to two vehicles. Each driver can hold one vehicle.`,
    );
  }

  if (problems.length > 0) {
    return NextResponse.json({ error: problems[0] }, { status: 400 });
  }

  // A single statement is already atomic, so there is nothing here for an
  // interactive transaction to hold together — the review rows are deliberately
  // left exactly as the admin decided them.
  await prisma.businessApplication.update({
    where: { id: application.id },
    data: {
      status: "PENDING",
      lastSubmittedAt: now,
      submissionCount: { increment: 1 },
      // `firstSubmittedAt` is untouched: it records the first time this
      // application reached a reviewer, not the most recent. `reference` was
      // allocated by the lazy `GET` and is never written on either path.
    },
  });

  return NextResponse.json(
    { status: "PENDING", reference: application.reference },
    { status: 200 },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const context = await resolveFleetSubmitContext(request);
  if ("response" in context) {
    return context.response;
  }

  const { company, application } = context;

  // One `now` for every time-dependent rule — the manufacturing-year ceiling,
  // every licence expiry, and the timestamps written below — so nothing can
  // disagree about what day it is mid-request.
  const now = new Date();
  const problems: string[] = [];

  const draft = parseFleetDraft(application.draft);
  if (draft === null) {
    if (application.status === "ACTION_REQUIRED") {
      return resubmit(application, now);
    }

    return NextResponse.json(
      { error: "Fill in the wizard before submitting your application." },
      { status: 400 },
    );
  }

  validateCompany(company, problems);

  // Guarded rather than trusted: `parseFleetDraft` shallow-trusts our own saved
  // rows, so a draft written by an older client can legitimately have no
  // `vehicles` key at all.
  const draftVehicles = Array.isArray(draft.vehicles) ? draft.vehicles : [];

  // The grand total, not the per-cell stepper's 0–40 range, and re-checked here
  // rather than trusted from step 2.
  validateFleetSize(draftVehicles.length, problems);

  const validated = draftVehicles.map((vehicle, index) =>
    validateVehicleInput(vehicle, `Vehicle ${index + 1}`, now, problems),
  );

  // Plate uniqueness *inside* the application. A 400 rather than a 409: this is
  // a fixable inconsistency in what was submitted, not a collision with somebody
  // else's data — that one surfaces from the unique index as a 409 below.
  const plateFirstIndex = new Map<string, number>();
  validated.forEach((vehicle, index) => {
    if (!vehicle) return;

    const firstIndex = plateFirstIndex.get(vehicle.plateNumber);
    if (firstIndex === undefined) {
      plateFirstIndex.set(vehicle.plateNumber, index);
      return;
    }

    problems.push(
      `Vehicles ${firstIndex + 1} and ${index + 1} both have the plate ${vehicle.plateNumber}.`,
    );
  });

  // Every vehicle needs a named driver, and no driver may hold two. Read through
  // an optional chain because `parseFleetDraft` shallow-trusts the array's
  // *elements* too: a stored `[null]` must produce a validation failure, not a
  // 500 from reading a property of null.
  const driverIds = draftVehicles.map((vehicle) =>
    trimmed(vehicle?.driverProfileId),
  );
  const driverFirstIndex = new Map<string, number>();
  const duplicateDriverIds: string[] = [];

  driverIds.forEach((driverProfileId, index) => {
    if (driverProfileId === null) {
      problems.push(
        `Vehicle ${index + 1} has no driver. Every vehicle needs a named driver.`,
      );
      return;
    }

    const firstIndex = driverFirstIndex.get(driverProfileId);
    if (firstIndex === undefined) {
      driverFirstIndex.set(driverProfileId, index);
      return;
    }

    if (!duplicateDriverIds.includes(driverProfileId)) {
      duplicateDriverIds.push(driverProfileId);
    }
  });

  // Filtering on `companyId` inside the `where` rather than checking it after
  // the fact is what makes "this driver is on somebody else's roster"
  // indistinguishable from "this driver does not exist": the company learns
  // nothing about drivers it does not own.
  const drivers = await prisma.driverProfile.findMany({
    where: { id: { in: [...driverFirstIndex.keys()] }, companyId: company.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      licence: { select: { expiresAt: true, categories: true } },
    },
  });
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));

  for (const driverProfileId of duplicateDriverIds) {
    const driver = driversById.get(driverProfileId);
    const fullName = driver ? driverFullName(driver) : "This driver";
    problems.push(
      `${fullName} is assigned to two vehicles. Each driver can hold one vehicle.`,
    );
  }

  // Roster membership first, across every vehicle, so a company with one
  // off-roster driver and one stale licence is told about the roster first —
  // the same order the rules are stated in.
  driverIds.forEach((driverProfileId, index) => {
    if (driverProfileId !== null && !driversById.has(driverProfileId)) {
      problems.push(
        `Vehicle ${index + 1}'s driver is no longer on your roster. Assign a different driver.`,
      );
    }
  });

  driverIds.forEach((driverProfileId, index) => {
    if (driverProfileId === null) return;

    const driver = driversById.get(driverProfileId);
    // Already reported by the roster pass above.
    if (!driver) return;

    const fullName = driverFullName(driver);
    const { licence } = driver;

    if (licence === null) {
      problems.push(
        `${fullName} has no licence on file. Add it before submitting.`,
      );
      return;
    }

    // Checked as of submit time, not as of when step 4 was filled in: a draft
    // can sit for weeks.
    if (licence.expiresAt.getTime() <= now.getTime()) {
      problems.push(
        `${fullName}'s licence has expired. Renew it before submitting.`,
      );
      return;
    }

    const vehicle = validated[index];
    // A vehicle that failed its own field rules has already been reported; there
    // is no class to gate the licence against.
    if (!vehicle) return;

    const vehicleClass = findVehicleClass(vehicle.classId);
    if (!licence.categories.includes(vehicleClass.requiredLicenceCategory)) {
      problems.push(
        `${fullName}'s licence does not list category ${vehicleClass.requiredLicenceCategory}, which the ${vehicleClass.name} class requires.`,
      );
    }
  });

  if (problems.length > 0) {
    // Every failing rule was collected so the checks all run, but only the first
    // is reported: this API's convention is one readable `{ error }` message per
    // response, not a field-by-field array.
    return NextResponse.json({ error: problems[0] }, { status: 400 });
  }

  // Resolve every spec server-side from the (class, body) map. `code` never
  // comes from the request, so a missing row means the seeded catalogue and the
  // class map have drifted apart — a server fault, not a bad submission.
  //
  // There is deliberately NO payload-versus-spec-minimum rule here, unlike the
  // individual driver flow: one driver's single vehicle is the whole of their
  // capacity claim, whereas a fleet declares a range of real vehicles inside a
  // class, and the design's own reference models sit legitimately below their
  // class figure.
  const specCodes = [
    ...new Set(
      validated
        .filter((vehicle): vehicle is ValidatedVehicle => vehicle !== null)
        .map((vehicle) => vehicle.specCode),
    ),
  ];
  const specs = await prisma.vehicleTypeSpec.findMany({
    where: { code: { in: specCodes } },
    select: { id: true, code: true },
  });
  const specIdByCode = new Map(specs.map((spec) => [spec.code, spec.id]));

  const writes: VehicleWrite[] = [];
  for (const [index, vehicle] of validated.entries()) {
    // Non-null for every index: `problems` was empty above, and a null entry
    // always pushes at least one problem.
    const driverProfileId = driverIds[index];
    if (!vehicle || !driverProfileId) continue;

    const vehicleTypeSpecId = specIdByCode.get(vehicle.specCode);
    if (vehicleTypeSpecId === undefined) {
      console.error(
        `Vehicle type spec "${vehicle.specCode}" is missing; cannot submit business application ${application.id}.`,
      );
      return NextResponse.json(
        { error: "We couldn't submit your application. Please try again." },
        { status: 500 },
      );
    }

    writes.push({ vehicle, driverProfileId, vehicleTypeSpecId });
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        // Nothing inside this callback catches: a failed statement leaves the
        // Postgres transaction block aborted, so swallowing an error here would
        // let the commit silently degrade into a rollback and report success.
        for (const [index, write] of writes.entries()) {
          const created = await tx.vehicle.create({
            data: {
              companyId: company.id,
              // Not an oversight, and never "helpfully" set to the assigned
              // driver: the DB CHECK `vehicle_single_owner_check` forbids a row
              // carrying both owners, so every driver pairing goes through
              // `DriverVehicleAssignment` instead.
              driverProfileId: null,
              vehicleTypeSpecId: write.vehicleTypeSpecId,
              // Both are written because with five classes the (class, body) to
              // spec map is no longer uniquely invertible, and the fleet table,
              // the status screen and the admin drawer all need the class the
              // company actually declared.
              vehicleClass: write.vehicle.classId,
              chassisType: write.vehicle.chassisType,
              plateNumber: write.vehicle.plateNumber,
              make: write.vehicle.make,
              model: write.vehicle.model,
              year: write.vehicle.year,
              colour: write.vehicle.colour,
              payloadKg: write.vehicle.payloadKg,
              cargoLengthM: write.vehicle.cargoLengthM,
              cargoWidthM: write.vehicle.cargoWidthM,
              cargoHeightM: write.vehicle.cargoHeightM,
            },
            select: { id: true },
          });

          await tx.driverVehicleAssignment.create({
            data: {
              driverProfileId: write.driverProfileId,
              vehicleId: created.id,
              assignedAt: now,
            },
          });

          await tx.businessApplicationVehicle.create({
            data: {
              // The FK is `businessApplicationId`, never `applicationId`.
              businessApplicationId: application.id,
              vehicleId: created.id,
              // NOT NULL, and denormalised on purpose: `vehicleId` is SetNull,
              // so a vehicle the company later removes leaves this row with
              // nothing to join to, and the admin queue, the drawer and the
              // dispatch gate must still be able to say what was declared.
              vehicleClass: write.vehicle.classId,
              chassisType: write.vehicle.chassisType,
              status: "PENDING",
              flagReason: null,
              decidedAt: null,
              // Stamped explicitly, one millisecond apart, rather than left to
              // the column's `DEFAULT CURRENT_TIMESTAMP`. In Postgres that
              // default is the *transaction's* start time, so every row created
              // here would carry an identical `createdAt` — and the 1-based row
              // number every other surface derives from `orderBy: createdAt asc`
              // (there is no `position` column) would then be whatever order the
              // planner happened to return. This is what makes the numbering the
              // company saw in steps 3 and 4 the numbering the reviewer sees.
              createdAt: new Date(now.getTime() + index),
            },
          });
        }

        await tx.businessApplication.update({
          where: { id: application.id },
          data: {
            status: "PENDING",
            // `Prisma.DbNull` writes a SQL NULL. A bare `null` is not accepted
            // on a nullable Json column, and `Prisma.JsonNull` would store the
            // JSON `null` literal, which reads back as a present-but-unparseable
            // draft and would send a resubmitting company down the first-submit
            // path.
            draft: Prisma.DbNull,
            companyFlagReason: null,
            firstSubmittedAt: application.firstSubmittedAt ?? now,
            lastSubmittedAt: now,
            submissionCount: { increment: 1 },
            // `reference` is absent on purpose: the column is non-nullable and
            // was allocated by the lazy `GET` long before anyone reached step 5.
            // This endpoint only ever reads it.
          },
        });
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  } catch (error: unknown) {
    // The globally unique `plateNumber` is the one constraint here the company
    // can actually act on. There is no retry loop: retrying would just collide
    // again — it is the company's own input to fix.
    if (isDuplicatePlateError(error)) {
      return NextResponse.json(
        {
          error: "This plate number is already registered to another vehicle.",
        },
        { status: 409 },
      );
    }

    console.error("Failed to submit a business fleet application:", error);
    return NextResponse.json(
      { error: "We couldn't submit your application. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { status: "PENDING", reference: application.reference },
    { status: 200 },
  );
}
