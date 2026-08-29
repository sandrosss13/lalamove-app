import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  ChassisType,
  DriverApplicationDocumentType,
  GeorgianCity,
  LicenceCategory,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDuplicatePlateError } from "@/app/api/driver-profile/vehicles/validation";
import {
  parseOnboardingDraft,
  type OnboardingDraftV1,
} from "@/lib/driver-onboarding/draft-schema";
import {
  findVehicleClass,
  resolveVehicleTypeSpecCode,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";

/**
 * POST /api/driver-profile/onboarding/submit — the onboarding wizard's single
 * write gate.
 *
 * Two things happen here and nowhere else:
 *
 * 1. **Every rule from the design's field tables is re-checked server-side.**
 *    The wizard validates the same rules inline, but a client-side rule is a
 *    convenience, not a control — two of these (the licence-category-vs-class
 *    lock, and the declared payload against the resolved spec's minimum) exist
 *    *only* as UI affordances on the client, so this route is the only place
 *    they are actually enforced. Nothing the client already checked is trusted,
 *    and nothing the client sends is read: the body is ignored entirely and the
 *    driver's own saved `draft` is the input, so a hand-rolled request cannot
 *    smuggle a value past the debounced `PATCH` that saved it.
 *
 * 2. **`Vehicle` and `DriverLicence` rows are created.** They are deliberately
 *    not written earlier: `Vehicle.plateNumber` is globally unique, and an
 *    abandoned draft must never permanently claim a real plate.
 *
 * The same endpoint serves the status screen's "Resubmit" button after an
 * admin has sent the application back for changes — see `resubmit` below for
 * why that path validates the normalized rows rather than a draft, and which
 * rules it re-runs there.
 */

/** Age bounds from the design's step-1 field table, inclusive at both ends. */
const MIN_AGE_YEARS = 21;
const MAX_AGE_YEARS = 75;

/** ID / passport number format, lifted verbatim from the design's field table. */
const ID_NUMBER_PATTERN = /^[A-Za-z0-9-]{6,20}$/;

/** Mobile number bounds, measured after every non-digit is stripped. */
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

const MIN_LICENCE_NUMBER_LENGTH = 5;

/** Oldest vehicle year onboarding accepts — the design's step-3c range is 1995–current. */
const MIN_VEHICLE_YEAR = 1995;

const MIN_PLATE_LENGTH = 4;

const MIN_PAYLOAD_KG = 100;
const MAX_PAYLOAD_KG = 40_000;

/** Metres. A cargo hold larger than this is a centimetres-for-metres typo. */
const MAX_CARGO_DIMENSION_M = 20;

/** Every document type an application must carry, with its human label. */
const REQUIRED_DOCUMENTS: {
  type: DriverApplicationDocumentType;
  label: string;
}[] = [
  { type: DriverApplicationDocumentType.PROFILE_PHOTO, label: "profile photo" },
  {
    type: DriverApplicationDocumentType.LICENCE_FRONT,
    label: "licence front photo",
  },
  {
    type: DriverApplicationDocumentType.LICENCE_BACK,
    label: "licence back photo",
  },
];

const GEORGIAN_CITIES = Object.values(GeorgianCity);
const LICENCE_CATEGORIES = Object.values(LicenceCategory);
const CHASSIS_TYPES = Object.values(ChassisType);

/** The presentation classes, as the ids `findVehicleClass` accepts. */
const VEHICLE_CLASS_IDS: VehicleClassId[] = [
  "SMALL_VAN",
  "LARGE_VAN",
  "MEDIUM_TRUCK",
  "HEAVY_FREIGHT_TRUCK",
];

/** Discriminated failure, carrying the status the caller should respond with. */
type SubmitFailure = { error: string; status: number };

/**
 * The application row and its owner, selected in one query. `documents` is
 * narrowed to the live rows: a superseded document is history, and a retake
 * that fixed a flagged photo must not keep the driver blocked by the row it
 * replaced.
 */
const applicationSelect = {
  id: true,
  status: true,
  vehicleId: true,
  draft: true,
  firstSubmittedAt: true,
  documents: {
    where: { supersededAt: null },
    select: { type: true, status: true },
  },
} satisfies Prisma.DriverApplicationSelect;

type SubmittableApplication = Prisma.DriverApplicationGetPayload<{
  select: typeof applicationSelect;
}>;

/** Everything the guard resolves before any validation runs. */
type SubmitContext = {
  driverProfileId: string;
  /**
   * The normalized personal/licence values a previous successful submit wrote.
   * Null before the first submit — on that path the draft is the input and
   * these are ignored — but they are the *only* record of the driver's age and
   * licence expiry on the resubmit path, where the draft is gone. See
   * `resubmit`.
   */
  dateOfBirth: Date | null;
  licenceExpiresAt: Date | null;
  application: SubmittableApplication;
};

/**
 * Session, role, profile and application-status guard.
 *
 * Only a `DRAFT` (first submit) or `ACTION_REQUIRED` (resubmit after review)
 * application may be submitted. `PENDING` and `APPROVED` each get their own
 * message rather than a generic one, because "already submitted" and "already
 * approved" call for completely different next actions from the driver.
 */
async function resolveSubmitContext(
  request: Request,
): Promise<{ context: SubmitContext } | SubmitFailure> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { error: "Unauthorized.", status: 401 };
  }

  if (session.user.role !== "DRIVER") {
    return {
      error: "Only drivers have an onboarding application.",
      status: 403,
    };
  }

  const profile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      dateOfBirth: true,
      licence: { select: { expiresAt: true } },
      application: { select: applicationSelect },
    },
  });

  if (!profile) {
    return {
      error: "Complete your driver profile before onboarding.",
      status: 404,
    };
  }

  const { application } = profile;
  if (!application) {
    return { error: "Start the application first.", status: 404 };
  }

  if (application.status === "PENDING") {
    return { error: "This application has already been submitted.", status: 400 };
  }

  if (application.status === "APPROVED") {
    return { error: "This application has already been approved.", status: 400 };
  }

  return {
    context: {
      driverProfileId: profile.id,
      dateOfBirth: profile.dateOfBirth,
      licenceExpiresAt: profile.licence?.expiresAt ?? null,
      application,
    },
  };
}

/**
 * Age in whole years at `now`, computed from the date's UTC parts.
 *
 * UTC on both sides on purpose: a `YYYY-MM-DD` date of birth parses to UTC
 * midnight, so reading it back through the server's local calendar would shift
 * it a day west of Greenwich and could flip a driver on their 21st or 76th
 * birthday from accepted to rejected purely on deployment region.
 */
function ageInYears(dateOfBirth: Date, now: Date): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();

  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  const dayDelta = now.getUTCDate() - dateOfBirth.getUTCDate();
  // The birthday has not come round yet this year.
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age;
}

/** Parses an ISO date string, or null for anything unparseable. */
function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A trimmed non-empty string, or null. */
function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** A finite number, or null. Rejects `NaN` and the infinities alike. */
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The normalized, fully validated values a successful submit writes. */
type ValidatedSubmission = {
  personal: {
    firstName: string;
    lastName: string;
    idNumber: string;
    dateOfBirth: Date;
    city: GeorgianCity;
    phone: string;
  };
  licence: {
    licenceNumber: string;
    expiresAt: Date;
    categories: LicenceCategory[];
  };
  vehicle: {
    plateNumber: string;
    make: string;
    model: string;
    year: number;
    colour: string;
    chassisType: ChassisType;
    payloadKg: number;
    cargoLengthM: number;
    cargoWidthM: number;
    cargoHeightM: number;
  };
  /** Resolved from (class, chassis) server-side — never taken from the client. */
  vehicleTypeSpecId: string;
};

/**
 * Validates the personal section and pushes any failures onto `problems`.
 * Returns the normalized values, or null if the section is unusable.
 *
 * Every `validate*` helper below follows this shape: they append to one shared
 * list rather than returning at the first failure, so a driver with three
 * broken fields is not walked back through three separate round trips. The
 * response still names only the first problem (see `POST`) — that is this
 * codebase's error convention, and the client renders one inline message.
 */
function validatePersonal(
  draft: OnboardingDraftV1,
  now: Date,
  problems: string[],
): ValidatedSubmission["personal"] | null {
  const personal = draft.personal ?? {};

  const fullName = trimmed(personal.fullName);
  // Split on any run of whitespace so "  Ana   Beridze " still reads as two
  // words. `DriverProfile` stores the two halves separately (the sign-up form
  // collects them as two fields), so the wizard's single "Full name" input is
  // split here: first word is the given name, everything after it the surname.
  const [firstName, ...remainingNameWords] =
    fullName?.split(/\s+/).filter(Boolean) ?? [];
  const lastName = remainingNameWords.join(" ");
  const hasFullName = firstName !== undefined && lastName !== "";
  if (!hasFullName) {
    problems.push("Enter your full name — at least a first and last name.");
  }

  const idNumber = trimmed(personal.idNumber);
  if (idNumber === null || !ID_NUMBER_PATTERN.test(idNumber)) {
    problems.push(
      "Enter a valid ID or passport number — 6 to 20 letters, digits or hyphens.",
    );
  }

  // Checked against today rather than against the day the field was filled in:
  // a draft can sit for weeks, and the rule is about the driver's age now.
  const dateOfBirth = parseIsoDate(personal.dateOfBirth);
  const age = dateOfBirth === null ? null : ageInYears(dateOfBirth, now);
  if (age === null || age < MIN_AGE_YEARS || age > MAX_AGE_YEARS) {
    problems.push(
      `Drivers must be between ${MIN_AGE_YEARS} and ${MAX_AGE_YEARS} years old.`,
    );
  }

  const city = trimmed(personal.city);
  const isKnownCity =
    city !== null && GEORGIAN_CITIES.includes(city as GeorgianCity);
  if (!isKnownCity) {
    problems.push("Choose a city from the list.");
  }

  const phone = trimmed(personal.phone);
  const phoneDigits = phone?.replace(/\D/g, "") ?? "";
  if (
    phoneDigits.length < MIN_PHONE_DIGITS ||
    phoneDigits.length > MAX_PHONE_DIGITS
  ) {
    problems.push("Enter a valid mobile number.");
  }

  if (
    !hasFullName ||
    firstName === undefined ||
    idNumber === null ||
    dateOfBirth === null ||
    !isKnownCity ||
    phone === null
  ) {
    return null;
  }

  return {
    firstName,
    lastName,
    idNumber,
    dateOfBirth,
    city: city as GeorgianCity,
    phone,
  };
}

/** Validates the licence section. See `validatePersonal` for the shape. */
function validateLicence(
  draft: OnboardingDraftV1,
  now: Date,
  problems: string[],
): ValidatedSubmission["licence"] | null {
  const licence = draft.licence ?? {};

  const licenceNumber = trimmed(licence.licenceNumber);
  if (
    licenceNumber === null ||
    licenceNumber.length < MIN_LICENCE_NUMBER_LENGTH
  ) {
    problems.push("Enter your licence number.");
  }

  // Re-checked against `now`, not against when step 2 was filled in: a licence
  // that was valid when the draft was started can have expired since.
  const expiresAt = parseIsoDate(licence.expiresAt);
  const isValidExpiry = expiresAt !== null && expiresAt.getTime() > now.getTime();
  if (!isValidExpiry) {
    problems.push("This licence has expired. Renew it before applying.");
  }

  const rawCategories = licence.categories;
  const categories = Array.isArray(rawCategories)
    ? rawCategories.filter((entry): entry is LicenceCategory =>
        LICENCE_CATEGORIES.includes(entry as LicenceCategory),
      )
    : [];
  // Length compared as well as filtered: a list carrying an unknown category is
  // corrupt input, not a list to silently trim down to its valid members.
  const hasValidCategories =
    categories.length > 0 &&
    Array.isArray(rawCategories) &&
    categories.length === rawCategories.length;
  if (!hasValidCategories) {
    problems.push("Select at least one licence category.");
  }

  if (
    licenceNumber === null ||
    licenceNumber.length < MIN_LICENCE_NUMBER_LENGTH ||
    expiresAt === null ||
    !isValidExpiry ||
    !hasValidCategories
  ) {
    return null;
  }

  return { licenceNumber, expiresAt, categories };
}

/**
 * The vehicle section's draft-only rules — everything that can be checked
 * without knowing which `VehicleTypeSpec` the (class, chassis) pair resolves
 * to. The payload-versus-spec minimum is checked separately, once the spec has
 * been read (see `POST`).
 */
type ValidatedVehicleDraft = {
  vehicle: Omit<ValidatedSubmission["vehicle"], "payloadKg"> & {
    payloadKg: number;
  };
  classId: VehicleClassId;
  specCode: string;
};

/** Validates the vehicle section. See `validatePersonal` for the shape. */
function validateVehicle(
  draft: OnboardingDraftV1,
  licence: ValidatedSubmission["licence"] | null,
  now: Date,
  problems: string[],
): ValidatedVehicleDraft | null {
  const vehicle = draft.vehicle ?? {};

  const chassisType = CHASSIS_TYPES.includes(vehicle.chassisType as ChassisType)
    ? (vehicle.chassisType as ChassisType)
    : null;
  if (chassisType === null) {
    problems.push("Choose the vehicle's cargo body type.");
  }

  const classId = VEHICLE_CLASS_IDS.includes(vehicle.classId as VehicleClassId)
    ? (vehicle.classId as VehicleClassId)
    : null;
  if (classId === null) {
    problems.push("Choose a vehicle class.");
  }

  // The (class, chassis) grid has holes — combinations with no matching spec in
  // the seeded catalogue. The wizard renders those cards locked; a locked card
  // is a UI affordance, so the combination is re-resolved here and a hole is a
  // hard rejection rather than a fallback to a near-miss spec.
  let specCode: string | null = null;
  if (chassisType !== null && classId !== null) {
    specCode = resolveVehicleTypeSpecCode(classId, chassisType);
    if (specCode === null) {
      problems.push(
        "This vehicle class isn't available with the selected body type.",
      );
    }
  }

  // The design enforces this as a locked, greyed-out class card and nothing
  // more, which is trivially bypassed — this is the only place it is real.
  if (classId !== null && licence !== null) {
    const required = findVehicleClass(classId).requiredLicenceCategory;
    if (!licence.categories.includes(required)) {
      problems.push(
        `Your licence does not list category ${required}, which the ${findVehicleClass(classId).name} class requires.`,
      );
    }
  }

  // Free text by design (`task-12`): the wizard's searchable dropdown is a
  // convenience over a short catalogue, not a closed list, so there is nothing
  // to check here beyond presence.
  const make = trimmed(vehicle.make);
  if (make === null) {
    problems.push("Enter the vehicle's make.");
  }

  const model = trimmed(vehicle.model);
  if (model === null) {
    problems.push("Enter the vehicle's model.");
  }

  const maxVehicleYear = now.getFullYear();
  const year = finiteNumber(vehicle.year);
  const isValidYear =
    year !== null &&
    Number.isInteger(year) &&
    year >= MIN_VEHICLE_YEAR &&
    year <= maxVehicleYear;
  if (!isValidYear) {
    problems.push(
      `Enter a manufacturing year between ${MIN_VEHICLE_YEAR} and ${maxVehicleYear}.`,
    );
  }

  // Uppercased before the length check and before the write, so the globally
  // unique `plateNumber` index sees one canonical spelling of a plate.
  const plateNumber = trimmed(vehicle.plateNumber)?.toUpperCase() ?? null;
  const isValidPlate =
    plateNumber !== null && plateNumber.length >= MIN_PLATE_LENGTH;
  if (!isValidPlate) {
    problems.push("Enter the vehicle's licence plate.");
  }

  const colour = trimmed(vehicle.colour);
  if (colour === null) {
    problems.push("Choose the vehicle's colour.");
  }

  const payloadKg = finiteNumber(vehicle.payloadKg);
  const isValidPayload =
    payloadKg !== null &&
    payloadKg >= MIN_PAYLOAD_KG &&
    payloadKg <= MAX_PAYLOAD_KG;
  if (!isValidPayload) {
    problems.push(
      `Maximum payload must be between ${MIN_PAYLOAD_KG.toLocaleString("en-US")} and ${MAX_PAYLOAD_KG.toLocaleString("en-US")} kg.`,
    );
  }

  const dimensions = {
    cargoLengthM: finiteNumber(vehicle.cargoLengthM),
    cargoWidthM: finiteNumber(vehicle.cargoWidthM),
    cargoHeightM: finiteNumber(vehicle.cargoHeightM),
  };
  const hasValidDimensions = Object.values(dimensions).every(
    (value) =>
      value !== null && value > 0 && value <= MAX_CARGO_DIMENSION_M,
  );
  if (!hasValidDimensions) {
    problems.push("Check the dimensions — metres, not centimetres.");
  }

  if (
    chassisType === null ||
    classId === null ||
    specCode === null ||
    make === null ||
    model === null ||
    !isValidYear ||
    year === null ||
    !isValidPlate ||
    plateNumber === null ||
    colour === null ||
    !isValidPayload ||
    payloadKg === null ||
    !hasValidDimensions
  ) {
    return null;
  }

  return {
    vehicle: {
      plateNumber,
      make,
      model,
      year,
      colour,
      chassisType,
      payloadKg,
      // Non-null by `hasValidDimensions`, which the guard above already returned on.
      cargoLengthM: dimensions.cargoLengthM as number,
      cargoWidthM: dimensions.cargoWidthM as number,
      cargoHeightM: dimensions.cargoHeightM as number,
    },
    classId,
    specCode,
  };
}

/**
 * Documents must all be present and none of them currently flagged.
 *
 * The "none flagged" half is the server side of "resubmit is disabled until
 * every flagged document has been replaced": the status screen disables the
 * button, and this makes that stick.
 */
function validateDocuments(
  documents: SubmittableApplication["documents"],
  problems: string[],
): void {
  for (const required of REQUIRED_DOCUMENTS) {
    const live = documents.find((document) => document.type === required.type);

    if (!live) {
      problems.push(`Upload your ${required.label} before submitting.`);
      continue;
    }

    if (live.status === "FLAGGED") {
      problems.push(
        `Replace the flagged ${required.label} before resubmitting.`,
      );
    }
  }
}

/**
 * Resubmit path: an `ACTION_REQUIRED` application whose draft is gone.
 *
 * A successful submit clears `draft` — the normalized rows become the source of
 * truth, and `PATCH` refuses to write a draft onto a non-`DRAFT` application —
 * so a resubmission has no draft to re-validate and nothing new to write. What
 * changed is which documents are live, which is what an admin sent the
 * application back for.
 *
 * Documents are not all this path checks, though. The two *time-dependent*
 * rules are re-run here as well, against the normalized rows the first submit
 * wrote rather than against a draft. An action-required round trip can span
 * days, and nothing downstream would catch either rule going stale: admin
 * `approve` reads document statuses only, so a licence that expired while the
 * driver was replacing a photo would otherwise carry an application all the way
 * to `APPROVED` and activate a driver on an expired licence.
 *
 * The remaining rules — licence category versus vehicle class, payload versus
 * the resolved spec's minimum, formats and ranges — are deliberately not
 * repeated: their inputs are frozen. With no draft to edit and `PATCH` refusing
 * to create one, nothing in the flow can change them between submits.
 */
async function resubmit(
  context: SubmitContext,
): Promise<NextResponse> {
  const { application, dateOfBirth, licenceExpiresAt } = context;

  // A resubmission with no draft *and* no vehicle never had a successful first
  // submit, so there is nothing to hand back to the reviewer. Rejecting beats
  // moving an empty application to PENDING for someone to puzzle over.
  if (application.vehicleId === null) {
    return NextResponse.json(
      {
        error:
          "Your application is incomplete — contact support so we can restore it.",
      },
      { status: 400 },
    );
  }

  // One `now` for both time-dependent rules and for the timestamps written
  // below, matching the main path's single-clock convention.
  const now = new Date();
  const problems: string[] = [];

  // Checked in the same order as the main path (age, then licence expiry, then
  // documents) so the one message this endpoint reports is the same message the
  // same driver would have seen on a first submit.
  const age = dateOfBirth === null ? null : ageInYears(dateOfBirth, now);
  if (age === null || age < MIN_AGE_YEARS || age > MAX_AGE_YEARS) {
    problems.push(
      `Drivers must be between ${MIN_AGE_YEARS} and ${MAX_AGE_YEARS} years old.`,
    );
  }

  // A missing licence row is treated as an expired one rather than waved
  // through: the first submit writes it in the same transaction as the vehicle,
  // so if the vehicle exists and this does not, the row was removed out of band
  // and there is nothing left to attest the driver may drive at all.
  if (
    licenceExpiresAt === null ||
    licenceExpiresAt.getTime() <= now.getTime()
  ) {
    problems.push("This licence has expired. Renew it before applying.");
  }

  validateDocuments(application.documents, problems);
  if (problems.length > 0) {
    return NextResponse.json({ error: problems[0] }, { status: 400 });
  }

  await prisma.driverApplication.update({
    where: { id: application.id },
    data: {
      status: "PENDING",
      firstSubmittedAt: application.firstSubmittedAt ?? now,
      lastSubmittedAt: now,
      submissionCount: { increment: 1 },
    },
  });

  return NextResponse.json({ status: "PENDING" }, { status: 200 });
}

/**
 * POST /api/driver-profile/onboarding/submit — validate the saved draft and,
 * if every rule passes, write the normalized rows and move the application into
 * the review queue.
 *
 * Takes no request body: everything it needs is already saved on the
 * application, and reading anything from the caller here would reintroduce
 * exactly the trust this endpoint exists to remove.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const resolved = await resolveSubmitContext(request);
  if ("error" in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const { driverProfileId, application } = resolved.context;
  const draft = parseOnboardingDraft(application.draft);

  if (draft === null) {
    if (application.status === "ACTION_REQUIRED") {
      return resubmit(resolved.context);
    }

    return NextResponse.json(
      { error: "Fill in the wizard before submitting your application." },
      { status: 400 },
    );
  }

  // One `now` for every time-dependent rule, so age, licence expiry and the
  // maximum vehicle year can't disagree about what day it is mid-request.
  const now = new Date();
  const problems: string[] = [];

  const personal = validatePersonal(draft, now, problems);
  const licence = validateLicence(draft, now, problems);
  const validatedVehicle = validateVehicle(draft, licence, now, problems);
  validateDocuments(application.documents, problems);

  if (problems.length > 0 || !personal || !licence || !validatedVehicle) {
    return NextResponse.json(
      {
        // Every failing rule was collected so the checks all run, but only the
        // first is reported: this API's convention is one readable `{ error }`
        // message per response, not a field-by-field array.
        error:
          problems[0] ??
          "Something in your application is incomplete. Check each step and try again.",
      },
      { status: 400 },
    );
  }

  // Read before the transaction because the payload rule needs it. `code` comes
  // from `resolveVehicleTypeSpecCode`, never from the request, so a missing row
  // means the seeded catalogue and the class map have drifted apart — a server
  // fault, not a bad submission.
  const spec = await prisma.vehicleTypeSpec.findUnique({
    where: { code: validatedVehicle.specCode },
    select: { id: true, maxPayloadKg: true },
  });

  if (!spec) {
    console.error(
      `Vehicle type spec "${validatedVehicle.specCode}" is missing; cannot submit application ${application.id}.`,
    );
    return NextResponse.json(
      { error: "We couldn't submit your application. Please try again." },
      { status: 500 },
    );
  }

  // The class-level minimum, not a class-level maximum: a driver may declare
  // more capacity than their class assumes, but never less — a vehicle that
  // cannot carry what its class promises would be matched to freight it
  // physically can't take. Has no client-side equivalent at all.
  if (validatedVehicle.vehicle.payloadKg < spec.maxPayloadKg) {
    return NextResponse.json(
      {
        error: `This vehicle's declared payload is below the ${findVehicleClass(validatedVehicle.classId).name} minimum of ${spec.maxPayloadKg.toLocaleString("en-US")} kg.`,
      },
      { status: 400 },
    );
  }

  const vehicleData = {
    driverProfileId,
    vehicleTypeSpecId: spec.id,
    ...validatedVehicle.vehicle,
  };

  try {
    await prisma.$transaction(async (tx) => {
      // Create-or-update: an application coming back through here after
      // "action required" already has a `Vehicle` row from its first
      // successful submit, and must update it rather than claim a second plate.
      const vehicleRow = application.vehicleId
        ? await tx.vehicle.update({
            where: { id: application.vehicleId },
            data: vehicleData,
          })
        : await tx.vehicle.create({ data: vehicleData });

      // 1:1 with the profile, so an upsert covers both the first submit and a
      // later correction without a read to tell them apart.
      await tx.driverLicence.upsert({
        where: { driverProfileId },
        create: { driverProfileId, ...licence },
        update: licence,
      });

      await tx.driverProfile.update({
        where: { id: driverProfileId },
        data: personal,
      });

      const submittedAt = new Date();
      await tx.driverApplication.update({
        where: { id: application.id },
        data: {
          status: "PENDING",
          vehicleId: vehicleRow.id,
          // `Prisma.DbNull` writes a SQL NULL. A bare `null` is not accepted on
          // a nullable Json column, and `Prisma.JsonNull` would store the JSON
          // `null` literal, which reads back as a present-but-unparseable draft.
          draft: Prisma.DbNull,
          firstSubmittedAt: application.firstSubmittedAt ?? submittedAt,
          lastSubmittedAt: submittedAt,
          submissionCount: { increment: 1 },
        },
      });
    });
  } catch (error: unknown) {
    // `plateNumber` is unique across every vehicle in the system, so this is
    // the one failure here a driver can actually act on — everything else is
    // ours to fix.
    if (isDuplicatePlateError(error)) {
      return NextResponse.json(
        { error: "This plate number is already registered to another vehicle." },
        { status: 409 },
      );
    }

    console.error("Failed to submit a driver onboarding application:", error);
    return NextResponse.json(
      { error: "We couldn't submit your application. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: "PENDING" }, { status: 200 });
}
