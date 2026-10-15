import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  bumpTariffVersion,
  loadAdminPricingSnapshot,
  type AdminPricingSnapshot,
} from "@/lib/admin/pricing";
import { prisma } from "@/lib/prisma";

/** Same roles as `GET /api/admin/pricing`; restated so the gate reads here. */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/**
 * DELETE /api/admin/pricing/routes/[id] — remove a city pair's allowance, so
 * the pair falls back to `PricingConfig.defaultReturnAllowance`.
 *
 * A hard delete is safe here: orders snapshot their quote (`returnAllowance`
 * in the stored breakdown), so no past booking reads this row. Delete,
 * `tariffVersion` bump and audit row (carrying the deleted values, so the pair
 * can be put back from the log alone) commit together.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();
  const { id } = await params;

  const existing = await prisma.routeAllowance.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: t("admin.pricingValidation.routeNotFound") },
      { status: 404 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.routeAllowance.delete({ where: { id } });

    const tariffVersion = await bumpTariffVersion(tx);

    await writeAuditLog(
      {
        actorId: authorized.context.actorId,
        action: "route_allowance.delete",
        entityType: "RouteAllowance",
        entityId: id,
        metadata: {
          cityA: existing.cityA,
          cityB: existing.cityB,
          allowance: existing.allowance,
          tariffVersion,
        },
      },
      tx,
    );
  });

  const body: AdminPricingSnapshot = await loadAdminPricingSnapshot();
  return NextResponse.json(body, { status: 200 });
}
