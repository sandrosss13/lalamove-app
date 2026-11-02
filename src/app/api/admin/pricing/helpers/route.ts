import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  bumpTariffVersion,
  loadAdminPricingSnapshot,
  readPricingConfig,
  type AdminPricingSnapshot,
} from "@/lib/admin/pricing";
import {
  parseHelperTariffBody,
  translatePricingError,
} from "@/lib/admin/pricing-validation";
import { prisma } from "@/lib/prisma";

/** Same roles as `GET /api/admin/pricing`; restated so the gate reads here. */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/**
 * PUT /api/admin/pricing/helpers — replace the helper tariff: the floor bands
 * (`HelperFloorBand`, wholesale) and the helper rules on the `PricingConfig`
 * singleton (max helpers per location, included minutes, overtime increment
 * and fee, elevator discount).
 *
 * The bands are replaced rather than patched one by one because their meaning
 * is collective — a band runs up to the next one's floor — and the validator
 * can only guarantee "a band at floor 0 exists, no duplicates" over the whole
 * set. Delete-then-create inside the transaction means the table is never
 * observed half-edited.
 *
 * Bands, rules, the `tariffVersion` bump and the audit row commit together.
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

  const parsed = parseHelperTariffBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json(
      { error: translatePricingError(t, parsed.error) },
      { status: 400 },
    );
  }

  const { bands, rules } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const [beforeBands, { config: beforeConfig }] = await Promise.all([
      tx.helperFloorBand.findMany({
        select: { minFloor: true, ratePerHelper: true },
        orderBy: { minFloor: "asc" },
      }),
      readPricingConfig(tx),
    ]);

    await tx.helperFloorBand.deleteMany({});
    await tx.helperFloorBand.createMany({ data: bands });

    const tariffVersion = await bumpTariffVersion(tx, rules);

    await writeAuditLog(
      {
        actorId: authorized.context.actorId,
        action: "helper_tariff.update",
        entityType: "HelperFloorBand",
        metadata: {
          tariffVersion,
          before: {
            bands: beforeBands,
            rules: {
              maxHelpers: beforeConfig.maxHelpers,
              helperIncludedMinutes: beforeConfig.helperIncludedMinutes,
              helperOvertimeIncrementMinutes:
                beforeConfig.helperOvertimeIncrementMinutes,
              helperOvertimeFeePerIncrement:
                beforeConfig.helperOvertimeFeePerIncrement,
              elevatorDiscount: beforeConfig.elevatorDiscount,
            },
          },
          after: { bands, rules },
        },
      },
      tx,
    );
  });

  const body: AdminPricingSnapshot = await loadAdminPricingSnapshot();
  return NextResponse.json(body, { status: 200 });
}
