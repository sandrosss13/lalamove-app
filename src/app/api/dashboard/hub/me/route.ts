import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { getHubHeader } from "@/lib/dashboard/hub/header";
import type {
  HubApiErrorResponse,
  HubMeResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk, requireHubApiAccount } from "@/lib/mobile-api/hub-api-guard";
import { toHubMeResponse } from "@/lib/mobile-api/serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/me — who is signed in, and what they have under way.
 *
 * The JSON counterpart of the hub shell (`(hub)/layout.tsx`): the resolved
 * account plus the header's in-progress jobs. The header's notifications are
 * sample data on the web and are not returned — see `toHubMeResponse`.
 *
 * Session, forced-password-change, suspension and role handling are
 * `requireHubApiAccount`'s, and answer as JSON status codes, never a redirect.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<HubMeResponse | HubApiErrorResponse>> {
  const t = await getRequestTranslations();
  const guard = await requireHubApiAccount(request, t);

  if (!guard.ok) {
    return guard.response;
  }

  const header = await getHubHeader(guard.account);

  return hubApiOk<HubMeResponse>(toHubMeResponse(guard.account, header));
}
