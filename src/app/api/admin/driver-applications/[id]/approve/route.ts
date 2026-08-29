import { NextResponse } from "next/server";

import { DriverApplicationDocumentType, type AdminRole } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may review driver onboarding applications. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/**
 * Every document an application must carry an approval for. Restated here
 * rather than imported from the driver-facing submit route: a `route.ts` is a
 * Next.js entry point, and importing runtime values across two of them would
 * tie their build-time contracts together.
 */
const REQUIRED_DOCUMENT_TYPES: readonly DriverApplicationDocumentType[] = [
  DriverApplicationDocumentType.PROFILE_PHOTO,
  DriverApplicationDocumentType.LICENCE_FRONT,
  DriverApplicationDocumentType.LICENCE_BACK,
];

/** Body this endpoint answers with, so the review drawer can update in place. */
export type AdminApproveApplicationResponse = {
  status: "APPROVED";
};

/**
 * POST /api/admin/driver-applications/[id]/approve — approve the driver and
 * activate their account.
 *
 * Takes no request body: the per-document verdicts this depends on are already
 * on the document rows, written through the sibling `documents/[docId]`
 * endpoint, and this is only the "let them drive" half of that decision.
 *
 * Setting `DriverProfile.activatedAt` is what actually unblocks the driver —
 * it is the field the online toggle, the open-orders list and the accept
 * endpoint all check server-side — so it and the application's own status are
 * written in one transaction. Splitting them would leave a window where an
 * application reads as approved while the driver is still gated (or, worse the
 * other way round, an activated driver with an unapproved application).
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

  // Live documents only: a superseded row is history, and an approval that was
  // given to a photo the driver has since replaced must not count for the one
  // standing in its place.
  const application = await prisma.driverApplication.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      driverProfileId: true,
      vehicleId: true,
      documents: {
        where: { supersededAt: null },
        select: { type: true, status: true },
      },
    },
  });

  // A `DRAFT` application is indistinguishable from a non-existent one at this
  // endpoint: it was never submitted, so it is not in the review queue and
  // there is nothing here for a reviewer to have opened.
  if (!application || application.status === "DRAFT") {
    return NextResponse.json(
      { error: "Application not found." },
      { status: 404 },
    );
  }

  // `APPROVED` is terminal for this feature (see the `DriverApplicationStatus`
  // doc). Rejected rather than treated as a no-op so a double-click cannot push
  // `activatedAt` forward and rewrite when the driver was actually activated.
  if (application.status === "APPROVED") {
    return NextResponse.json(
      { error: "This application has already been approved." },
      { status: 400 },
    );
  }

  // A missing document fails this check exactly as a `PENDING` or `FLAGGED` one
  // does: approval means a reviewer looked at all three and cleared them, and a
  // document that was never uploaded was never looked at.
  const isFullyApproved = REQUIRED_DOCUMENT_TYPES.every((type) =>
    application.documents.some(
      (document) => document.type === type && document.status === "APPROVED",
    ),
  );

  if (!isFullyApproved) {
    return NextResponse.json(
      { error: "Every document must be approved first." },
      { status: 400 },
    );
  }

  // The vehicle can disappear between submit and this click: a driver may
  // remove it from their own dashboard at any time, and
  // `DriverApplication.vehicleId` is `SetNull`, so the application stays in the
  // queue without one. Activating a driver with no vehicle on file would put
  // them in the matching pool with nothing to drive, so this is refused for the
  // same reason the driver's own resubmit path refuses an application whose
  // vehicle is gone — but this endpoint answers a staff reviewer, not the
  // driver, so the message is addressed to them rather than reusing the
  // driver-facing copy verbatim.
  if (application.vehicleId === null) {
    return NextResponse.json(
      {
        error:
          "This application no longer has a vehicle on file and can't be approved.",
      },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.driverApplication.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    await tx.driverProfile.update({
      where: { id: application.driverProfileId },
      data: { activatedAt: new Date() },
    });
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "driver_application.approve",
    entityType: "DriverApplication",
    entityId: id,
    // The profile id is what ties this row to the activation it caused — the
    // `DriverProfile` write has no audit row of its own.
    metadata: { driverProfileId: application.driverProfileId },
  });

  const body: AdminApproveApplicationResponse = { status: "APPROVED" };

  return NextResponse.json(body, { status: 200 });
}
