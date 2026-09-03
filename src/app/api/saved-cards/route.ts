import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { CARD_SELECT } from "./card-select";

/** Longest accepted card brand — "Mastercard" and friends are far shorter. */
const MAX_BRAND_LENGTH = 32;

/** Longest accepted cardholder name, matching what an embossed card holds. */
const MAX_HOLDER_NAME_LENGTH = 120;

/**
 * Body keys that would carry a full card number or a security code, normalised
 * to lower case with separators stripped so `card_number`, `card-number` and
 * `cardNumber` all collapse onto the same entry.
 */
const FORBIDDEN_CARD_KEYS = new Set([
  "number",
  "cardnumber",
  "pan",
  "cvc",
  "cvv",
  "securitycode",
]);

/**
 * A run of digits long enough to be a card number, in any script. The shortest
 * PAN in issue is twelve digits (Maestro), so twelve is the threshold: no
 * legitimate field on this route — a four-digit ending, a two-digit month, a
 * four-digit year — comes anywhere near it.
 *
 * `\p{Nd}` rather than `[0-9]` because a PAN keyed on an Arabic-Indic or
 * fullwidth keypad is still a PAN, and an ASCII-only class would wave it past.
 */
const PAN_LIKE_DIGITS = /\p{Nd}{12,}/u;

/**
 * The single message every tripwire rejection answers with. It names the rule
 * rather than the field, because the fix is always the same: derive the brand
 * and the last four in the browser and send only those.
 */
const CARD_DETAILS_REJECTED = "Card details must not be sent to the server.";

/** Normalises a body key for comparison against `FORBIDDEN_CARD_KEYS`. */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when a string could be carrying a card number. Every non-digit is
 * stripped before the run test, rather than a named few, so a PAN typed as
 * "4111 1111 1111 1111", "4111-1111-1111-1111" or "4111.1111.1111.1111" is
 * caught as readily as an unbroken one — the separator a caller reaches for is
 * not something this tripwire can afford to enumerate.
 */
function looksLikeCardNumber(value: string): boolean {
  const digits = value.replace(/[^\p{Nd}]/gu, "");

  return PAN_LIKE_DIGITS.test(digits);
}

/**
 * Walks a decoded JSON body looking for anything resembling a full card number
 * or a security code — a forbidden key at any depth, or a long digit run in any
 * string or number.
 *
 * This is a tripwire, not a validator. No gateway exists, so a PAN reaching
 * this server would be a PAN nobody meant to accept and nobody can protect. A
 * caller that forgets the rule should fail loudly on its first request rather
 * than quietly persist cardholder data, so the whole request is refused instead
 * of the offending field being dropped.
 */
function containsCardDetails(value: unknown): boolean {
  if (typeof value === "string") {
    return looksLikeCardNumber(value);
  }

  // A PAN sent as a JSON number loses precision but is still a PAN, so numbers
  // are checked through the same digit-run test.
  if (typeof value === "number") {
    return looksLikeCardNumber(String(value));
  }

  if (Array.isArray(value)) {
    return value.some(containsCardDetails);
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, entry]) =>
        FORBIDDEN_CARD_KEYS.has(normaliseKey(key)) ||
        containsCardDetails(entry),
    );
  }

  return false;
}

/** Validated shape of a saved-card creation request body. */
type CreateSavedCardInput = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName: string | null;
  /** Whether the caller explicitly asked for this card to become the default. */
  isDefault: boolean;
};

/** True for a whole number safely representable as a JavaScript integer. */
function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * True when an expiry has already passed. A card is valid to the last day of
 * its expiry month, so the comparison is month-granular rather than day-exact.
 */
function hasExpired(expMonth: number, expYear: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  // `getMonth()` is zero-based; the stored month is one-based.
  const currentMonth = now.getMonth() + 1;

  return (
    expYear < currentYear ||
    (expYear === currentYear && expMonth < currentMonth)
  );
}

/**
 * Hand-rolled body validation (the project has no validation library, and this
 * stage does not warrant adding one). Returns the typed input or an error
 * message describing the first problem encountered.
 *
 * Every field is read by name — the body is never spread into the write — so
 * only these six values can ever reach the database.
 */
function parseCreateSavedCardBody(
  body: unknown,
): { data: CreateSavedCardInput } | { error: string } {
  // A JSON body of `null`, `[]` or a scalar has no fields to read.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const fields = body as Record<string, unknown>;

  const brand = typeof fields.brand === "string" ? fields.brand.trim() : "";
  if (brand === "") {
    return { error: "Enter the card brand." };
  }

  if (brand.length > MAX_BRAND_LENGTH) {
    return {
      error: `Enter a card brand of ${MAX_BRAND_LENGTH} characters or fewer.`,
    };
  }

  const last4 = typeof fields.last4 === "string" ? fields.last4.trim() : "";
  if (!/^[0-9]{4}$/.test(last4)) {
    return { error: "Enter a four-digit card ending." };
  }

  const { expMonth, expYear } = fields;

  if (!isInteger(expMonth) || expMonth < 1 || expMonth > 12) {
    return { error: "Enter an expiry month between 1 and 12." };
  }

  if (!isInteger(expYear) || expYear < 1000 || expYear > 9999) {
    return { error: "Enter a four-digit expiry year." };
  }

  if (hasExpired(expMonth, expYear)) {
    return { error: "That card has expired. Add a card that is still valid." };
  }

  const { holderName } = fields;
  if (
    holderName !== undefined &&
    holderName !== null &&
    typeof holderName !== "string"
  ) {
    return { error: "Enter the cardholder name as it appears on the card." };
  }

  const trimmedHolderName =
    typeof holderName === "string" ? holderName.trim() : "";
  if (trimmedHolderName.length > MAX_HOLDER_NAME_LENGTH) {
    return {
      error: `Enter a cardholder name of ${MAX_HOLDER_NAME_LENGTH} characters or fewer.`,
    };
  }

  const { isDefault } = fields;
  if (isDefault !== undefined && typeof isDefault !== "boolean") {
    return { error: "isDefault must be true or false when provided." };
  }

  return {
    data: {
      brand,
      last4,
      expMonth,
      expYear,
      holderName: trimmedHolderName === "" ? null : trimmedHolderName,
      isDefault: isDefault === true,
    },
  };
}

/**
 * GET /api/saved-cards — the signed-in client's saved cards, default first and
 * then newest first, which is the order both the wallet page and the booking
 * form's payment step present them in.
 *
 * Scope is the session's own account. There is no client id in the query string
 * and there must never be one: the `clientId` clause is the tenancy boundary,
 * and a caller-supplied id would turn this route into a way to read another
 * client's payment methods.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "CLIENT") {
    return NextResponse.json(
      { error: "Only clients have saved cards." },
      { status: 403 },
    );
  }

  const cards = await prisma.savedCard.findMany({
    where: { clientId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: CARD_SELECT,
  });

  return NextResponse.json({ cards }, { status: 200 });
}

/**
 * POST /api/saved-cards — save a card's display details for the signed-in
 * client.
 *
 * **No payment gateway exists and none has been chosen.** This route stores
 * display metadata only — brand, last four digits, expiry and holder name. The
 * card number and security code are entered in the browser, used there to
 * derive the brand and the last four, and discarded; they never reach this
 * server. `providerToken` stays null until a provider is wired in, and is
 * neither written here nor read back anywhere.
 *
 * A body that carries anything PAN- or CVC-shaped is refused outright rather
 * than sanitised — see `containsCardDetails`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "CLIENT") {
    return NextResponse.json(
      { error: "Only clients can save a card." },
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

  // Runs before validation, and before anything is logged, so a body carrying
  // cardholder data is rejected without any part of it being echoed or stored.
  if (containsCardDetails(rawBody)) {
    return NextResponse.json({ error: CARD_DETAILS_REJECTED }, { status: 400 });
  }

  const parsed = parseCreateSavedCardBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { brand, last4, expMonth, expYear, holderName, isDefault } =
    parsed.data;
  const clientId = session.user.id;

  // One transaction so a client can never be left with two defaults, or with a
  // first card that is not their default because the demotion failed.
  const card = await prisma.$transaction(async (tx) => {
    const existingCount = await tx.savedCard.count({ where: { clientId } });

    // A client's first card is their default whether they asked for it or not:
    // a wallet with cards and no default has nothing to pre-select.
    const makeDefault = isDefault || existingCount === 0;

    if (makeDefault) {
      await tx.savedCard.updateMany({
        where: { clientId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.savedCard.create({
      data: {
        clientId,
        brand,
        last4,
        expMonth,
        expYear,
        holderName,
        isDefault: makeDefault,
      },
      select: CARD_SELECT,
    });
  });

  return NextResponse.json({ card }, { status: 201 });
}
