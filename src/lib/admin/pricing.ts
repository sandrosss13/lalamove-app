// Reads and writes the tariff tables through Prisma, so it can never be part
// of a browser bundle.
import "server-only";

import type { GeorgianCity, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_HELPER_FLOOR_BANDS,
  DEFAULT_PRICING_CONFIG,
  type PricingConfigValues,
} from "@/lib/pricing-engine";

/**
 * The server half of the admin Pricing section (`/admin/pricing/*`): the
 * snapshot every tab reads, and the version bump every save makes.
 *
 * The validation rules live in the pure `./pricing-validation`, shared with
 * the pages and the tests; this module only touches the database.
 */

/** One vehicle type and its tariff, as the Vehicles tab renders it. */
export type AdminVehicleTariffRow = {
  vehicleTypeSpecId: string;
  code: string;
  label: string;
  /**
   * Null for a vehicle type that has no `PricingRule` yet — it cannot be
   * booked until one is saved, which is exactly what the editor offers.
   */
  rule: {
    cityBaseFare: number;
    cityPricePerKm: number;
    cityPricePerMinute: number;
    cityMinimumFare: number;
    intercityBaseFare: number;
    intercityPricePerKm: number;
    cityCommissionRate: number;
    intercityCommissionRate: number;
    freeLoadingMinutes: number;
    overtimeRatePerMinute: number;
    updatedAt: string;
  } | null;
};

export type AdminRouteAllowanceRow = {
  id: string;
  cityA: GeorgianCity;
  cityB: GeorgianCity;
  allowance: number;
  updatedAt: string;
};

/** Body of `GET /api/admin/pricing` — the whole tariff in one read. */
export type AdminPricingSnapshot = {
  /**
   * The stored config, or `DEFAULT_PRICING_CONFIG` when the singleton row is
   * missing (`configIsDefault` says which) — exactly what the quote engine
   * falls back to, so the editor shows the figures customers are quoted.
   */
  config: PricingConfigValues;
  configIsDefault: boolean;
  bands: { minFloor: number; ratePerHelper: number }[];
  /** True when the band table is empty and the engine uses the defaults. */
  bandsAreDefault: boolean;
  vehicles: AdminVehicleTariffRow[];
  routes: AdminRouteAllowanceRow[];
};

function configValues(row: PricingConfigValues | null): PricingConfigValues {
  if (!row) return { ...DEFAULT_PRICING_CONFIG };
  return {
    intercityThresholdKm: row.intercityThresholdKm,
    manualQuoteThresholdKm: row.manualQuoteThresholdKm,
    defaultReturnAllowance: row.defaultReturnAllowance,
    quoteValidityMinutes: row.quoteValidityMinutes,
    tariffVersion: row.tariffVersion,
    maxHelpers: row.maxHelpers,
    helperIncludedMinutes: row.helperIncludedMinutes,
    helperOvertimeIncrementMinutes: row.helperOvertimeIncrementMinutes,
    helperOvertimeFeePerIncrement: row.helperOvertimeFeePerIncrement,
    elevatorDiscount: row.elevatorDiscount,
  };
}

/** The `PricingConfig` singleton as plain values, defaults when it is missing. */
export async function readPricingConfig(
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ config: PricingConfigValues; isDefault: boolean }> {
  const row = await db.pricingConfig.findUnique({ where: { id: 1 } });
  return { config: configValues(row), isDefault: row === null };
}

/** Everything the Pricing tabs show, read in parallel. */
export async function loadAdminPricingSnapshot(): Promise<AdminPricingSnapshot> {
  const [{ config, isDefault }, bandRows, vehicleRows, routeRows] =
    await Promise.all([
      readPricingConfig(),
      prisma.helperFloorBand.findMany({
        select: { minFloor: true, ratePerHelper: true },
        orderBy: { minFloor: "asc" },
      }),
      prisma.vehicleTypeSpec.findMany({
        select: {
          id: true,
          code: true,
          label: true,
          pricingRule: {
            select: {
              cityBaseFare: true,
              cityPricePerKm: true,
              cityPricePerMinute: true,
              cityMinimumFare: true,
              intercityBaseFare: true,
              intercityPricePerKm: true,
              cityCommissionRate: true,
              intercityCommissionRate: true,
              freeLoadingMinutes: true,
              overtimeRatePerMinute: true,
              updatedAt: true,
            },
          },
        },
        // Smallest vehicle first reads like the sheet does.
        orderBy: [{ maxPayloadKg: "asc" }, { label: "asc" }],
      }),
      prisma.routeAllowance.findMany({
        orderBy: [{ cityA: "asc" }, { cityB: "asc" }],
      }),
    ]);

  return {
    config,
    configIsDefault: isDefault,
    bands: bandRows.length > 0 ? bandRows : [...DEFAULT_HELPER_FLOOR_BANDS],
    bandsAreDefault: bandRows.length === 0,
    vehicles: vehicleRows.map((vehicle) => ({
      vehicleTypeSpecId: vehicle.id,
      code: vehicle.code,
      label: vehicle.label,
      rule: vehicle.pricingRule
        ? {
            ...vehicle.pricingRule,
            updatedAt: vehicle.pricingRule.updatedAt.toISOString(),
          }
        : null,
    })),
    routes: routeRows.map((route) => ({
      id: route.id,
      cityA: route.cityA,
      cityB: route.cityB,
      allowance: route.allowance,
      updatedAt: route.updatedAt.toISOString(),
    })),
  };
}

/**
 * Bumps `PricingConfig.tariffVersion` inside the caller's transaction and
 * returns the new version. EVERY tariff save calls this (see the model's
 * schema doc): a quote carries the version it was computed at, and order
 * creation refuses a stale one so the client re-quotes instead of being
 * charged a price it was never shown.
 *
 * `changes` lets a config save fold its own column changes into the same
 * statement. Upsert so a database whose singleton was never seeded still
 * gets one — created from the defaults plus `changes`, at version
 * `DEFAULT_PRICING_CONFIG.tariffVersion + 1` so it is still a bump from what
 * the engine was quoting at.
 */
export async function bumpTariffVersion(
  tx: Prisma.TransactionClient,
  changes: Partial<Omit<PricingConfigValues, "tariffVersion">> = {},
): Promise<number> {
  const row = await tx.pricingConfig.upsert({
    where: { id: 1 },
    create: {
      ...DEFAULT_PRICING_CONFIG,
      ...changes,
      id: 1,
      tariffVersion: DEFAULT_PRICING_CONFIG.tariffVersion + 1,
    },
    update: { ...changes, tariffVersion: { increment: 1 } },
    select: { tariffVersion: true },
  });
  return row.tariffVersion;
}
