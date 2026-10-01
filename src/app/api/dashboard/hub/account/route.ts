import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { getHubAccountSettings } from "@/lib/dashboard/hub/account-settings";
import type {
  HubAccountResponse,
  HubApiErrorResponse,
} from "@/lib/mobile-api/contracts";
import {
  hubApiOk,
  hubApiProfileMissing,
  requireHubApiAccount,
} from "@/lib/mobile-api/hub-api-guard";
import { toHubAccountResponse } from "@/lib/mobile-api/serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/account — the signed-in account's own settings.
 *
 * The JSON counterpart of `/dashboard/account`: a driver's profile fields, or a
 * company's details with its payout IBAN already truncated to four characters
 * by the loader. Read-only — profile edits go through the existing
 * `/api/driver-profile` and `/api/logistics-company` handlers.
 *
 * The session email is passed to the loader so it does not re-enter the
 * redirecting page guard for it.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<HubAccountResponse | HubApiErrorResponse>> {
  const t = await getRequestTranslations();
  const guard = await requireHubApiAccount(request, t);

  if (!guard.ok) {
    return guard.response;
  }

  const settings = await getHubAccountSettings(guard.account, guard.email);

  // Unreachable in practice — the guard has just loaded the same profile row —
  // but the loader's `null` is answered rather than asserted away.
  if (settings === null) {
    return hubApiProfileMissing(t, guard.account.kind === "BUSINESS");
  }

  return hubApiOk<HubAccountResponse>(toHubAccountResponse(settings));
}
