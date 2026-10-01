import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { getHubJobs } from "@/lib/dashboard/hub/jobs";
import type {
  HubApiErrorResponse,
  HubJobsResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk, requireHubApiAccount } from "@/lib/mobile-api/hub-api-guard";
import { toHubJobsResponse } from "@/lib/mobile-api/serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/jobs — this account's job history, newest first.
 *
 * The JSON counterpart of `/dashboard/jobs`. Scoping is `getHubJobs`'s own: a
 * driver's rows are the orders whose `driverId` is their user id, a company's
 * the orders whose `companyId` is theirs. The account comes from the session
 * alone — there is no query parameter that could name somebody else's.
 *
 * No request body, no query parameters. Unpaginated, as the page is.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<HubJobsResponse | HubApiErrorResponse>> {
  const t = await getRequestTranslations();
  const guard = await requireHubApiAccount(request, t);

  if (!guard.ok) {
    return guard.response;
  }

  const data = await getHubJobs(guard.account);

  return hubApiOk<HubJobsResponse>(toHubJobsResponse(data));
}
