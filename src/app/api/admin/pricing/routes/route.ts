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
import {
  parseRouteAllowanceBody,
  translatePricingError,
} from "@/lib/admin/pricing-validation";
import { normaliseCityPair } from "@/lib/pricing-engine";
import { prisma } from "@/lib/prisma";

/** Same roles as `GET /api/admin/pricing`; restated so the gate reads here. */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/**
 * PUT /api/admin/pricing/routes — set the return allowance for one city pair,
 * creating the `RouteAllowance` row if the pair has none.
 *
 * The pair is accepted in either order and stored through `normaliseCityPair`
 * (cityA < cityB by enum name — the migration's CHECK constraint), so
 * "Batumi–Tbilisi" and "Tbilisi–Batumi" are always the same row and the quote
 * engine's lookup finds it. An upsert keyed on that pair, rather than a
 * create that could collide, makes adding an already-listed pair simply an
 * edit of it.
 *
 * Row, `tariffVersion` bump and audit row commit together.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseRouteAllowanceBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json(
      { error: translatePricingError(t, parsed.error) },
      { status: 400 },
    );
  }

  const [cityA, cityB] = normaliseCityPair(
    parsed.data.cityA,
    parsed.data.cityB,
  );
  const { allowance } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.routeAllowance.findUnique({
      where: { cityA_cityB: { cityA, cityB } },
      select: { allowance: true },
    });

    const route = await tx.routeAllowance.upsert({
      where: { cityA_cityB: { cityA, cityB } },
      create: { cityA, cityB, allowance },
      update: { allowance },
      select: { id: true },
    });

    const tariffVersion = await bumpTariffVersion(tx);

    await writeAuditLog(
      {
        actorId: authorized.context.actorId,
        action: existing ? "route_allowance.update" : "route_allowance.create",
        entityType: "RouteAllowance",
        entityId: route.id,
        metadata: {
          cityA,
          cityB,
          tariffVersion,
          before: existing ? existing.allowance : null,
          after: allowance,
        },
      },
      tx,
    );
  });

  const body: AdminPricingSnapshot = await loadAdminPricingSnapshot();
  return NextResponse.json(body, { status: 200 });
}
