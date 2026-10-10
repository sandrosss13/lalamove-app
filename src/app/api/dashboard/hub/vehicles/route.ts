import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { getHubVehicles } from "@/lib/dashboard/hub/vehicles";
import type {
  HubApiErrorResponse,
  HubVehiclesResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk, requireHubApiAccount } from "@/lib/mobile-api/hub-api-guard";
import { toHubVehiclesResponse } from "@/lib/mobile-api/serializers";
import { getOwnedVehicleDocumentSlots } from "@/lib/vehicle-documents/driver-documents";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/vehicles — the vehicles this account owns or holds.
 *
 * The JSON counterpart of `/dashboard/vehicles`. `getHubVehicles` scopes a
 * driver to the vehicles they own plus any on an open assignment to them, and a
 * company to its fleet.
 *
 * The translator localises the two vehicle labels (`vehicleClassLabel`,
 * `vehicleTypeLabel`) from the request's `NEXT_LOCALE` cookie, as the page does
 * from its route locale. Everything the web marks as sample data — per vehicle
 * and on the tiles — is not returned; see `toHubVehiclesResponse`.
 *
 * Each vehicle the reader owns as a driver also carries `documents`: its
 * registration and insurance with status, expiry and flag reason. A company
 * vehicle — a roster driver's, or any of a company account's — carries
 * `documents: null`.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<HubVehiclesResponse | HubApiErrorResponse>> {
  const t = await getRequestTranslations();
  const guard = await requireHubApiAccount(request, t);

  if (!guard.ok) {
    return guard.response;
  }

  const { driverProfileId } = guard.account;

  const [data, ownedVehicleDocuments] = await Promise.all([
    getHubVehicles(guard.account, t),
    driverProfileId === null
      ? new Map<string, never>()
      : getOwnedVehicleDocumentSlots(driverProfileId, t),
  ]);

  return hubApiOk<HubVehiclesResponse>(
    toHubVehiclesResponse(data, ownedVehicleDocuments),
  );
}
