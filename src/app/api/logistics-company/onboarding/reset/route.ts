import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FLEET_FIRST_STEP } from "@/lib/fleet-onboarding/draft-schema";

/**
 * POST /api/logistics-company/onboarding/reset — "Start a new application".
 *
 * Clears the in-progress draft, putting the company back at step 1 with the same
 * `BusinessApplication` row (and therefore the same reference). Only a DRAFT
 * application can be reset: a submitted one has been seen by a reviewer, and
 * this design has no "rejected, start over" state — a flagged application is
 * corrected and resubmitted in place. See `requirements.md`'s Assumptions.
 *
 * Three things reset deliberately does *not* touch, because it is surprising and
 * someone will ask:
 *
 * - **Driver accounts created in step 4 are not deleted.** They are real `User` +
 *   `DriverProfile` + `DriverLicence` rows on the company's roster, created
 *   before submit precisely so category gating has something to check. Resetting
 *   the draft drops the *intent* to put them behind a vehicle; the accounts stay,
 *   and the company can pick them again from the roster.
 * - **No `Vehicle` rows exist yet to clean up.** Nothing writes to `Vehicle`
 *   before a successful submit — `plateNumber` is globally unique and an
 *   abandoned draft must never permanently claim a real plate.
 * - **No documents.** Company vehicle document upload is an explicit non-goal in
 *   v1, so there is no storage cleanup here, unlike the driver flow's reset.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies have a fleet application." },
      { status: 403 },
    );
  }

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { application: { select: { id: true, status: true } } },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Complete your company profile before onboarding." },
      { status: 404 },
    );
  }

  const { application } = company;
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

  await prisma.businessApplication.update({
    where: { id: application.id },
    data: {
      // `Prisma.DbNull`, never `null` and never `{ version: 1 }`. On a nullable
      // Json column `DbNull` writes a SQL NULL while `Prisma.JsonNull` writes the
      // JSON `null` literal — two different stored values, and only the SQL NULL
      // makes `parseFleetDraft` see an absent draft. An empty `{ version: 1 }`
      // would be worse still: `parseFleetDraft` would accept it, the wizard would
      // resume into a draft that exists but holds nothing, and the resume banner
      // would offer to continue an application that was just thrown away. This is
      // the same write the lazy `GET` uses when it creates the row.
      draft: Prisma.DbNull,
      draftStep: FLEET_FIRST_STEP,
      draftUpdatedAt: null,
    },
  });

  return new NextResponse(null, { status: 204 });
}
