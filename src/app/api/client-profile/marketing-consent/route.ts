import { NextResponse } from "next/server";
import { MarketingConsentSource } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import {
  parseMarketingConsent,
  shouldRecordMarketingConsent,
} from "@/lib/client-profile/marketing-consent";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/client-profile/marketing-consent — the `/account` card's Agree /
 * Disagree change. Body: `{ marketingConsent: boolean }`, required.
 *
 * A route of its own rather than a field on `POST /api/client-profile`: that
 * one takes the whole profile, and changing a yes/no answer should not have to
 * resend (and re-validate) a name, phone and VAT id the card never shows.
 *
 * A change writes the new answer on `ClientProfile` and appends a
 * `MarketingConsentEvent` (source `ACCOUNT`) in one transaction. Re-sending the
 * current answer is a no-op success, so the audit trail holds only real
 * changes. Answers 404 when the client has no profile yet — there is nothing
 * to hang the answer on, and creating a profile is sign-up's job.
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
      { error: t("errors.clientProfile.onlyClientsHaveAClientProfile") },
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

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeAJson") },
      { status: 400 },
    );
  }

  // Required here, unlike on the profile route: answering is the whole request.
  const parsed = parseMarketingConsent(
    (rawBody as Record<string, unknown>).marketingConsent,
  );
  if ("error" in parsed || parsed.marketingConsent === undefined) {
    return NextResponse.json(
      { error: t("errors.clientProfile.marketingConsentMustBeABoolean") },
      { status: 400 },
    );
  }
  const marketingConsent = parsed.marketingConsent;
  const userId = session.user.id;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.clientProfile.findUnique({
      where: { userId },
      select: { marketingConsent: true, marketingConsentAt: true },
    });
    if (!existing) {
      return null;
    }

    if (
      !shouldRecordMarketingConsent(existing.marketingConsent, marketingConsent)
    ) {
      return existing;
    }

    const now = new Date();
    await tx.marketingConsentEvent.create({
      data: {
        userId,
        granted: marketingConsent,
        source: MarketingConsentSource.ACCOUNT,
        createdAt: now,
      },
    });

    return tx.clientProfile.update({
      where: { userId },
      data: { marketingConsent, marketingConsentAt: now },
      select: { marketingConsent: true, marketingConsentAt: true },
    });
  });

  if (!result) {
    return NextResponse.json(
      { error: t("errors.clientProfile.clientProfileNotFound") },
      { status: 404 },
    );
  }

  return NextResponse.json(result, { status: 200 });
}
