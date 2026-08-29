import { NextResponse } from "next/server";
import { CompanyReviewStatus, GeorgianCity, Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Valid `GeorgianCity` values, derived from the generated Prisma enum. */
const GEORGIAN_CITIES = Object.values(GeorgianCity);

/**
 * Shape check only — one `@`, something either side, and a dot in the domain.
 * Deliberately loose: a stricter pattern rejects valid addresses far more often
 * than it catches invalid ones, and whether the address actually receives mail
 * is a question no regex can answer. The reviewer contacting this person is the
 * real verification step (see the "Contact person unreachable" flag reason).
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A company name shorter than this is a typo, not a registered entity. */
const MIN_COMPANY_NAME_LENGTH = 3;

/** Georgian VAT identification numbers are exactly nine digits. */
const VAT_ID_PATTERN = /^\d{9}$/;

/** Inclusive bounds on the digit count of a phone number, separators ignored. */
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

/**
 * Shortest IBAN in use worldwide (Norway) is 15 characters, but the design
 * specifies 18 as the floor — Georgian IBANs are 22 — and the server enforces
 * what the design specifies. Checked after whitespace is stripped, because
 * IBANs are conventionally written in groups of four.
 */
const MIN_IBAN_LENGTH = 18;

/** The six company-detail fields step 1 of the fleet wizard collects. */
type CompanyDetailFields = {
  registeredAddress?: string;
  citiesOfOperation?: GeorgianCity[];
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  bankAccountIban?: string;
};

/** Validated shape of a logistics-company creation request body. */
type CreateLogisticsCompanyInput = CompanyDetailFields & {
  /** The four originals. Required on every call. */
  companyName: string;
  vatId: string;
  phone: string;
  city: GeorgianCity;
};

/** Trims a value and returns it only if it is a non-empty string, else null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Digits only, for a length check that ignores spaces, dashes and brackets. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** All whitespace removed, for the IBAN length check the design specifies. */
function stripWhitespace(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * Hand-rolled body validation (the project has no validation library, and this
 * stage does not warrant adding one). Returns the typed input or an error
 * message describing the first problem encountered.
 *
 * A logistics company has no account-type variants — the four original fields
 * (`companyName`, `vatId`, `phone`, `city`) are required on every call, with no
 * per-account exceptions. The six wizard fields below them are a different case:
 * they are validated only when the caller sends them, because the sign-up form
 * creates the row with the four it collects and step 1 of the fleet wizard fills
 * in the rest through this same upsert. Requiring all ten here would 400 the
 * sign-up call, so no company row would ever exist and no company could reach
 * the wizard at all. "Is this profile complete?" is asked once, at submit, by
 * `POST /api/logistics-company/onboarding/submit`.
 */
function parseCreateLogisticsCompanyBody(
  body: unknown,
): { data: CreateLogisticsCompanyInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  // Only the fields the caller actually sent are collected here, so the write
  // below can leave every other column untouched.
  const details: CompanyDetailFields = {};

  const companyName = nonEmptyString(record.companyName);
  if (companyName === null || companyName.length < MIN_COMPANY_NAME_LENGTH) {
    return {
      error: `companyName is required and must be at least ${MIN_COMPANY_NAME_LENGTH} characters.`,
    };
  }

  const vatId = nonEmptyString(record.vatId);
  if (vatId === null || !VAT_ID_PATTERN.test(vatId)) {
    return { error: "vatId must be exactly 9 digits." };
  }

  // `undefined` and `null` both mean "the caller did not send this field", which
  // is valid: the sign-up form creates the row with four fields and step 1 of
  // the wizard fills in the rest through this same upsert. An empty string is
  // *not* "not sent" — it is a sent value that fails the rule, so a wizard bug
  // cannot silently blank a column it meant to fill.
  if (
    record.registeredAddress !== undefined &&
    record.registeredAddress !== null
  ) {
    const registeredAddress = nonEmptyString(record.registeredAddress);
    if (registeredAddress === null) {
      return {
        error: "registeredAddress is required and must be a non-empty string.",
      };
    }
    // Stored verbatim apart from the trim — a registered address is free text.
    details.registeredAddress = registeredAddress;
  }

  if (
    record.citiesOfOperation !== undefined &&
    record.citiesOfOperation !== null
  ) {
    const { citiesOfOperation } = record;
    if (!Array.isArray(citiesOfOperation) || citiesOfOperation.length === 0) {
      return {
        error: "citiesOfOperation must be an array with at least one city.",
      };
    }

    const isGeorgianCity = (value: unknown): value is GeorgianCity =>
      typeof value === "string" &&
      GEORGIAN_CITIES.includes(value as GeorgianCity);

    if (!citiesOfOperation.every(isGeorgianCity)) {
      return {
        error: `citiesOfOperation must contain only valid cities: ${GEORGIAN_CITIES.join(", ")}.`,
      };
    }

    // De-duplicated rather than rejected: a repeated city is a UI slip, not an
    // attack. A `Set` preserves insertion order, and the order matters because
    // the wizard's chips render in selection order.
    details.citiesOfOperation = [...new Set(citiesOfOperation)];
  }

  if (record.contactName !== undefined && record.contactName !== null) {
    const contactName = nonEmptyString(record.contactName);
    // Two whitespace-separated parts: operations calls this person by name, and
    // a lone first name is not enough to ask for them.
    const nameParts =
      contactName?.split(/\s+/).filter((part) => part !== "") ?? [];
    if (contactName === null || nameParts.length < 2) {
      return {
        error: "contactName must be a full name — a first name and a surname.",
      };
    }
    details.contactName = contactName;
  }

  if (record.contactRole !== undefined && record.contactRole !== null) {
    const contactRole = nonEmptyString(record.contactRole);
    if (contactRole === null) {
      return {
        error: "contactRole is required and must be a non-empty string.",
      };
    }
    details.contactRole = contactRole;
  }

  if (record.contactEmail !== undefined && record.contactEmail !== null) {
    const contactEmail = nonEmptyString(record.contactEmail);
    if (contactEmail === null || !EMAIL_PATTERN.test(contactEmail)) {
      return { error: "contactEmail must be a valid email address." };
    }
    // Lowercased on the way in: addresses are compared case-insensitively
    // everywhere else in this codebase, and storing one casing stops the same
    // row from looking like two.
    details.contactEmail = contactEmail.toLowerCase();
  }

  if (record.bankAccountIban !== undefined && record.bankAccountIban !== null) {
    const bankAccountIban = nonEmptyString(record.bankAccountIban);
    // Length is counted on the whitespace-free copy, so "GE29 NB00 0000 0101
    // 9049 17" is measured as the 22 characters it actually is.
    const compactIban = stripWhitespace(bankAccountIban ?? "");
    if (bankAccountIban === null || compactIban.length < MIN_IBAN_LENGTH) {
      return {
        error: `bankAccountIban must be at least ${MIN_IBAN_LENGTH} characters.`,
      };
    }
    // Canonical form — whitespace-free and uppercased — because the grouping an
    // IBAN is conventionally written in carries no information, and "is this the
    // same account?" is only answerable against one stored form. The UI is free
    // to re-group it for display.
    details.bankAccountIban = compactIban.toUpperCase();
  }

  const phone = nonEmptyString(record.phone);
  if (
    phone === null ||
    digitsOnly(phone).length < MIN_PHONE_DIGITS ||
    digitsOnly(phone).length > MAX_PHONE_DIGITS
  ) {
    return {
      error: `phone must contain between ${MIN_PHONE_DIGITS} and ${MAX_PHONE_DIGITS} digits.`,
    };
  }

  const { city } = record;
  if (
    typeof city !== "string" ||
    !GEORGIAN_CITIES.includes(city as GeorgianCity)
  ) {
    return {
      error: `city must be one of: ${GEORGIAN_CITIES.join(", ")}.`,
    };
  }

  return {
    data: {
      companyName,
      vatId,
      // Stored trimmed but otherwise exactly as typed, deliberately *not*
      // normalised to digits-only even though the check above counts digits:
      // `phone` is `@unique` and existing rows hold whatever formatting they
      // were created with, so canonicalising new writes would make a new value
      // collide with a differently-formatted row for the same number, or fail
      // to collide when it should. Making the column canonical needs a backfill
      // migration, which is not this feature's to own.
      phone,
      // The company's primary / registered city. Kept separate from
      // `citiesOfOperation` and not folded into it: a company may be registered
      // in one city and operate out of another.
      city: city as GeorgianCity,
      ...details,
    },
  };
}

/**
 * True when `error` is a unique-constraint violation (P2002) on `phone` — i.e.
 * the caller tried to claim a number already tied to another company account.
 * `meta.target` is checked so a P2002 on `userId` (possible if two writes for
 * the same session race) is not mislabelled as a phone conflict. Postgres
 * reports either the column list or the index name
 * ("LogisticsCompany_phone_key"), so both shapes are handled.
 */
function isDuplicatePhoneError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("phone");
  }

  return typeof target === "string" && target.includes("phone");
}

/**
 * GET /api/logistics-company — return the signed-in company's profile, or
 * `null` if they haven't completed it yet (a valid state, not an error). Only
 * COMPANY users may call this.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies have a company profile." },
      { status: 403 },
    );
  }

  const logisticsCompany = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json(logisticsCompany, { status: 200 });
}

/**
 * POST /api/logistics-company — create or update the signed-in company's
 * profile. Only COMPANY users may call this. The write is an upsert keyed on
 * the user id so retries and re-submits are idempotent rather than an error.
 *
 * This is the single write path for company details: the sign-up form posts the
 * four fields it collects, and step 1 of the fleet wizard posts all ten to this
 * same route, filling in the columns the sign-up call left null. There is no
 * `PUT` and no `/onboarding/company` variant — one endpoint, one set of rules.
 *
 * **The server is authoritative.** The wizard's step-1 form runs the same rules
 * in the browser so a company sees which field is wrong without a round trip,
 * but every one of them is re-checked here: a request that skips the UI entirely
 * is held to exactly the same rules.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can create a company profile." },
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

  const parsed = parseCreateLogisticsCompanyBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // `details` carries *only* the optional fields the caller actually sent, so
  // spreading it writes nothing for the ones it did not. Do not flatten this
  // into an unconditional list of ten columns: that would blank six columns on
  // every four-field sign-up POST.
  const { companyName, vatId, phone, city, ...details } = parsed.data;

  const companyFields = {
    companyName,
    vatId,
    phone,
    city,
    ...details,
  };

  let logisticsCompany;
  try {
    // One transaction, so a company can never end up with corrected details and
    // a stale flag, or a cleared flag and un-saved details.
    logisticsCompany = await prisma.$transaction(async (tx) => {
      const company = await tx.logisticsCompany.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          ...companyFields,
        },
        update: {
          ...companyFields,
        },
      });

      // Read the caller's own application row by the company id the upsert
      // returned. A company with no application row yet (created at sign-up,
      // wizard not yet started — the `BusinessApplication` is allocated lazily
      // by the onboarding GET) has nothing to clear, and that is the common case
      // for the sign-up call.
      const application = await tx.businessApplication.findUnique({
        where: { companyId: company.id },
        select: { id: true, status: true, companyFlagReason: true },
      });

      // Posting corrected details is the only event that means "the company has
      // responded to the company-level flag", so this is the only place that
      // flag is ever cleared — the admin review sets it, and the resubmit
      // endpoint refuses while it is non-null. Without this write the
      // ACTION_REQUIRED correction loop deadlocks permanently.
      //
      // Both conditions are required, and the write is a no-op in every other
      // state. Not while `PENDING`: an admin may be looking at the row right
      // now, and resetting the verdict mid-review would discard one in flight.
      // Not when `companyFlagReason` is null: only vehicles were flagged, and
      // `companyReviewStatus` may legitimately already be VERIFIED — clearing it
      // back to PENDING would throw away a verdict the admin does not need to
      // make twice.
      if (
        application !== null &&
        application.status === "ACTION_REQUIRED" &&
        application.companyFlagReason !== null
      ) {
        await tx.businessApplication.update({
          where: { id: application.id },
          data: {
            // PENDING, never VERIFIED: the company corrected its own details,
            // and only an admin decides they are now correct. The application's
            // own `status` is deliberately *not* touched — it stays
            // ACTION_REQUIRED until the company presses Resubmit and the submit
            // endpoint moves it, since vehicle-level flags may still be
            // outstanding.
            companyReviewStatus: CompanyReviewStatus.PENDING,
            companyFlagReason: null,
          },
        });
      }

      return company;
    });
  } catch (error) {
    // `LogisticsCompany.phone` is unique — one account per number. Anything
    // else is unexpected and rethrown rather than swallowed.
    if (isDuplicatePhoneError(error)) {
      return NextResponse.json(
        {
          error: "This phone number is already registered to another account.",
        },
        { status: 409 },
      );
    }

    throw error;
  }

  return NextResponse.json(logisticsCompany, { status: 201 });
}
