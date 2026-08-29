import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may review driver onboarding applications. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/** Body this endpoint answers with, so the review drawer can update in place. */
export type AdminRequestChangesResponse = {
  status: "ACTION_REQUIRED";
};

/**
 * POST /api/admin/driver-applications/[id]/request-changes — hand the
 * application back to the driver with the flagged documents' reasons attached.
 *
 * Takes no request body: the reasons are already on the document rows, written
 * one at a time through the sibling `documents/[docId]` endpoint, and this is
 * only the "send it back" half of that decision.
 *
 * **This route must never write `DriverApplication.draft`.** A successful
 * submit clears the draft, and the driver's resubmit path in
 * `POST /api/driver-profile/onboarding/submit` branches on exactly that: a null
 * draft on an `ACTION_REQUIRED` application takes the `resubmit()` path, which
 * re-validates the normalized rows. Populating `draft` here would silently
 * route the driver's next submit through the *draft* validation path instead,
 * changing which rules run. Only `status` changes below.
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

  // Live documents only: a superseded row is history, and its old flag must not
  // stand in for a verdict on the photo that replaced it.
  const application = await prisma.driverApplication.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      documents: {
        where: { supersededAt: null, status: "FLAGGED" },
        select: { type: true },
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
  // doc): an approved driver is already active and cannot be pulled back here.
  if (application.status === "APPROVED") {
    return NextResponse.json(
      { error: "This application has already been approved." },
      { status: 400 },
    );
  }

  // Without a flagged document the driver would land on an "action required"
  // screen listing nothing to fix, and the resubmit button — which unlocks only
  // once every flagged document has been replaced — would have nothing to wait
  // for. Reject rather than produce that dead end.
  if (application.documents.length === 0) {
    return NextResponse.json(
      { error: "Flag at least one document before requesting changes." },
      { status: 400 },
    );
  }

  const flaggedDocumentTypes = application.documents.map(
    (document) => document.type,
  );

  await prisma.driverApplication.update({
    where: { id },
    // `status` and nothing else — see this route's doc comment for why `draft`
    // in particular must stay exactly as the last successful submit left it.
    data: { status: "ACTION_REQUIRED" },
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "driver_application.request_changes",
    entityType: "DriverApplication",
    entityId: id,
    // The reasons themselves live on the document rows, which are versioned and
    // survive the retake; recording which types were flagged is what makes this
    // row readable on its own.
    metadata: { flaggedDocumentTypes },
  });

  const body: AdminRequestChangesResponse = { status: "ACTION_REQUIRED" };

  return NextResponse.json(body, { status: 200 });
}
