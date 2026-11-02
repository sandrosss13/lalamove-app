import { NextResponse } from "next/server";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import {
  CARD_DETAILS_REJECTED_KEY,
  containsCardDetails,
  parseCardMetadata,
  type CardMetadataInput,
} from "@/lib/payments/card-metadata";
import { prisma } from "@/lib/prisma";

import { CARD_SELECT } from "./card-select";

/** Validated shape of a saved-card creation request body. */
type CreateSavedCardInput = CardMetadataInput & {
  /** Whether the caller explicitly asked for this card to become the default. */
  isDefault: boolean;
};

/**
 * Hand-rolled body validation (the project has no validation library, and this
 * stage does not warrant adding one). The card's display metadata is checked by
 * `parseCardMetadata` (`src/lib/payments/card-metadata.ts`), shared with the
 * one-off guest card at checkout; only `isDefault` is this route's own.
 *
 * Every field is read by name — the body is never spread into the write — so
 * only these six values can ever reach the database.
 */
function parseCreateSavedCardBody(
  body: unknown,
  t: RequestTranslator,
): { data: CreateSavedCardInput } | { error: string } {
  const metadata = parseCardMetadata(body, t);
  if ("error" in metadata) {
    return metadata;
  }

  const { isDefault } = body as Record<string, unknown>;
  if (isDefault !== undefined && typeof isDefault !== "boolean") {
    return { error: t("errors.savedCards.isdefaultMustBeTrueOrFalse") };
  }

  return { data: { ...metadata.data, isDefault: isDefault === true } };
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
      { error: t("errors.savedCards.onlyClientsHaveSavedCards") },
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
      { error: t("errors.savedCards.onlyClientsCanSaveACard") },
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

  // Runs before validation, and before anything is logged, so a body carrying
  // cardholder data is rejected without any part of it being echoed or stored.
  if (containsCardDetails(rawBody)) {
    return NextResponse.json(
      { error: t(CARD_DETAILS_REJECTED_KEY) },
      { status: 400 },
    );
  }

  const parsed = parseCreateSavedCardBody(rawBody, t);
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
