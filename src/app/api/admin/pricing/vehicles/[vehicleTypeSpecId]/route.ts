import { NextResponse } from "next/server";

import type { AdminRole, Prisma } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  bumpTariffVersion,
  loadAdminPricingSnapshot,
  type AdminPricingSnapshot,
} from "@/lib/admin/pricing";
import {
  parseVehicleTariffBody,
  translatePricingError,
  VEHICLE_TARIFF_FIELDS,
} from "@/lib/admin/pricing-validation";
import { prisma } from "@/lib/prisma";

/** Same roles as `GET /api/admin/pricing`; restated so the gate reads here. */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/**
 * PUT /api/admin/pricing/vehicles/[vehicleTypeSpecId] — replace one vehicle
 * type's tariff (`PricingRule`): city base / per-km / per-minute / minimum,
 * intercity base / per-km, the two commission rates, and the vehicle waiting
 * overtime (free minutes, per-minute rate).
 *
 * Upsert, so a vehicle type that has never had a `PricingRule` (and so cannot
 * be quoted) gets one; such a row is created with the legacy `helperFee` at 0
 * and the legacy city columns copied from the v1 city rates. Otherwise the
 * legacy rate columns (`baseFare`, `pricePerKm`, `pricePerMinute`,
 * `minimumFare`, `helperFee`), which the pre-v1 code still prices with on the
 * shared database, are never written here. `freeLoadingMinutes` /
 * `overtimeRatePerMinute` are the one shared pair: the vehicle waiting
 * overtime means the same in both code paths, so editing it here changes it
 * for both.
 *
 * The rule write, the `tariffVersion` bump and the audit row are one
 * transaction: a tariff change that lands without its version bump would let
 * a client book at a price they were never quoted, and one without its audit
 * row would leave no trace of who changed what clients pay.
 *
 * Answers with the fresh snapshot so the page shows what the database now
 * holds, version included.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ vehicleTypeSpecId: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();
  const { vehicleTypeSpecId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseVehicleTariffBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json(
      { error: translatePricingError(t, parsed.error) },
      { status: 400 },
    );
  }

  const vehicle = await prisma.vehicleTypeSpec.findUnique({
    where: { id: vehicleTypeSpecId },
    select: { id: true, code: true, pricingRule: true },
  });

  if (!vehicle) {
    return NextResponse.json(
      { error: t("admin.pricingValidation.vehicleNotFound") },
      { status: 404 },
    );
  }

  const before: Prisma.InputJsonObject | null = vehicle.pricingRule
    ? Object.fromEntries(
        VEHICLE_TARIFF_FIELDS.map((field) => [
          field,
          vehicle.pricingRule?.[field] ?? null,
        ]),
      )
    : null;

  await prisma.$transaction(async (tx) => {
    const rule = await tx.pricingRule.upsert({
      where: { vehicleTypeSpecId: vehicle.id },
      // A brand-new rule must also fill the NOT NULL legacy columns the
      // pre-v1 code prices with. They start equal to the v1 city rates (the
      // closest meaning) and are never touched again by this endpoint — an
      // update writes only the v1 columns and the shared waiting overtime.
      create: {
        vehicleTypeSpecId: vehicle.id,
        helperFee: 0,
        baseFare: parsed.data.cityBaseFare,
        pricePerKm: parsed.data.cityPricePerKm,
        pricePerMinute: parsed.data.cityPricePerMinute,
        minimumFare: parsed.data.cityMinimumFare,
        ...parsed.data,
      },
      update: parsed.data,
      select: { id: true },
    });

    const tariffVersion = await bumpTariffVersion(tx);

    await writeAuditLog(
      {
        actorId: authorized.context.actorId,
        action: before ? "pricing_rule.update" : "pricing_rule.create",
        entityType: "PricingRule",
        entityId: rule.id,
        metadata: {
          vehicleCode: vehicle.code,
          tariffVersion,
          before,
          after: { ...parsed.data },
        },
      },
      tx,
    );
  });

  const body: AdminPricingSnapshot = await loadAdminPricingSnapshot();
  return NextResponse.json(body, { status: 200 });
}
