import { NextResponse } from "next/server";
import {
  ClientAccountType,
  ClientGender,
  MarketingConsentSource,
  Prisma,
} from "@prisma/client";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import {
  LEGAL_ADDRESS_MAX_LENGTH,
  parseLegalAddress,
} from "@/lib/client-profile/legal-address";
import {
  parseMarketingConsent,
  shouldRecordMarketingConsent,
} from "@/lib/client-profile/marketing-consent";
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
  /**
   * BUSINESS only. `undefined` means "the request did not mention it", which
   * Prisma reads as "leave the column alone" on the upsert's update branch —
   * so a caller that predates the field cannot wipe an address it never
   * showed. `null` clears it; INDIVIDUAL accounts always get `null`.
   */
  legalAddress: string | null | undefined;
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
  t: RequestTranslator,
): { value: Date | null } | { error: string } {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }

  if (typeof value !== "string") {
    return { error: t("errors.clientProfile.dateofbirthMustBeAnIsoDate") };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: t("errors.clientProfile.dateofbirthMustBeAValidDate") };
  }

  if (parsed.getTime() > Date.now()) {
    return { error: t("errors.clientProfile.dateofbirthCannotBeInTheFuture") };
  }

  return { value: parsed };
}

/**
 * Parses an optional gender value. Returns `{ value: null }` when absent, a
 * valid `ClientGender` when present and recognised, or `{ error }` otherwise.
 */
function parseOptionalGender(
  value: unknown,
  t: RequestTranslator,
): { value: ClientGender | null } | { error: string } {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }

  if (
    typeof value !== "string" ||
    !CLIENT_GENDERS.includes(value as ClientGender)
  ) {
    return {
      error: t("errors.clientProfile.genderMustBeOneOf", {
        allowed: CLIENT_GENDERS.join(", "),
      }),
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
 * phone; the personal name fields are stored as null. A BUSINESS account may
 * also send an optional `legalAddress` (trimmed, blank → null, at most
 * `LEGAL_ADDRESS_MAX_LENGTH` characters — see `parseLegalAddress`); it is
 * ignored and cleared for INDIVIDUAL accounts.
 */
function parseCreateClientProfileBody(
  body: unknown,
  t: RequestTranslator,
): { data: CreateClientProfileInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const record = body as Record<string, unknown>;
  const { accountType } = record;

  if (
    typeof accountType !== "string" ||
    !CLIENT_ACCOUNT_TYPES.includes(accountType as ClientAccountType)
  ) {
    return {
      error: t("errors.clientProfile.accountTypeMustBeOneOf", {
        allowed: CLIENT_ACCOUNT_TYPES.join(", "),
      }),
    };
  }

  const phone = nonEmptyString(record.phone);
  if (phone === null) {
    return { error: t("common.shared.phoneIsRequiredAndMustBe") };
  }

  if (accountType === ClientAccountType.INDIVIDUAL) {
    const firstName = nonEmptyString(record.firstName);
    if (firstName === null) {
      return {
        error: t("common.shared.firstnameIsRequiredAndMustBe"),
      };
    }

    const lastName = nonEmptyString(record.lastName);
    if (lastName === null) {
      return { error: t("common.shared.lastnameIsRequiredAndMustBe") };
    }

    // Verification details are optional here — a client can save their basic
    // profile at sign-up and complete these later on the profile page.
    const dateOfBirth = parseOptionalDateOfBirth(record.dateOfBirth, t);
    if ("error" in dateOfBirth) {
      return { error: dateOfBirth.error };
    }

    const gender = parseOptionalGender(record.gender, t);
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
        // A legal address is a company's registered address; an individual
        // has none, so it is cleared even if the request sends one.
        legalAddress: null,
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
      error: t("common.shared.companynameIsRequiredAndMustBe"),
    };
  }

  const vatId = nonEmptyString(record.vatId);
  if (vatId === null) {
    return { error: t("common.shared.vatidIsRequiredAndMustBe") };
  }

  // Optional. Only parsed when the key is present: an absent key leaves the
  // stored address untouched (see `CreateClientProfileInput.legalAddress`),
  // while a present-but-blank one clears it.
  let legalAddress: string | null | undefined;
  if ("legalAddress" in record) {
    const parsedLegalAddress = parseLegalAddress(record.legalAddress);
    if ("error" in parsedLegalAddress) {
      return {
        error:
          parsedLegalAddress.error === "tooLong"
            ? t("errors.clientProfile.legalAddressIsTooLong", {
                max: LEGAL_ADDRESS_MAX_LENGTH,
              })
            : t("errors.clientProfile.legalAddressMustBeText"),
      };
    }
    legalAddress = parsedLegalAddress.legalAddress;
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
      legalAddress,
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
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  if (session.user.role !== "CLIENT") {
    return NextResponse.json(
      { error: t("errors.clientProfile.onlyClientsHaveAClientProfile") },
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
 *
 * An optional boolean `marketingConsent` is the sign-up form's marketing-offers
 * switch. Only that form sends it, so it is recorded with source `SIGN_UP` —
 * on the profile and as a `MarketingConsentEvent` — when the profile is
 * created, or on a re-submit that changes it. Absent, the stored answer is left
 * alone (the `/account` and driver-hub profile forms never send it; the
 * `/account` card has its own route, `./marketing-consent`).
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

  if (session.user.role !== "CLIENT") {
    return NextResponse.json(
      { error: t("errors.clientProfile.onlyClientsCanCreateAClient") },
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

  const parsed = parseCreateClientProfileBody(rawBody, t);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Validated apart from the profile fields: it applies to either account type.
  const consent = parseMarketingConsent(
    (rawBody as Record<string, unknown>).marketingConsent,
  );
  if ("error" in consent) {
    return NextResponse.json(
      { error: t("errors.clientProfile.marketingConsentMustBeABoolean") },
      { status: 400 },
    );
  }
  const { marketingConsent } = consent;

  const {
    accountType,
    firstName,
    lastName,
    companyName,
    vatId,
    legalAddress,
    phone,
    dateOfBirth,
    gender,
    idNumber,
  } = parsed.data;

  const userId = session.user.id;

  let clientProfile;
  try {
    // One transaction so the profile's answer and its audit event can never
    // disagree: either both are written or neither is.
    clientProfile = await prisma.$transaction(async (tx) => {
      // Empty unless the answer is being recorded, so spreading it into the
      // upsert leaves both columns alone otherwise.
      let consentData: {
        marketingConsent?: boolean;
        marketingConsentAt?: Date;
      } = {};
      if (marketingConsent !== undefined) {
        const existing = await tx.clientProfile.findUnique({
          where: { userId },
          select: { marketingConsent: true },
        });

        if (
          shouldRecordMarketingConsent(
            existing?.marketingConsent ?? null,
            marketingConsent,
          )
        ) {
          const now = new Date();
          consentData = { marketingConsent, marketingConsentAt: now };
          await tx.marketingConsentEvent.create({
            data: {
              userId,
              granted: marketingConsent,
              source: MarketingConsentSource.SIGN_UP,
              createdAt: now,
            },
          });
        }
      }

      return tx.clientProfile.upsert({
        where: { userId },
        create: {
          userId,
          accountType,
          firstName,
          lastName,
          companyName,
          vatId,
          legalAddress,
          phone,
          dateOfBirth,
          gender,
          idNumber,
          ...consentData,
        },
        update: {
          accountType,
          firstName,
          lastName,
          companyName,
          vatId,
          legalAddress,
          phone,
          dateOfBirth,
          gender,
          idNumber,
          ...consentData,
        },
      });
    });
  } catch (error) {
    // `ClientProfile.phone` is unique — one account per client. Anything else
    // is unexpected and rethrown rather than swallowed.
    if (isDuplicatePhoneError(error)) {
      return NextResponse.json(
        {
          error: t("common.shared.thisPhoneNumberIsAlreadyRegistered"),
        },
        { status: 409 },
      );
    }

    throw error;
  }

  return NextResponse.json(clientProfile, { status: 201 });
}
