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
export type AdminBusinessActivateResponse = {
  status: "APPROVED";
  /** ISO timestamp written to `LogisticsCompany.activatedAt`. */
  activatedAt: string;
  approvedVehicleCount: number;
  flaggedVehicleCount: number;
};

/**
 * POST /api/admin/business-applications/[id]/activate — approve the application
 * and let the fleet start dispatching.
 *
 * Takes no request body: the company verdict and the per-vehicle verdicts this
 * depends on are already on their rows, written through the sibling `company`
 * and `vehicles/[vehicleId]` endpoints, and this is only the "let them
 * dispatch" half of that decision.
 *
 * Setting `LogisticsCompany.activatedAt` is what actually unblocks the company —
 * it is the field the dispatch route checks server-side — so it and the
 * application's own status are written in one transaction. Splitting them would
 * leave a window where the application reads as approved while the company is
 * still gated (or, worse the other way round, an activated company with an
 * unapproved application).
 *
 * Flagged vehicles are deliberately **not** cleared: a fleet can go live with
 * six approved vehicles and one permanently flagged one, and the per-vehicle
 * dispatch gate is what keeps that seventh vehicle off the road.
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

  // `APPROVED` is terminal for this feature. Refused rather than treated as a
  // no-op so a double-click cannot push `activatedAt` forward and rewrite when
  // the fleet was actually activated.
  if (application.status === "APPROVED") {
    return NextResponse.json(
      { error: "This fleet has already been activated." },
      { status: 400 },
    );
  }

  // `PENDING` is the only status that can be activated. That leaves
  // `ACTION_REQUIRED`, which is refused rather than activated because the
  // company's resubmit path is the *only* place the fleet is re-validated
  // server-side (plate uniqueness, licence expiry, category coverage).
  // Correcting a flagged vehicle is an edit, not a resubmission, so activating
  // straight out of `ACTION_REQUIRED` would put a fleet on the road whose
  // licences may have expired during a round trip that can span days.
  if (application.status !== "PENDING") {
    return NextResponse.json(
      {
        error: "This application is still waiting on the company to resubmit.",
      },
      { status: 409 },
    );
  }

  if (application.companyReviewStatus !== "VERIFIED") {
    return NextResponse.json(
      { error: "Verify the company's details before activating the fleet." },
      { status: 409 },
    );
  }

  const pendingCount = application.vehicles.filter(
    (vehicle) => vehicle.status === "PENDING",
  ).length;

  // Every vehicle must carry a verdict: a vehicle left `PENDING` was never
  // looked at, and activation means a reviewer worked through the whole fleet.
  if (pendingCount > 0) {
    return NextResponse.json(
      {
        error: `${pendingCount} vehicle${pendingCount === 1 ? " is" : "s are"} still pending review. Decide every vehicle before activating the fleet.`,
      },
      { status: 409 },
    );
  }

  const approvedVehicleCount = application.vehicles.filter(
    (vehicle) => vehicle.status === "APPROVED",
  ).length;
  const flaggedVehicleCount = application.vehicles.filter(
    (vehicle) => vehicle.status === "FLAGGED",
  ).length;

  // Activating with every vehicle flagged would mark the application `APPROVED`
  // and stamp `activatedAt` on a company that still has nothing dispatchable —
  // exactly the state the status screen's copy promises cannot happen.
  if (approvedVehicleCount === 0) {
    return NextResponse.json(
      {
        error:
          "At least one vehicle must be approved before activating the fleet.",
      },
      { status: 409 },
    );
  }

  // One timestamp, read back into the response rather than re-derived, so the
  // drawer renders the instant that was actually stored.
  const activatedAt = new Date();

  await prisma.$transaction(async (tx) => {
    // Nothing inside this callback catches: a failed statement leaves the
    // Postgres transaction block aborted, so swallowing an error here would let
    // the commit silently degrade into a rollback and report success.
    await tx.businessApplication.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    await tx.logisticsCompany.update({
      where: { id: application.companyId },
      data: { activatedAt },
    });
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "business_application.activate",
    entityType: "BusinessApplication",
    entityId: id,
    // The company id is what ties this row to the activation it caused — the
    // `LogisticsCompany` write has no audit row of its own.
    metadata: {
      companyId: application.companyId,
      approvedVehicleCount,
      flaggedVehicleCount,
    },
  });

  const body: AdminBusinessActivateResponse = {
    status: "APPROVED",
    activatedAt: activatedAt.toISOString(),
    approvedVehicleCount,
    flaggedVehicleCount,
  };

  return NextResponse.json(body, { status: 200 });
}
