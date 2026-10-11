import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type { WalletSummaryResponse } from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { toWalletSummaryResponse } from "@/lib/mobile-api/serializers";
import {
  requireWalletDriver,
  type WalletRefusal,
} from "@/lib/mobile-api/wallet-api";
import { getWalletSummary } from "@/lib/wallet/driver-wallet";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/wallet — the driver's wallet at a glance: balance,
 * what is available to withdraw, what is reserved by pending withdrawals, the
 * minimum, and whether a withdrawal is possible right now (with a
 * machine-readable reason when it is not).
 *
 * Independent drivers only — see `requireWalletDriver`.
 *
 * The balance is the sum of the ledger, and the ledger is credited only by
 * jobs whose payment a gateway has confirmed. With no gateway integrated, that
 * is no job: an honest zero, not a bug. Per-job payouts stay on
 * `GET /api/dashboard/hub/jobs`, untouched by any of this.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<WalletSummaryResponse | WalletRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireWalletDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  return hubApiOk<WalletSummaryResponse>(
    toWalletSummaryResponse(
      await getWalletSummary(resolved.driver.driverProfileId),
    ),
  );
}
