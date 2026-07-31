import { NextResponse } from "next/server";
import { ClientAccountType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Valid `ClientAccountType` values, derived from the generated Prisma enum. */
const CLIENT_ACCOUNT_TYPES = Object.values(ClientAccountType);

/** Validated shape of a client-profile creation request body. */
type CreateClientProfileInput = {
  accountType: ClientAccountType;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  vatId: string | null;
  phone: string;
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

    return {
      data: {
        accountType: ClientAccountType.INDIVIDUAL,
        firstName,
        lastName,
        companyName: null,
        vatId: null,
        phone,
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

  return {
    data: {
      accountType: ClientAccountType.BUSINESS,
      firstName: null,
      lastName: null,
      companyName,
      vatId,
      phone,
    },
  };
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

  const { accountType, firstName, lastName, companyName, vatId, phone } =
    parsed.data;

  const clientProfile = await prisma.clientProfile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      accountType,
      firstName,
      lastName,
      companyName,
      vatId,
      phone,
    },
    update: { accountType, firstName, lastName, companyName, vatId, phone },
  });

  return NextResponse.json(clientProfile, { status: 201 });
}
