import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteDriverDocuments } from "@/lib/driver-document-storage";
import { ONBOARDING_FIRST_STEP } from "@/lib/driver-onboarding/draft-schema";

/**
 * POST /api/driver-profile/onboarding/reset — "Start a new application".
 *
 * Clears the in-progress draft and retires every document uploaded against it,
 * putting the driver back at step 1 with the same `DriverApplication` row (and
 * therefore the same reference). Only a DRAFT application can be reset: a
 * submitted one has been seen by a reviewer, and this design has no
 * "rejected, start over" state — a flagged application is corrected and
 * resubmitted in place. See `requirements.md`'s Assumptions.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers have an onboarding application." },
      { status: 403 },
    );
  }

  const profile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { application: { select: { id: true, status: true } } },
  });

  if (!profile) {
    return NextResponse.json(
      { error: "Complete your driver profile before onboarding." },
      { status: 404 },
    );
  }

  const { application } = profile;
  if (!application) {
    return NextResponse.json(
      { error: "No application to reset." },
      { status: 404 },
    );
  }

  if (application.status !== "DRAFT") {
    return NextResponse.json(
      { error: "A submitted application cannot be reset." },
      { status: 400 },
    );
  }

  // Read and write in one transaction so a document uploaded between the read
  // and the supersede can't be left live against a cleared draft.
  const supersededPaths = await prisma.$transaction(async (tx) => {
    const liveDocuments = await tx.driverApplicationDocument.findMany({
      where: { driverApplicationId: application.id, supersededAt: null },
      select: { id: true, storagePath: true },
    });

    await tx.driverApplication.update({
      where: { id: application.id },
      data: {
        // `Prisma.DbNull` writes a SQL NULL; a bare `null` is not accepted on a
        // nullable Json column, and `Prisma.JsonNull` would store the JSON
        // `null` literal, which reads back as a present-but-unparseable draft.
        draft: Prisma.DbNull,
        draftStep: ONBOARDING_FIRST_STEP,
        draftUpdatedAt: null,
      },
    });

    if (liveDocuments.length > 0) {
      // Superseded, never hard-deleted: the row history is what lets an admin
      // still see an earlier rejection reason after a retake (see the
      // `DriverApplicationDocument` model's doc comment).
      await tx.driverApplicationDocument.updateMany({
        where: { id: { in: liveDocuments.map((document) => document.id) } },
        data: { supersededAt: new Date() },
      });
    }

    return liveDocuments.map((document) => document.storagePath);
  });

  // Best-effort storage cleanup, after the transaction has committed. The
  // database row is the source of truth, so an object left behind is a tidiness
  // problem rather than a correctness one — the same reasoning already
  // documented in `supabase-storage.ts` — and must not fail a reset that has
  // already succeeded.
  await deleteDriverDocuments(supersededPaths).catch((error: unknown) => {
    console.error(
      "Failed to delete reset onboarding documents from Storage:",
      error,
    );
  });

  return new NextResponse(null, { status: 204 });
}
