import { NextResponse } from "next/server";

import type { AdminRole, DriverApplicationDocumentStatus } from "@prisma/client";

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
 * Cap on the stored flag reason. The design offers six one-line reason chips;
 * the server accepts any non-empty string (a reviewer may need to type
 * something the chips don't cover), but not an essay — the driver sees this
 * verbatim on their status screen.
 */
const MAX_FLAG_REASON_LENGTH = 500;

/** The reviewer's verdict on one document. */
type DocumentReview = { action: "approve" } | { action: "flag"; reason: string };

/** Body this endpoint answers with, so the review drawer can update in place. */
export type AdminDocumentReviewResponse = {
  documentId: string;
  status: DriverApplicationDocumentStatus;
  flagReason: string | null;
};

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * `reason` is required for a flag and rejected when whitespace-only: the whole
 * point of flagging is telling the driver what to fix, and " " on the status
 * screen reads as a bug rather than as feedback.
 */
function parseDocumentReviewBody(
  body: unknown,
): { value: DocumentReview } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const { action, reason } = body as Record<string, unknown>;

  if (action === "approve") {
    return { value: { action: "approve" } };
  }

  if (action !== "flag") {
    return { error: 'action must be either "approve" or "flag".' };
  }

  if (typeof reason !== "string" || reason.trim() === "") {
    return { error: "A reason is required to flag a document." };
  }

  const trimmedReason = reason.trim();

  if (trimmedReason.length > MAX_FLAG_REASON_LENGTH) {
    return {
      error: `A reason must be ${MAX_FLAG_REASON_LENGTH} characters or fewer.`,
    };
  }

  return { value: { action: "flag", reason: trimmedReason } };
}

/**
 * PATCH /api/admin/driver-applications/[id]/documents/[docId] — record the
 * reviewer's verdict on one uploaded onboarding document.
 *
 * A status change on the `DriverApplicationDocument` row and nothing else: no
 * Supabase Storage object is touched here, because replacing a bad photo is the
 * driver's own retake flow, not the reviewer's. The verdict on its own also
 * moves nothing — the application's own status changes only through the sibling
 * `request-changes`/`approve` endpoints, so a reviewer can work through all
 * three documents before deciding what to do with the application.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { id, docId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseDocumentReviewBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const application = await prisma.driverApplication.findUnique({
    where: { id },
    select: { id: true, status: true },
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
  // doc), so re-reviewing its documents is a stale tab, not a 404 — say so.
  if (application.status === "APPROVED") {
    return NextResponse.json(
      { error: "This application has already been approved." },
      { status: 400 },
    );
  }

  // Scoped to this application *and* to the live row. A superseded document is
  // history kept so the earlier rejection reason stays readable; acting on one
  // would flag a photo the driver has already replaced.
  const document = await prisma.driverApplicationDocument.findFirst({
    where: { id: docId, driverApplicationId: id, supersededAt: null },
    select: { id: true, type: true },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const review = parsed.value;

  const updated = await prisma.driverApplicationDocument.update({
    where: { id: document.id },
    data:
      review.action === "approve"
        ? // Cleared, not left behind: an approved document showing a stale
          // reason would keep the driver's status screen asking for a retake.
          { status: "APPROVED", flagReason: null }
        : { status: "FLAGGED", flagReason: review.reason },
    select: { id: true, status: true, flagReason: true },
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action:
      review.action === "approve"
        ? "driver_application_document.approve"
        : "driver_application_document.flag",
    entityType: "DriverApplicationDocument",
    entityId: document.id,
    metadata: {
      applicationId: id,
      documentType: document.type,
      ...(review.action === "flag" ? { reason: review.reason } : {}),
    },
  });

  const body: AdminDocumentReviewResponse = {
    documentId: updated.id,
    status: updated.status,
    flagReason: updated.flagReason,
  };

  return NextResponse.json(body, { status: 200 });
}
