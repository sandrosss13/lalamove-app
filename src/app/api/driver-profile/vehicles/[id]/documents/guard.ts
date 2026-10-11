/**
 * Shared request checks for the vehicle-document endpoints (listing, issuing an
 * upload URL, recording an upload). All three need the same session, role and
 * ownership guards, so they live here rather than being written three times
 * and drifting — the arrangement the proof-of-delivery routes have.
 */

import { NextResponse } from "next/server";

import type { RequestTranslator } from "@/i18n/request-locale";
import type {
  VehicleDocumentErrorCode,
  VehicleDocumentErrorResponse,
} from "@/lib/mobile-api/contracts";
import { requireHubApiAccount } from "@/lib/mobile-api/hub-api-guard";
import { prisma } from "@/lib/prisma";

export {
  asRecord,
  nonEmptyString,
} from "@/app/api/driver-profile/onboarding/documents/guard";

/** What a route has in hand once the caller has cleared every check. */
export type VehicleDocumentContext = {
  /** The vehicle, confirmed to exist and to be this driver's own. */
  vehicleId: string;
  plateNumber: string;
  /** The owner — `Vehicle.driverProfileId`. */
  driverProfileId: string;
};

export type VehicleDocumentGuardResult =
  | { context: VehicleDocumentContext }
  | { response: NextResponse<VehicleDocumentErrorResponse> };

/** A JSON refusal in these routes' one error shape. Never cached. */
export function vehicleDocumentError(
  message: string,
  code: VehicleDocumentErrorCode,
  status: number,
): NextResponse<VehicleDocumentErrorResponse> {
  return NextResponse.json<VehicleDocumentErrorResponse>(
    { error: message, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Authenticates the caller and confirms the vehicle is one they **own**.
 *
 * Session, forced password change, suspension, role and missing profile are
 * `requireHubApiAccount`'s, answered as it answers them. On top of that:
 *
 * - a company account (no driver profile) → 403 `ROLE_NOT_ALLOWED`;
 * - a vehicle that does not exist, or belongs to someone the caller has no
 *   connection to → 404 `NOT_FOUND`, one answer so ids cannot be probed;
 * - a company vehicle the caller currently drives → 403 `NOT_VEHICLE_OWNER`.
 *   The caller already sees that vehicle in `hub/vehicles`, so naming the
 *   reason leaks nothing and tells a roster driver who to ask instead.
 *
 * **Not** gated on the onboarding application's status, unlike the onboarding
 * documents routes: these documents are uploaded and renewed for as long as
 * the vehicle is driven, which is mostly after approval.
 *
 * Does not read the request body; callers parse their own afterwards.
 */
export async function resolveVehicleDocumentContext(
  request: Request,
  vehicleId: string,
  t: RequestTranslator,
): Promise<VehicleDocumentGuardResult> {
  const guard = await requireHubApiAccount(request, t);
  if (!guard.ok) {
    return { response: guard.response };
  }

  const { driverProfileId } = guard.account;
  if (driverProfileId === null) {
    return {
      response: vehicleDocumentError(
        t("errors.driverProfileVehicles.onlyDriversHaveVehicles"),
        "ROLE_NOT_ALLOWED",
        403,
      ),
    };
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      plateNumber: true,
      driverProfileId: true,
      assignments: {
        where: { driverProfileId, unassignedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  const isOwner = vehicle?.driverProfileId === driverProfileId;
  const isAssigned = (vehicle?.assignments.length ?? 0) > 0;

  if (!vehicle || (!isOwner && !isAssigned)) {
    return {
      response: vehicleDocumentError(
        t("common.shared.vehicleNotFound"),
        "NOT_FOUND",
        404,
      ),
    };
  }

  if (!isOwner) {
    return {
      response: vehicleDocumentError(
        t("errors.vehicleDocuments.companyManagesThisVehicle"),
        "NOT_VEHICLE_OWNER",
        403,
      ),
    };
  }

  return {
    context: {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      driverProfileId,
    },
  };
}

/** Reads a JSON body, or returns the 400 for one that is not JSON. */
export async function readVehicleDocumentJsonBody(
  request: Request,
  t: RequestTranslator,
): Promise<
  { body: unknown } | { response: NextResponse<VehicleDocumentErrorResponse> }
> {
  try {
    return { body: await request.json() };
  } catch {
    return {
      response: vehicleDocumentError(
        t("common.shared.requestBodyMustBeValidJson"),
        "INVALID_REQUEST",
        400,
      ),
    };
  }
}
