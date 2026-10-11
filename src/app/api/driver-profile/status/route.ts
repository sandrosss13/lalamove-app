import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { runMatchingWithinBudget } from "@/lib/background/request-budget";
import { dispatchOfferForDriver } from "@/lib/offers/dispatch";
import { passwordChangeRefusal } from "@/lib/orders/action-errors";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/driver-profile/status — flip the signed-in driver's availability.
 *
 * Only DRIVER users may call this, and only once a driver profile exists:
 * `isOnline` lives on `DriverProfile`, so there is nothing to toggle before the
 * profile is created. The missing-profile case is an explicit 404 rather than an
 * upsert, because going online must not silently create a half-filled profile
 * (city, phone and account type are all required fields).
 *
 * Going online additionally requires an activated account (`activatedAt` set);
 * going offline never does.
 *
 * Going online is also when a load that has been waiting on the board can
 * reach this driver as a pushed offer — see the call at the bottom.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const t = await getRequestTranslations();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  // Before the role test, as everywhere — see `passwordChangeRefusal`.
  const passwordRefusal = passwordChangeRefusal(session.user, t);
  if (passwordRefusal) {
    return passwordRefusal;
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      {
        error: t("errors.driverProfileStatus.onlyDriversCanUpdateOnlineStatus"),
      },
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

  // Hand-rolled validation, consistent with the rest of the API (the project
  // deliberately uses no validation library).
  const isOnline =
    typeof rawBody === "object" && rawBody !== null
      ? (rawBody as Record<string, unknown>).isOnline
      : undefined;

  if (typeof isOnline !== "boolean") {
    return NextResponse.json(
      { error: t("errors.driverProfileStatus.isonlineMustBeABoolean") },
      { status: 400 },
    );
  }

  // Check existence first so a missing profile is a clear 404 instead of the
  // "record to update not found" error the update would otherwise throw.
  // `activatedAt` rides along on the same read rather than a second query,
  // since the activation gate below needs nothing else from the profile.
  const existing = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, activatedAt: true },
  });
  if (!existing) {
    return NextResponse.json(
      {
        error: t(
          "errors.driverProfileStatus.completeYourDriverProfileBeforeGoing",
        ),
      },
      { status: 404 },
    );
  }

  // Only going *online* is gated. Going offline is always allowed regardless of
  // activation state, so a driver can never get stuck unable to take themselves
  // offline (e.g. if their account is deactivated while they are online).
  if (isOnline && existing.activatedAt === null) {
    return NextResponse.json(
      {
        error: t("errors.driverProfileStatus.yourAccountIsnTApprovedYet"),
      },
      { status: 403 },
    );
  }

  const updated = await prisma.driverProfile.update({
    where: { userId: session.user.id },
    data: { isOnline },
  });

  // A driver who has just come online is offered the best load already
  // waiting, rather than only loads booked from now on. Never throws: the
  // status change above has been made and is what this request reports.
  //
  // Waited for only within the matching budget — normally it finishes well
  // inside it, so the offer exists by the time the app reads its offers; if it
  // is slow, the toggle answers anyway and the offer is made after the
  // response. See `runMatchingWithinBudget`.
  if (updated.isOnline) {
    const userId = session.user.id;

    await runMatchingWithinBudget(() => dispatchOfferForDriver(userId));
  }

  return NextResponse.json({ isOnline: updated.isOnline }, { status: 200 });
}
