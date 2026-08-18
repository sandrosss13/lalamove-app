import { NextResponse } from "next/server";

import { adminNavSection } from "@/components/admin/admin-nav";
import { getSalesSummary, resolveSalesRange } from "@/lib/admin/analytics";
import { authorizeAdminApi } from "@/lib/admin/api-auth";

/**
 * GET /api/admin/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD — the sales
 * figures for a range, as JSON.
 *
 * The dashboard page itself does *not* call this: it is a server component and
 * calls `getSalesSummary()` directly, which saves a network round-trip and one
 * redundant authorization. This endpoint exists so the same numbers are
 * reachable from outside a page render — an ops script, a spreadsheet refresh,
 * or a future client-side widget — and because it shares `getSalesSummary()`
 * with both the page and the export, none of the three can disagree.
 *
 * Both bounds are inclusive calendar days and both are optional; see
 * `resolveSalesRange` for how missing or malformed values fall back to today
 * rather than erroring.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Same role list the sidebar filters the Sales Analytics section by, read
  // from `admin-nav` rather than restated so the two can't drift apart.
  const authorized = await authorizeAdminApi(
    adminNavSection("analytics").adminRoles,
  );

  if (!authorized.ok) {
    return authorized.response;
  }

  const { searchParams } = new URL(request.url);
  const range = resolveSalesRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const summary = await getSalesSummary(range);

  return NextResponse.json(summary, { status: 200 });
}
