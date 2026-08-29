import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type {
  BusinessApplicationStatus,
  BusinessApplicationVehicleStatus,
  ChassisType,
  CompanyReviewStatus,
  LicenceCategory,
  VehicleClass,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findBodyType } from "@/lib/driver-onboarding/vehicle-classes";
import {
  FLEET_FIRST_STEP,
  FLEET_LAST_STEP,
  FLEET_MAX_VEHICLES,
  MAX_DRAFT_JSON_LENGTH,
  generateBusinessApplicationReference,
  parseFleetDraft,
  type FleetDraftV1,
} from "@/lib/fleet-onboarding/draft-schema";

/**
 * The read/write backbone of the fleet onboarding wizard, and the direct
 * counterpart of `src/app/api/driver-profile/onboarding/route.ts`.
 *
 * `GET` returns everything both the wizard and the post-submission status screen
 * need to render — which of the two the client shows is driven by `status`, not
 * by a second endpoint. `PATCH` saves the in-progress draft. Neither writes to
 * `Vehicle`, `DriverVehicleAssignment` or `BusinessApplicationVehicle`: those
 * rows are created once, at a successful submit, inside one transaction, because
 * `Vehicle.plateNumber` is globally unique and an abandoned draft must never
 * permanently claim a real plate.
 */

/**
 * How many times `GET` re-rolls a colliding application reference before giving
 * up. `generateBusinessApplicationReference` draws from 100k values, so a
 * collision is astronomically unlikely — but it is possible, and silently
 * swallowing the unique-constraint violation would leave the company with no
 * application at all.
 */
const REFERENCE_ATTEMPTS = 5;

/**
 * One reviewed vehicle in the `GET` response, in table order.
 *
 * This is field-for-field the wizard's `FleetVehicleVerdict`, which the draft
 * context passes straight through with no adapter. Do not add, drop or rename a
 * field on either side without changing both.
 */
type FleetVehicleVerdict = {
  /** `BusinessApplicationVehicle.id` — what the admin verdict mutations address. */
  id: string;
  /**
   * `Vehicle.id` — what the company's per-vehicle correction `PATCH` (the "Fix"
   * button) is keyed on. Null once the vehicle has been removed from the fleet:
   * the row still renders its verdict, and Fix is disabled rather than pointing
   * at nothing.
   */
  vehicleId: string | null;
  /** 1-based, derived from `createdAt` ordering. Not a column. */
  position: number;
  status: BusinessApplicationVehicleStatus;
  /** One of the six per-vehicle flag reasons, or null. */
  flagReason: string | null;
  chassisType: ChassisType;
  vehicleClass: VehicleClass;
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  colour: string | null;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  /** The live assignment's driver, or null if the vehicle has none. */
  driver: {
    driverProfileId: string;
    name: string;
    phone: string;
    categories: LicenceCategory[];
  } | null;
};

/**
 * Summary of the normalized rows a successful submit wrote, for the status
 * screen — never built from the draft, which stops being the source of truth the
 * moment the application is submitted. Also what step 1's form seeds from when
 * it is reached from a company-level flag, since `draft` is null in that state.
 */
type FleetSubmittedSummary = {
  companyName: string;
  vatId: string;
  registeredAddress: string;
  city: string;
  citiesOfOperation: string[];
  contactName: string;
  contactRole: string;
  contactEmail: string;
  phone: string;
  /** Masked to the last four characters — see `maskIban`. */
  bankAccountIban: string;
  vehicleCount: number;
  /** Body-type label -> count, for the status screen's fleet line. */
  countsByBodyType: Record<string, number>;
};

/**
 * The company's persisted `LogisticsCompany` row, as step 1 of the wizard seeds
 * its fields from.
 *
 * Distinct from `FleetSubmittedSummary` and deliberately not folded into it:
 * that one means "what the reviewer was sent" and is null for the whole time
 * the company is still filling the wizard in, which is exactly when the wizard
 * needs these values. Sign-up already persisted `companyName`, `vatId`, `phone`
 * and `city`, so without this the wizard opened blank and asked for all four a
 * second time — and could not render the read-only registered city at all.
 *
 * Nullable columns collapse to `""` (see `companyDetailColumns`), because a
 * half-filled row is the normal state here rather than an error.
 */
type FleetCompanyOnRecord = {
  companyName: string;
  vatId: string;
  phone: string;
  /** `GeorgianCity` enum value. */
  city: string;
  registeredAddress: string;
  citiesOfOperation: string[];
  contactName: string;
  contactRole: string;
  /** The saved contact email, or the account's own address as the seed for it. */
  contactEmail: string;
  /**
   * The real account number, **not** masked — the one asymmetry with
   * `FleetSubmittedSummary`, and a deliberate one. The summary is a read-only
   * confirmation of what was submitted, so bullets are enough; this seeds an
   * editable field the owner is filling in about their own company, and seeding
   * it with bullets would have them save the mask over a good IBAN.
   */
  bankAccountIban: string;
};

type FleetOnboardingGetResponse = {
  status: BusinessApplicationStatus;
  reference: string;
  /**
   * Present only while `status` is DRAFT — the one state the draft is editable
   * in. Null otherwise: an in-review or approved application has nothing to
   * resume, and an ACTION_REQUIRED one is corrected through the two targeted
   * endpoints (per-vehicle `PATCH`, `POST /api/logistics-company`), not by
   * editing the draft.
   */
  draft: FleetDraftV1 | null;
  draftStep: number;
  /** ISO, drives the welcome screen's resume banner. */
  draftUpdatedAt: string | null;
  companyReviewStatus: CompanyReviewStatus;
  /** One of the four company flag reasons, or null. */
  companyFlagReason: string | null;
  /** Per-vehicle verdicts, in table order. Empty until a first submit. */
  vehicles: FleetVehicleVerdict[];
  /** Present only once `status !== "DRAFT"`; null while still a draft. */
  submittedSummary: FleetSubmittedSummary | null;
  /**
   * Always present, in every status: it is the company's own row, and the
   * wizard needs it precisely while `submittedSummary` is null.
   */
  companyOnRecord: FleetCompanyOnRecord;
};

/**
 * The application's own relations, factored out of `companyInclude` so the lazy
 * `create` below selects exactly the same shape as the read and the two cannot
 * drift apart.
 */
const applicationInclude = {
  vehicles: {
    // There is no `position` column. Row order is `createdAt` ascending — the
    // order the submit inserted the rows in, which is the order the company
    // listed them in step 3 — and the 1-based `position` in the response is the
    // index computed from this ordering. Never `orderBy: { position: "asc" }`;
    // it does not compile against the schema.
    orderBy: { createdAt: "asc" },
    include: {
      vehicle: {
        include: {
          assignments: {
            where: { unassignedAt: null },
            include: {
              driverProfile: {
                include: {
                  licence: true,
                  // The roster keys a driver's display name on `User.name`, and
                  // step 4 matches these rows against the roster; reading the
                  // same column keeps the two surfaces from disagreeing.
                  // `DriverProfile.firstName`/`lastName` are null for the
                  // company-created drivers this flow produces.
                  user: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.BusinessApplicationInclude;

/**
 * The signed-in company plus everything `GET` renders from it, selected in one
 * query so the whole response costs a single round trip.
 */
const companyInclude = {
  application: { include: applicationInclude },
  // The account's own email, for `companyOnRecord.contactEmail`'s fallback — a
  // company that has not yet saved a contact email is seeded with the address
  // it signs in with. One extra column on a query that already joins the
  // application, not a second round trip.
  user: { select: { email: true } },
} satisfies Prisma.LogisticsCompanyInclude;

type LogisticsCompanyWithApplication = Prisma.LogisticsCompanyGetPayload<{
  include: typeof companyInclude;
}>;

/** Non-null narrowing of the `application` relation above. */
type FleetApplication = NonNullable<
  LogisticsCompanyWithApplication["application"]
>;

/** One `BusinessApplicationVehicle` row with its optional vehicle join. */
type FleetApplicationVehicle = FleetApplication["vehicles"][number];

/** Either the resolved company context, or the response to return instead. */
type CompanyContext =
  { company: LogisticsCompanyWithApplication } | { response: NextResponse };

/**
 * Session + role + company guard shared by `GET` and `PATCH`. A missing company
 * is a 404 rather than an auto-created stub, for the same reason
 * `resolveDriverContext` gives: a company reaches onboarding only after sign-up
 * has already created its `LogisticsCompany`, so "no company" means something
 * upstream went wrong, not that this route should invent one out of required
 * fields (`companyName`, `vatId`, `phone`, `city`) it does not have.
 */
async function resolveCompanyContext(
  request: Request,
): Promise<CompanyContext> {
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
    include: companyInclude,
  });

  if (!company) {
    return {
      response: NextResponse.json(
        { error: "Complete your company profile before onboarding." },
        { status: 404 },
      ),
    };
  }

  return { company };
}

/** True when `error` is a unique-constraint violation on the generated reference. */
function isDuplicateReferenceError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  // `meta.target` is checked so a P2002 on `companyId` — possible if two
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
 * Get-or-create: the company's application row is created lazily on its first
 * visit rather than at sign-up, so the many companies that never start
 * onboarding cost nothing. The reference is allocated here, in the same
 * `create`, which is why `reference` is a non-nullable column. Retries only on a
 * reference collision; any other failure (including a concurrent create winning
 * the `companyId` unique index) propagates to the caller.
 */
async function createApplication(companyId: string): Promise<FleetApplication> {
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.businessApplication.create({
        data: {
          companyId,
          reference: generateBusinessApplicationReference(),
          status: "DRAFT",
          // `Prisma.DbNull` rather than `null`: on a nullable Json column those
          // are different writes (SQL NULL vs. the JSON `null` literal), and
          // `parseFleetDraft` should see an absent draft, not a JSON null.
          draft: Prisma.DbNull,
        },
        include: applicationInclude,
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
 * Flattens one review row into its response entry.
 *
 * `chassisType` and `vehicleClass` are read from the review row's own
 * denormalised columns rather than from the joined `Vehicle`: that is precisely
 * why those columns exist, since the join returns nothing once `vehicleId` is
 * null but the status screen must still say what the company declared and what
 * was reviewed. Every field sourced from the join is therefore optional-chained
 * and defaulted, so a row whose vehicle was removed renders its verdict instead
 * of throwing.
 *
 * `position` is the 1-based index in the `createdAt`-ascending ordering above —
 * a derived number, not a column.
 */
function toVehicleVerdict(
  row: FleetApplicationVehicle,
  index: number,
): FleetVehicleVerdict {
  // At most one live assignment per vehicle, guaranteed by the partial unique
  // index `driver_vehicle_assignment_live_vehicle_unique`.
  const assignment = row.vehicle?.assignments[0];
  const driverProfile = assignment?.driverProfile;

  return {
    id: row.id,
    vehicleId: row.vehicleId,
    position: index + 1,
    status: row.status,
    flagReason: row.flagReason,
    chassisType: row.chassisType,
    vehicleClass: row.vehicleClass,
    plateNumber: row.vehicle?.plateNumber ?? null,
    make: row.vehicle?.make ?? null,
    model: row.vehicle?.model ?? null,
    year: row.vehicle?.year ?? null,
    colour: row.vehicle?.colour ?? null,
    payloadKg: row.vehicle?.payloadKg ?? null,
    cargoLengthM: row.vehicle?.cargoLengthM ?? null,
    cargoWidthM: row.vehicle?.cargoWidthM ?? null,
    cargoHeightM: row.vehicle?.cargoHeightM ?? null,
    driver: driverProfile
      ? {
          driverProfileId: driverProfile.id,
          name: driverProfile.user.name,
          phone: driverProfile.phone,
          // Empty when the driver has no licence on file — an older
          // company-created account predating licence capture.
          categories: driverProfile.licence?.categories ?? [],
        }
      : null,
  };
}

/**
 * Masks a payout account to its last four characters.
 *
 * The wizard already holds the full value in its draft while editing; the status
 * screen only needs to confirm *which* account was submitted, and an unmasked
 * payout account in a response body that is logged, cached or screen-shared is a
 * needless disclosure. A value of four characters or fewer is masked entirely
 * rather than echoed back whole.
 */
function maskIban(value: string): string {
  if (value.length <= 4) {
    return "•".repeat(value.length);
  }

  return `${"•".repeat(value.length - 4)}${value.slice(-4)}`;
}

/**
 * Tallies the reviewed vehicles by cargo body, keyed on the body's short label
 * so the status screen's fleet line renders "2 Dry Box, 1 Refrigerated" without
 * carrying its own copy of the enum-to-label map.
 */
function countByBodyType(
  vehicles: FleetApplicationVehicle[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const row of vehicles) {
    const label = findBodyType(row.chassisType).shortLabel;
    counts[label] = (counts[label] ?? 0) + 1;
  }

  return counts;
}

/**
 * The company's detail columns, with every nullable one collapsed to `""`.
 *
 * Shared by both company-shaped response fields so they cannot drift apart in
 * how they read a half-filled row: those columns are nullable in the schema
 * because this very wizard is what fills them in, and pre-existing companies
 * have none.
 *
 * `bankAccountIban` is deliberately *not* here. It is the one column the two
 * callers legitimately disagree about — masked in the summary, raw in the seed
 * — so each states its own choice rather than inheriting one from here.
 */
function companyDetailColumns(company: LogisticsCompanyWithApplication) {
  return {
    companyName: company.companyName,
    vatId: company.vatId,
    registeredAddress: company.registeredAddress ?? "",
    city: company.city,
    citiesOfOperation: company.citiesOfOperation,
    contactName: company.contactName ?? "",
    contactRole: company.contactRole ?? "",
    contactEmail: company.contactEmail ?? "",
    phone: company.phone,
  };
}

/**
 * Builds the status screen's summary from the *normalized* rows — the company's
 * own columns and its review rows — never from the draft: after submit the draft
 * is no longer the source of truth, and a summary the company shows to itself
 * must match exactly what the reviewer sees.
 */
function buildSubmittedSummary(
  company: LogisticsCompanyWithApplication,
  application: FleetApplication,
): FleetSubmittedSummary {
  return {
    ...companyDetailColumns(company),
    bankAccountIban: maskIban(company.bankAccountIban ?? ""),
    vehicleCount: application.vehicles.length,
    countsByBodyType: countByBodyType(application.vehicles),
  };
}

/**
 * Builds the wizard's seed from the same columns — see `FleetCompanyOnRecord`
 * for why it exists alongside the summary rather than inside it.
 *
 * Two values differ from the summary's reading of the same row, both because
 * this feeds an editable form rather than a read-only confirmation:
 *
 * - `contactEmail` falls back to the address the account authenticates with.
 *   Sign-up does not collect a contact email, so the column is null for every
 *   company until step 1 saves one, and the account email is the address the
 *   company has already given us. It is a *default for a field the company can
 *   overwrite*, never an identity — the login is `User.email`, and editing the
 *   company's contact email does not change it.
 * - `bankAccountIban` is the real value rather than `maskIban`'s bullets, so a
 *   company that reopens step 1 does not save the mask over its own account
 *   number.
 */
function buildCompanyOnRecord(
  company: LogisticsCompanyWithApplication,
): FleetCompanyOnRecord {
  return {
    ...companyDetailColumns(company),
    contactEmail: company.contactEmail ?? company.user.email,
    bankAccountIban: company.bankAccountIban ?? "",
  };
}

/**
 * GET /api/logistics-company/onboarding — everything the wizard or the status
 * screen needs to render, creating the company's application row on first call.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const context = await resolveCompanyContext(request);
  if ("response" in context) {
    return context.response;
  }

  const { company } = context;

  let application = company.application;
  if (!application) {
    try {
      application = await createApplication(company.id);
    } catch (error: unknown) {
      console.error("Failed to create a business application:", error);
      return NextResponse.json(
        { error: "Could not start your application. Please try again." },
        { status: 500 },
      );
    }
  }

  const isDraft = application.status === "DRAFT";

  const body: FleetOnboardingGetResponse = {
    status: application.status,
    reference: application.reference,
    draft: isDraft ? parseFleetDraft(application.draft) : null,
    draftStep: application.draftStep,
    draftUpdatedAt: application.draftUpdatedAt?.toISOString() ?? null,
    companyReviewStatus: application.companyReviewStatus,
    companyFlagReason: application.companyFlagReason,
    vehicles: application.vehicles.map((row, index) =>
      toVehicleVerdict(row, index),
    ),
    submittedSummary: isDraft
      ? null
      : buildSubmittedSummary(company, application),
    // Unconditional, unlike the summary above: the wizard seeds step 1 from
    // this, and it is a draft for the whole time it is being filled in.
    companyOnRecord: buildCompanyOnRecord(company),
  };

  return NextResponse.json(body, { status: 200 });
}

/** Validated shape of a draft-save request body. */
type SaveDraftInput = {
  draftStep: number;
  draft: FleetDraftV1;
};

/** True for a plain JSON object — an array is not a valid draft section. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * Structurally stricter than `parseFleetDraft`, which shallow-trusts our own
 * previously-saved rows: this body arrives from the browser, so each section
 * that is present must at least be the right kind of value before it is
 * persisted. Field-level validation stays out of here on purpose — a half-filled
 * draft is the normal case, and the real rules are enforced once, at submit.
 *
 * `draftStep` is clamped by *rejection*, not by silent coercion: a client
 * sending step 9 gets a 400, not a quietly-stored 5.
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
    draftStep < FLEET_FIRST_STEP ||
    draftStep > FLEET_LAST_STEP
  ) {
    return {
      error: `draftStep must be an integer between ${FLEET_FIRST_STEP} and ${FLEET_LAST_STEP}.`,
    };
  }

  const parsedDraft = parseFleetDraft(draft);
  if (!parsedDraft) {
    return { error: "draft must be an object with version 1." };
  }

  // Two sections, not three: the driver of a vehicle lives on the vehicle, so
  // there is no `assignments` section to check.
  for (const section of ["company", "fleet"] as const) {
    const value = parsedDraft[section];
    if (value !== undefined && !isJsonObject(value)) {
      return { error: `draft.${section} must be an object.` };
    }
  }

  const { vehicles } = parsedDraft;
  if (vehicles !== undefined) {
    if (!Array.isArray(vehicles)) {
      return { error: "draft.vehicles must be an array." };
    }

    if (vehicles.length > FLEET_MAX_VEHICLES) {
      return {
        error: `draft.vehicles must contain ${FLEET_MAX_VEHICLES} entries or fewer.`,
      };
    }
  }

  // Measured on the parsed draft — the exact value about to be persisted —
  // rather than on the raw body, so the unknown extra keys that survive
  // `parseFleetDraft` count against the cap too.
  if (JSON.stringify(parsedDraft).length > MAX_DRAFT_JSON_LENGTH) {
    return {
      error: `draft must serialise to ${MAX_DRAFT_JSON_LENGTH} characters or fewer.`,
    };
  }

  return { data: { draftStep, draft: parsedDraft } };
}

/**
 * PATCH /api/logistics-company/onboarding — save the in-progress draft.
 *
 * A whole-object replace, not a merge: the client holds the full draft in memory
 * and sends all of it, so clearing a field really clears it. The caller is
 * expected to debounce (see the wizard's draft-state context) — this is meant to
 * be hit a few times a minute per company, not on every keystroke.
 *
 * Only a DRAFT application is writable here, and that includes ACTION_REQUIRED.
 * Once a company has submitted, the normalized rows are the source of truth and
 * the draft is a historical artefact: an admin is looking at `Vehicle` and
 * `LogisticsCompany` rows, not at a JSON blob, so a correction that only edited
 * the draft would change nothing the reviewer can see, and a resubmit that
 * replayed the whole draft would silently overwrite fields the admin had already
 * approved. The correction loop therefore goes through two targeted writes
 * instead: `PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]` for a
 * flagged vehicle, and `POST /api/logistics-company` for a flagged company
 * block. Refusing PENDING and APPROVED has the usual motivation: an admin must
 * never review one set of answers while the company silently edits another
 * underneath them.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const context = await resolveCompanyContext(request);
  if ("response" in context) {
    return context.response;
  }

  const { application } = context.company;
  if (!application) {
    return NextResponse.json(
      { error: "No application to save. Load your application first." },
      { status: 404 },
    );
  }

  if (application.status !== "DRAFT") {
    return NextResponse.json(
      { error: "An application under review can no longer be edited." },
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

  await prisma.businessApplication.update({
    where: { id: application.id },
    data: {
      // Narrowed to Prisma's JSON input type: `FleetDraftV1` is a plain
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
