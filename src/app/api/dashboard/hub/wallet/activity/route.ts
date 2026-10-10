import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type { WalletActivityResponse } from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { toWalletEntry } from "@/lib/mobile-api/serializers";
import {
  invalidWalletRequest,
  requireWalletDriver,
  type WalletRefusal,
} from "@/lib/mobile-api/wallet-api";
import { getWalletActivity } from "@/lib/wallet/driver-wallet";
import { parsePageSize } from "@/lib/wallet/rules";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/wallet/activity?cursor=&limit= — the driver's ledger,
 * newest first: job payouts and overtime, paid withdrawals, reversals and
 * manual adjustments.
 *
 * A job entry names its job by id and `reference` and carries no other figure
 * than its own amount — never the client's price or the commission.
 *
 * Cursor-paged: pass the previous answer's `nextCursor` as `cursor`. A cursor
 * that is not one of this driver's entries is a 400.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<WalletActivityResponse | WalletRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireWalletDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const params = new URL(request.url).searchParams;
  const page = await getWalletActivity(
    resolved.driver.driverProfileId,
    params.get("cursor"),
    parsePageSize(params.get("limit")),
  );

  if (page === null) {
    return invalidWalletRequest(t, t("errors.wallet.unknownCursor"));
  }

  return hubApiOk<WalletActivityResponse>({
    entries: page.items.map(toWalletEntry),
    nextCursor: page.nextCursor,
  });
}
