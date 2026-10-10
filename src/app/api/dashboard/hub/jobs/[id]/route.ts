import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { getHubJobSheet } from "@/lib/dashboard/hub/job-sheet";
import { resolveJobSheetScope } from "@/lib/dashboard/hub/job-sheet-access";
import type {
  HubApiErrorResponse,
  HubJobSheetResponse,
} from "@/lib/mobile-api/contracts";
import {
  hubApiError,
  hubApiOk,
  requireHubApiAccount,
} from "@/lib/mobile-api/hub-api-guard";
import { toHubJobSheetResponse } from "@/lib/mobile-api/serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/jobs/[id] — one job in full.
 *
 * The JSON counterpart of `/dashboard/jobs/[id]`, and it takes the same two
 * steps in the same order so the two cannot disagree about who may read a job:
 * `resolveJobSheetScope` narrows the account to a scope that cannot carry a
 * null id, and `getHubJobSheet` checks the order against it with
 * `canViewJobSheet` (a driver: `Order.driverId` is their user id; a company:
 * `Order.companyId` is theirs). See `tests/job-sheet-access.spec.ts`.
 *
 * **Every refusal is the same 404.** An order that does not exist, another
 * account's order, and an unclaimed order on the open market are
 * indistinguishable, so the route cannot be used to probe which ids exist.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<HubJobSheetResponse | HubApiErrorResponse>> {
  const t = await getRequestTranslations();
  const guard = await requireHubApiAccount(request, t);

  if (!guard.ok) {
    return guard.response;
  }

  const scope = resolveJobSheetScope(guard.account);

  if (scope === null) {
    return hubApiError(t, "NOT_FOUND", 404);
  }

  const { id } = await params;
  const job = await getHubJobSheet(id, scope);

  if (job === null) {
    return hubApiError(t, "NOT_FOUND", 404);
  }

  // `scope.kind` decides whether the proof of delivery is sent: the assigned
  // driver gets it, a company reader does not — see `toHubJobSheetResponse`.
  return hubApiOk<HubJobSheetResponse>(toHubJobSheetResponse(job, scope.kind));
}
