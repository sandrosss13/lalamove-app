import { NextResponse } from "next/server";
import { GeorgianCity, Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Valid `GeorgianCity` values, derived from the generated Prisma enum. */
const GEORGIAN_CITIES = Object.values(GeorgianCity);

/** Validated shape of a logistics-company creation request body. */
type CreateLogisticsCompanyInput = {
  companyName: string;
  vatId: string;
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
 * A logistics company has no account-type variants — every field is required.
 */
function parseCreateLogisticsCompanyBody(
  body: unknown,
): { data: CreateLogisticsCompanyInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

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

  const phone = nonEmptyString(record.phone);
  if (phone === null) {
    return { error: "phone is required and must be a non-empty string." };
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
      phone,
      city: city as GeorgianCity,
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

  const { companyName, vatId, phone, city } = parsed.data;

  let logisticsCompany;
  try {
    logisticsCompany = await prisma.logisticsCompany.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        companyName,
        vatId,
        phone,
        city,
      },
      update: {
        companyName,
        vatId,
        phone,
        city,
      },
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
