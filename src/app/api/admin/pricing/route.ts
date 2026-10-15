import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import {
  loadAdminPricingSnapshot,
  type AdminPricingSnapshot,
} from "@/lib/admin/pricing";

/**
 * Staff who may read and change the tariff. The same roles as Finances: the
 * tariff decides what clients pay and what the platform keeps, which is the
 * finance role's remit. Stated per route rather than imported from one shared
 * constant so the gate on each endpoint can be read — and audited — without
 * following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/** Re-exported so the pages import the response type from the endpoint. */
export type AdminPricingResponse = AdminPricingSnapshot;

/**
 * GET /api/admin/pricing — the whole tariff in one read: the `PricingConfig`
 * singleton, the helper floor bands, every vehicle type with its
 * `PricingRule`, and every `RouteAllowance`.
 *
 * One endpoint for all four tabs (and the quote simulator) rather than one
 * per table: the tables are tiny, and the simulator needs all of them at once
 * to price a trip exactly as `computeQuote` will.
 */
export async function GET(): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const body: AdminPricingResponse = await loadAdminPricingSnapshot();
  return NextResponse.json(body, { status: 200 });
}
