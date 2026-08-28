import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type {
  ChassisType,
  DriverApplicationDocumentStatus,
  DriverApplicationDocumentType,
  DriverApplicationStatus,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDriverDocumentSignedUrls } from "@/lib/driver-document-storage";
import {
  ONBOARDING_FIRST_STEP,
  ONBOARDING_LAST_STEP,
  generateApplicationReference,
  parseOnboardingDraft,
  type OnboardingDraftV1,
} from "@/lib/driver-onboarding/draft-schema";
import { VEHICLE_CLASSES } from "@/lib/driver-onboarding/vehicle-classes";

/**
 * The read/write backbone of the driver onboarding wizard.
 *
 * `GET` returns everything both the wizard and the post-submission status
 * screen need to render — which of the two the client shows is driven by
 * `status`, not by a second endpoint. `PATCH` saves the in-progress draft.
 * Neither touches `Vehicle` or `DriverLicence`: those rows are written only at a
 * successful submit, because `Vehicle.plateNumber` is globally unique and an
 * abandoned draft must never permanently claim a real plate.
 */

/**
 * How many times `GET` re-rolls a colliding application reference before
 * giving up. `generateApplicationReference` draws from 100k values, so a
 * collision is astronomically unlikely — but it is possible, and silently
 * swallowing the unique-constraint violation would leave the driver with no
 * application at all.
 */
const REFERENCE_ATTEMPTS = 5;

/**
 * Ceiling on the serialized size of a saved draft.
 *
 * `parseOnboardingDraft` shallow-trusts the body's shape by design, and the
 * value it returns is written verbatim into a `Json` column and echoed back on
 * every `GET` — so without a cap an authenticated driver could park an
 * arbitrarily large blob (unknown keys included) on their application forever.
 * A real onboarding form is a handful of short text fields, a few KB at most;
 * 64k is deliberately generous headroom rather than a tight fit, so no honest
 * driver can ever hit it. Measured in UTF-16 code units — the same convention
 * as the `MAX_*_LENGTH` caps elsewhere in the API — which is bytes for ASCII
 * and an under-count for Georgian text, but the point here is a bound, not an
 * exact byte budget.
 */
const MAX_DRAFT_JSON_LENGTH = 64 * 1024;

/** Shape of one live document in the `GET` response. */
type OnboardingDocumentResponse = {
  type: DriverApplicationDocumentType;
  status: DriverApplicationDocumentStatus;
  flagReason: string | null;
  /** Null when signing failed — the caller renders a broken thumbnail, not a crash. */
  signedUrl: string | null;
  uploadedAt: string;
};

/** Summary of the normalized rows a successful submit wrote, for the status screen. */
type OnboardingSubmittedSummary = {
  fullName: string;
  idNumber: string;
  dateOfBirth: string;
  city: string;
  licenceNumber: string;
  licenceExpiresAt: string;
  categories: string[];
  vehicleClassName: string;
  chassisType: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  plateNumber: string;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
};

type OnboardingGetResponse = {
  status: DriverApplicationStatus;
  reference: string;
  draftStep: number;
  draftUpdatedAt: string | null;
  /** Present only while `status === "DRAFT"`; there is nothing to resume after submit. */
  draft: OnboardingDraftV1 | null;
  documents: OnboardingDocumentResponse[];
  /** Present only once `status !== "DRAFT"`; null while still a draft. */
  submittedSummary: OnboardingSubmittedSummary | null;
};

/**
 * The signed-in driver's profile plus everything `GET` renders from it. Selected
 * in one query so the whole response costs a single round trip: the profile
 * fields the summary card shows, the licence, the application, its *live*
 * documents only, and the submitted vehicle joined through to its spec.
 */
const driverProfileInclude = {
  licence: true,
  application: {
    include: {
      documents: {
        // Only the current version of each document. A retake supersedes the
        // previous row rather than overwriting it, so the un-superseded row is
        // the one — and the only one — the driver should see.
        where: { supersededAt: null },
        orderBy: { createdAt: "asc" },
      },
      vehicle: { include: { vehicleTypeSpec: true } },
    },
  },
} satisfies Prisma.DriverProfileInclude;

type DriverProfileWithOnboarding = Prisma.DriverProfileGetPayload<{
  include: typeof driverProfileInclude;
}>;

/** Non-null narrowing of the `application` relation above. */
type OnboardingApplication = NonNullable<
  DriverProfileWithOnboarding["application"]
>;

/** Either the resolved driver context, or the response to return instead. */
type DriverContext =
  { profile: DriverProfileWithOnboarding } | { response: NextResponse };

/**
 * Session + role + profile guard shared by `GET` and `PATCH`. A missing profile
 * is a 404 rather than an auto-created stub, matching
 * `driver-profile/status/route.ts`: a driver reaches onboarding only after
 * sign-up has already created their profile, so "no profile" means something
 * upstream went wrong, not that this route should invent one out of required
 * fields (city, phone, account type) it does not have.
 */
async function resolveDriverContext(request: Request): Promise<DriverContext> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  if (session.user.role !== "DRIVER") {
    return {
      response: NextResponse.json(
        { error: "Only drivers have an onboarding application." },
        { status: 403 },
      ),
    };
  }

  const profile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    include: driverProfileInclude,
  });

  if (!profile) {
    return {
      response: NextResponse.json(
        { error: "Complete your driver profile before onboarding." },
        { status: 404 },
      ),
    };
  }

  return { profile };
}

/** True when `error` is a unique-constraint violation on the generated reference. */
function isDuplicateReferenceError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  // `meta.target` is checked so a P2002 on `driverProfileId` — possible if two
  // concurrent GETs both find no application and both try to create one — is not
  // mislabelled as a reference collision and retried pointlessly. Postgres
  // reports either the column list or the index name.
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("reference");
  }

  return typeof target === "string" && target.includes("reference");
}

/**
 * Get-or-create: the driver's application row is created lazily on their first
 * visit rather than at sign-up, so the many drivers who never start onboarding
 * cost nothing. Retries only on a reference collision; any other failure
 * (including a concurrent create winning the `driverProfileId` unique index)
 * propagates to the caller.
 */
async function createApplication(
  driverProfileId: string,
): Promise<OnboardingApplication> {
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.driverApplication.create({
        data: {
          driverProfileId,
          reference: generateApplicationReference(),
          status: "DRAFT",
          // `Prisma.DbNull` rather than `null`: on a nullable Json column those
          // are different writes (SQL NULL vs. the JSON `null` literal), and
          // `parseOnboardingDraft` should see an absent draft, not a JSON null.
          draft: Prisma.DbNull,
        },
        include: {
          documents: {
            where: { supersededAt: null },
            orderBy: { createdAt: "asc" },
          },
          vehicle: { include: { vehicleTypeSpec: true } },
        },
      });
    } catch (error: unknown) {
      if (!isDuplicateReferenceError(error)) {
        throw error;
      }
    }
  }

  throw new Error(
    `Could not generate a unique application reference after ${REFERENCE_ATTEMPTS} attempts.`,
  );
}

/**
 * Recovers the wizard's presentation class from the spec the submit resolved it
 * to — the reverse of `resolveVehicleTypeSpecCode`. Matched on the vehicle's own
 * chassis type where it has one, since the same spec code could in principle be
 * reachable from more than one class; the un-keyed scan is the fallback for a
 * vehicle registered before `chassisType` was collected. Returns `null` when
 * nothing matches (for example a vehicle added through the older "add a vehicle"
 * form, whose spec no class maps to) so the caller can fall back to the spec's
 * own label rather than showing an empty class name.
 */
function findVehicleClassNameBySpecCode(
  specCode: string,
  chassisType: ChassisType | null,
): string | null {
  const matched = VEHICLE_CLASSES.find((vehicleClass) =>
    chassisType
      ? vehicleClass.specCodeByChassis[chassisType] === specCode
      : Object.values(vehicleClass.specCodeByChassis).includes(specCode),
  );

  return matched?.name ?? null;
}

/**
 * Builds the status screen's summary card from the *normalized* rows the submit
 * wrote, never from the draft — after submit the draft is no longer the source
 * of truth, and an admin-visible summary must show exactly what was persisted.
 *
 * Returns `null` when the licence or vehicle row is missing, which should only
 * happen for an application that is somehow past DRAFT without a completed
 * submit; the status screen renders without the card rather than crashing.
 */
function buildSubmittedSummary(
  profile: DriverProfileWithOnboarding,
  application: OnboardingApplication,
): OnboardingSubmittedSummary | null {
  const { licence } = profile;
  const { vehicle } = application;

  if (!licence || !vehicle) {
    return null;
  }

  // The profile scalars are nullable in the schema (they are filled in by this
  // very wizard), but a submitted application has necessarily set them. Empty
  // strings keep a half-written row from breaking the whole status screen.
  const fullName = [profile.firstName, profile.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  return {
    fullName,
    idNumber: profile.idNumber ?? "",
    dateOfBirth: profile.dateOfBirth?.toISOString() ?? "",
    city: profile.city,
    licenceNumber: licence.licenceNumber,
    licenceExpiresAt: licence.expiresAt.toISOString(),
    categories: licence.categories,
    vehicleClassName:
      findVehicleClassNameBySpecCode(
        vehicle.vehicleTypeSpec.code,
        vehicle.chassisType,
      ) ?? vehicle.vehicleTypeSpec.label,
    chassisType: vehicle.chassisType ?? "",
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    colour: vehicle.colour ?? "",
    plateNumber: vehicle.plateNumber,
    payloadKg: vehicle.payloadKg,
    cargoLengthM: vehicle.cargoLengthM,
    cargoWidthM: vehicle.cargoWidthM,
    cargoHeightM: vehicle.cargoHeightM,
  };
}

/**
 * Resolves one short-lived signed URL per live document in a single batch call,
 * rather than one round trip per thumbnail. A path that fails to sign is simply
 * absent from the map and surfaces as `signedUrl: null`.
 *
 * A failure of the batch call itself (Storage unreachable, Supabase env vars
 * absent) degrades to no URLs at all rather than propagating: the wizard's own
 * state — which step to resume at, what has been filled in — matters more than
 * its thumbnails, and a Storage outage must not lock every driver out of
 * onboarding entirely.
 */
async function buildDocumentResponses(
  documents: OnboardingApplication["documents"],
): Promise<OnboardingDocumentResponse[]> {
  const signedUrlByPath = await getDriverDocumentSignedUrls(
    documents.map((document) => document.storagePath),
  ).catch((error: unknown) => {
    console.error("Failed to sign onboarding document URLs:", error);
    return {} as Record<string, string>;
  });

  return documents.map((document) => ({
    type: document.type,
    status: document.status,
    flagReason: document.flagReason,
    signedUrl: signedUrlByPath[document.storagePath] ?? null,
    uploadedAt: document.createdAt.toISOString(),
  }));
}

/**
 * GET /api/driver-profile/onboarding — everything the wizard or the status
 * screen needs to render, creating the driver's application row on first call.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const context = await resolveDriverContext(request);
  if ("response" in context) {
    return context.response;
  }

  const { profile } = context;

  let application = profile.application;
  if (!application) {
    try {
      application = await createApplication(profile.id);
    } catch (error: unknown) {
      console.error("Failed to create a driver application:", error);
      return NextResponse.json(
        { error: "Could not start your application. Please try again." },
        { status: 500 },
      );
    }
  }

  const isDraft = application.status === "DRAFT";

  const body: OnboardingGetResponse = {
    status: application.status,
    reference: application.reference,
    draftStep: application.draftStep,
    draftUpdatedAt: application.draftUpdatedAt?.toISOString() ?? null,
    draft: isDraft ? parseOnboardingDraft(application.draft) : null,
    documents: await buildDocumentResponses(application.documents),
    submittedSummary: isDraft
      ? null
      : buildSubmittedSummary(profile, application),
  };

  return NextResponse.json(body, { status: 200 });
}

/** Validated shape of a draft-save request body. */
type SaveDraftInput = {
  draftStep: number;
  draft: OnboardingDraftV1;
};

/** True for a plain JSON object — an array is not a valid draft section. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * Structurally stricter than `parseOnboardingDraft`, which shallow-trusts our
 * own previously-saved rows: this body arrives from the browser, so each section
 * that is present must at least be an object before it is persisted. Field-level
 * validation stays out of here on purpose — a half-filled draft is the normal
 * case, and the real rules are enforced once, at submit.
 */
function parseSaveDraftBody(
  body: unknown,
): { data: SaveDraftInput } | { error: string } {
  if (!isJsonObject(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const { draftStep, draft } = body;

  if (
    typeof draftStep !== "number" ||
    !Number.isInteger(draftStep) ||
    draftStep < ONBOARDING_FIRST_STEP ||
    draftStep > ONBOARDING_LAST_STEP
  ) {
    return {
      error: `draftStep must be an integer between ${ONBOARDING_FIRST_STEP} and ${ONBOARDING_LAST_STEP}.`,
    };
  }

  const parsedDraft = parseOnboardingDraft(draft);
  if (!parsedDraft) {
    return { error: "draft must be an object with version 1." };
  }

  for (const section of ["personal", "licence", "vehicle"] as const) {
    const value = parsedDraft[section];
    if (value !== undefined && !isJsonObject(value)) {
      return { error: `draft.${section} must be an object.` };
    }
  }

  // Measured on the parsed draft — the exact value about to be persisted —
  // rather than on the raw body, so the unknown extra keys that survive
  // `parseOnboardingDraft` count against the cap too.
  if (JSON.stringify(parsedDraft).length > MAX_DRAFT_JSON_LENGTH) {
    return {
      error: `draft must serialise to ${MAX_DRAFT_JSON_LENGTH} characters or fewer.`,
    };
  }

  return { data: { draftStep, draft: parsedDraft } };
}

/**
 * PATCH /api/driver-profile/onboarding — save the in-progress draft.
 *
 * A whole-object replace, not a merge: the client holds the full draft in memory
 * and sends all of it, so clearing a field really clears it. The caller is
 * expected to debounce (see the wizard's draft-state context) — this is meant to
 * be hit a few times a minute per driver, not on every keystroke.
 *
 * Only a DRAFT application is writable here. Once submitted, the application's
 * data changes only through the submit endpoint (which is also how a driver
 * resubmits after "action required"), so that an admin never reviews one set of
 * answers while the driver silently edits another underneath them.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const context = await resolveDriverContext(request);
  if ("response" in context) {
    return context.response;
  }

  const { application } = context.profile;
  if (!application) {
    return NextResponse.json(
      { error: "No application to save. Load your application first." },
      { status: 404 },
    );
  }

  if (application.status !== "DRAFT") {
    return NextResponse.json(
      { error: "A submitted application can no longer be edited." },
      { status: 400 },
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

  const parsed = parseSaveDraftBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await prisma.driverApplication.update({
    where: { id: application.id },
    data: {
      // Narrowed to Prisma's JSON input type: `OnboardingDraftV1` is a plain
      // serialisable object, but Prisma's `InputJsonValue` is structural and
      // does not accept a named optional-property type directly.
      draft: parsed.data.draft as Prisma.InputJsonValue,
      draftStep: parsed.data.draftStep,
      draftUpdatedAt: new Date(),
    },
  });

  // No body: the client already holds exactly the state it just sent.
  return new NextResponse(null, { status: 204 });
}
