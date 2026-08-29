import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may review business fleet applications. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/** Body this endpoint answers with, so the review drawer can update in place. */
export type AdminBusinessRequestChangesResponse = {
  status: "ACTION_REQUIRED";
  /** So the drawer can label its button "Request changes (n)" consistently. */
  flaggedVehicleCount: number;
  companyFlagged: boolean;
};

/**
 * POST /api/admin/business-applications/[id]/request-changes — hand the
 * application back to the company with the flagged company details and the
 * flagged vehicles attached.
 *
 * Takes no request body: what needs fixing is already recorded on the company
 * row and the vehicle rows, written through the sibling `company` and
 * `vehicles/[vehicleId]` endpoints, and this is only the "send it back" half of
 * that decision.
 *
 * `status` and nothing else changes. Approved vehicles keep their verdict
 * across the round trip, and the company's resubmit path is what clears the
 * flagged ones back to `PENDING` and returns the application to `PENDING`.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { id } = await params;

  const application = await prisma.businessApplication.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      companyId: true,
      companyReviewStatus: true,
      vehicles: { select: { status: true } },
    },
  });

  // A `DRAFT` application is indistinguishable from a non-existent one at this
  // endpoint: it was never submitted, so it is not in the review queue and
  // there is nothing here for a reviewer to have opened. Answering identically
  // also stops the response confirming that some id is a real company's
  // in-progress draft.
  if (!application || application.status === "DRAFT") {
    return NextResponse.json(
      { error: "Application not found." },
      { status: 404 },
    );
  }

  // `APPROVED` is terminal for this feature: an activated fleet is already
  // dispatching and cannot be pulled back here.
  if (application.status === "APPROVED") {
    return NextResponse.json(
      { error: "This fleet has already been activated." },
      { status: 400 },
    );
  }

  // Already sent back, and the company has not resubmitted yet. Well-formed and
  // allowed, but meaningless in this state — a 409, not a 400.
  if (application.status === "ACTION_REQUIRED") {
    return NextResponse.json(
      { error: "Changes have already been requested on this application." },
      { status: 409 },
    );
  }

  const flaggedVehicleCount = application.vehicles.filter(
    (vehicle) => vehicle.status === "FLAGGED",
  ).length;
  const hasSomethingToFix =
    application.companyReviewStatus === "FLAGGED" || flaggedVehicleCount > 0;

  // With nothing flagged the company would land on an "Action required" screen
  // listing nothing to fix, and its Resubmit button — which unlocks only once
  // every flag has been cleared — would have nothing to wait for. Refuse rather
  // than produce that dead end, exactly as the driver flow does.
  if (!hasSomethingToFix) {
    return NextResponse.json(
      {
        error:
          "Flag the company's details or at least one vehicle before requesting changes.",
      },
      { status: 409 },
    );
  }

  await prisma.businessApplication.update({
    where: { id },
    // `status` and nothing else — see this route's doc comment for why the
    // vehicle verdicts in particular must survive the round trip untouched.
    data: { status: "ACTION_REQUIRED" },
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "business_application.request_changes",
    entityType: "BusinessApplication",
    entityId: id,
    // The reasons themselves live on the company row and the vehicle rows;
    // recording what was flagged at the moment of sending it back is what makes
    // this row readable on its own.
    metadata: {
      companyId: application.companyId,
      companyReviewStatus: application.companyReviewStatus,
      flaggedVehicleCount,
    },
  });

  const body: AdminBusinessRequestChangesResponse = {
    status: "ACTION_REQUIRED",
    flaggedVehicleCount,
    companyFlagged: application.companyReviewStatus === "FLAGGED",
  };

  return NextResponse.json(body, { status: 200 });
}
