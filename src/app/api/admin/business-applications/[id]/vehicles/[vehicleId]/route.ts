import { NextResponse } from "next/server";

import type {
  AdminRole,
  BusinessApplicationVehicleStatus,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may review business fleet applications. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/**
 * The six per-vehicle flag reasons from the design, verbatim. Closed for the
 * same reason as the company-level list: the company reads the reason verbatim
 * on its status screen, and its per-vehicle "Fix" editor keys its corrective
 * copy off it, so a free-typed reason would produce a card with nothing
 * actionable on it. The drawer offers exactly these six as chips, and a chip
 * click *is* the flag.
 */
const VEHICLE_FLAG_REASONS: readonly string[] = [
  "Plate does not match the documents",
  "Payload above the class limit",
  "Dimensions look wrong",
  "Vehicle too old for the platform",
  "Duplicate plate on another fleet",
  "Cooling unit record missing",
];

/** The reviewer's verdict on one vehicle in the fleet. */
type VehicleVerdict =
  { verdict: "APPROVED" } | { verdict: "FLAGGED"; reason: string };

/** Body this endpoint answers with, so the review drawer can update in place. */
export type AdminBusinessVehicleReviewResponse = {
  applicationVehicleId: string;
  status: BusinessApplicationVehicleStatus;
  flagReason: string | null;
};

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * `reason` is required for a flag, rejected when whitespace-only, and rejected
 * when it is not one of `VEHICLE_FLAG_REASONS` — see that constant for why the
 * list is closed rather than free text.
 */
function parseVehicleVerdictBody(
  body: unknown,
): { value: VehicleVerdict } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const { verdict, reason } = body as Record<string, unknown>;

  if (verdict === "APPROVED") {
    return { value: { verdict: "APPROVED" } };
  }

  if (verdict !== "FLAGGED") {
    return { error: 'verdict must be either "APPROVED" or "FLAGGED".' };
  }

  if (typeof reason !== "string" || reason.trim() === "") {
    return { error: "A reason is required to flag a vehicle." };
  }

  const trimmedReason = reason.trim();

  if (!VEHICLE_FLAG_REASONS.includes(trimmedReason)) {
    return { error: "That is not one of the vehicle flag reasons." };
  }

  return { value: { verdict: "FLAGGED", reason: trimmedReason } };
}

/**
 * PATCH /api/admin/business-applications/[id]/vehicles/[vehicleId] — record the
 * reviewer's verdict on one vehicle in the fleet.
 *
 * **`[vehicleId]` is a `BusinessApplicationVehicle.id`, not a `Vehicle.id`.**
 * The review row is what carries the verdict, and it outlives the vehicle
 * itself (`BusinessApplicationVehicle.vehicleId` is `SetNull`, so a company
 * removing a vehicle from its own fleet must not vanish a decided verdict). The
 * segment is named `vehicleId` rather than `id` only because Next.js forbids two
 * dynamic segments with the same name on one path.
 *
 * The verdict on its own moves nothing: the application's own status changes
 * only through the sibling `request-changes`/`activate` endpoints, so a
 * reviewer can work through every vehicle card before deciding what to do with
 * the application as a whole.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; vehicleId: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { id, vehicleId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseVehicleVerdictBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const application = await prisma.businessApplication.findUnique({
    where: { id },
    select: { id: true, status: true },
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

  // `APPROVED` is terminal for this feature, so re-reviewing its vehicles is a
  // stale tab, not a 404 — say so.
  if (application.status === "APPROVED") {
    return NextResponse.json(
      { error: "This fleet has already been activated." },
      { status: 400 },
    );
  }

  // Scoped to this application, so a review row belonging to another company's
  // application 404s rather than being written.
  const applicationVehicle = await prisma.businessApplicationVehicle.findFirst({
    where: { id: vehicleId, businessApplicationId: id },
    select: { id: true, vehicleId: true },
  });

  if (!applicationVehicle) {
    return NextResponse.json(
      { error: "Vehicle not found on this application." },
      { status: 404 },
    );
  }

  const review = parsed.value;

  // A row whose `Vehicle` is gone (`vehicleId: null`) is deliberately still
  // reviewable — flagging it is exactly what a reviewer should do with a
  // vehicle that is no longer on file.
  const updated = await prisma.businessApplicationVehicle.update({
    where: { id: applicationVehicle.id },
    data:
      review.verdict === "APPROVED"
        ? // Cleared, not left behind: an approved vehicle still showing a stale
          // reason would keep the company's status screen asking for a fix.
          { status: "APPROVED", flagReason: null, decidedAt: new Date() }
        : {
            status: "FLAGGED",
            flagReason: review.reason,
            // Stamped on every verdict, and cleared back to null by the
            // company's own correction endpoint
            // (`PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]`).
            // This write is that one's mirror image.
            decidedAt: new Date(),
          },
    select: { id: true, status: true, flagReason: true },
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action:
      review.verdict === "APPROVED"
        ? "business_application_vehicle.approve"
        : "business_application_vehicle.flag",
    entityType: "BusinessApplicationVehicle",
    entityId: applicationVehicle.id,
    metadata: {
      applicationId: id,
      vehicleId: applicationVehicle.vehicleId,
      ...(review.verdict === "FLAGGED" ? { reason: review.reason } : {}),
    },
  });

  const body: AdminBusinessVehicleReviewResponse = {
    applicationVehicleId: updated.id,
    status: updated.status,
    flagReason: updated.flagReason,
  };

  return NextResponse.json(body, { status: 200 });
}
