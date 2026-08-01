import { NextResponse } from "next/server";
import { ClientAccountType, ClientGender, Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Valid `ClientAccountType` values, derived from the generated Prisma enum. */
const CLIENT_ACCOUNT_TYPES = Object.values(ClientAccountType);

/** Valid `ClientGender` values, derived from the generated Prisma enum. */
const CLIENT_GENDERS = Object.values(ClientGender);

/** Validated shape of a client-profile creation request body. */
type CreateClientProfileInput = {
  accountType: ClientAccountType;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  vatId: string | null;
  phone: string;
  // Verification details — only ever populated for INDIVIDUAL accounts.
  dateOfBirth: Date | null;
  gender: ClientGender | null;
  idNumber: string | null;
};

/** Trims a value and returns it only if it is a non-empty string, else null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Parses an optional ISO date string (e.g. "1990-05-20"). Returns:
 * - `{ value: null }` when the field is absent/empty (it is optional), or
 * - `{ value: Date }` for a valid, non-future date, or
 * - `{ error }` when a value is present but malformed or in the future.
 */
function parseOptionalDateOfBirth(
  value: unknown,
): { value: Date | null } | { error: string } {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }

  if (typeof value !== "string") {
    return { error: "dateOfBirth must be an ISO date string." };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "dateOfBirth must be a valid date." };
  }

  if (parsed.getTime() > Date.now()) {
    return { error: "dateOfBirth cannot be in the future." };
  }

  return { value: parsed };
}

/**
 * Parses an optional gender value. Returns `{ value: null }` when absent, a
 * valid `ClientGender` when present and recognised, or `{ error }` otherwise.
 */
function parseOptionalGender(
  value: unknown,
): { value: ClientGender | null } | { error: string } {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }

  if (
    typeof value !== "string" ||
    !CLIENT_GENDERS.includes(value as ClientGender)
  ) {
    return {
      error: `gender must be one of: ${CLIENT_GENDERS.join(", ")}.`,
    };
  }

  return { value: value as ClientGender };
}

/**
 * Hand-rolled body validation (the project has no validation library, and this
 * stage does not warrant adding one). Returns the typed input or an error
 * message describing the first problem encountered.
 *
 * INDIVIDUAL accounts require first name, last name, and phone; company fields
 * are stored as null. BUSINESS accounts require company name, VAT id, and
 * phone; the personal name fields are stored as null.
 */
function parseCreateClientProfileBody(
  body: unknown,
): { data: CreateClientProfileInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const { accountType } = record;

  if (
    typeof accountType !== "string" ||
    !CLIENT_ACCOUNT_TYPES.includes(accountType as ClientAccountType)
  ) {
    return {
      error: `accountType must be one of: ${CLIENT_ACCOUNT_TYPES.join(", ")}.`,
    };
  }

  const phone = nonEmptyString(record.phone);
  if (phone === null) {
    return { error: "phone is required and must be a non-empty string." };
  }

  if (accountType === ClientAccountType.INDIVIDUAL) {
    const firstName = nonEmptyString(record.firstName);
    if (firstName === null) {
      return {
        error: "firstName is required and must be a non-empty string.",
      };
    }

    const lastName = nonEmptyString(record.lastName);
    if (lastName === null) {
      return { error: "lastName is required and must be a non-empty string." };
    }

    // Verification details are optional here — a client can save their basic
    // profile at sign-up and complete these later on the profile page.
    const dateOfBirth = parseOptionalDateOfBirth(record.dateOfBirth);
    if ("error" in dateOfBirth) {
      return { error: dateOfBirth.error };
    }

    const gender = parseOptionalGender(record.gender);
    if ("error" in gender) {
      return { error: gender.error };
    }

    return {
      data: {
        accountType: ClientAccountType.INDIVIDUAL,
        firstName,
        lastName,
        companyName: null,
        vatId: null,
        phone,
        dateOfBirth: dateOfBirth.value,
        gender: gender.value,
        idNumber: nonEmptyString(record.idNumber),
      },
    };
  }

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

  // Verification details don't apply to a company; store them as null even if
  // the request happens to include them.
  return {
    data: {
      accountType: ClientAccountType.BUSINESS,
      firstName: null,
      lastName: null,
      companyName,
      vatId,
      phone,
      dateOfBirth: null,
      gender: null,
      idNumber: null,
    },
  };
}

/**
 * True when `error` is a unique-constraint violation (P2002) on `phone` — i.e.
 * the caller tried to claim a number already tied to another client account.
 * `meta.target` is checked so a P2002 on `userId` (possible if two writes for
 * the same session race) is not mislabelled as a phone conflict. Postgres
 * reports either the column list or the index name ("ClientProfile_phone_key"),
 * so both shapes are handled.
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
 * GET /api/client-profile — return the signed-in client's profile, or `null`
 * if they haven't completed it yet (a valid state, not an error). Only CLIENT
 * users may call this.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "CLIENT") {
    return NextResponse.json(
      { error: "Only clients have a client profile." },
      { status: 403 },
    );
  }

  const clientProfile = await prisma.clientProfile.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json(clientProfile, { status: 200 });
}

/**
 * POST /api/client-profile — create or update the signed-in client's profile.
 * Only CLIENT users may call this. The write is an upsert keyed on the user id
 * so retries and re-submits are idempotent rather than an error.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "CLIENT") {
    return NextResponse.json(
      { error: "Only clients can create a client profile." },
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

  const parsed = parseCreateClientProfileBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const {
    accountType,
    firstName,
    lastName,
    companyName,
    vatId,
    phone,
    dateOfBirth,
    gender,
    idNumber,
  } = parsed.data;

  let clientProfile;
  try {
    clientProfile = await prisma.clientProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        accountType,
        firstName,
        lastName,
        companyName,
        vatId,
        phone,
        dateOfBirth,
        gender,
        idNumber,
      },
      update: {
        accountType,
        firstName,
        lastName,
        companyName,
        vatId,
        phone,
        dateOfBirth,
        gender,
        idNumber,
      },
    });
  } catch (error) {
    // `ClientProfile.phone` is unique — one account per client. Anything else
    // is unexpected and rethrown rather than swallowed.
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

  return NextResponse.json(clientProfile, { status: 201 });
}
