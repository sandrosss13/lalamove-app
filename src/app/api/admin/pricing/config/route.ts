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
  GENERAL_CONFIG_FIELDS,
  parseGeneralConfigBody,
  translatePricingError,
} from "@/lib/admin/pricing-validation";
import { prisma } from "@/lib/prisma";

/** Same roles as `GET /api/admin/pricing`; restated so the gate reads here. */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/**
 * PATCH /api/admin/pricing/config — change any of the general knobs on the
 * `PricingConfig` singleton: the intercity threshold (km), the manual-quote
 * threshold (km), the quote validity (minutes), and the default return
 * allowance for unlisted city pairs. Partial: the Routes tab sends only the
 * default allowance, the General tab the other three.
 *
 * The cross-field rule (manual-quote threshold above the intercity one) is
 * checked against the row as it will be after the save — read inside the
 * transaction so a concurrent save cannot slip a conflicting value in between
 * the check and the write.
 *
 * The change and the `tariffVersion` bump are one statement; the audit row
 * commits with them.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
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

  const outcome = await prisma.$transaction(async (tx) => {
    const { config: current } = await readPricingConfig(tx);
    const parsed = parseGeneralConfigBody(rawBody, current);
    if ("error" in parsed) {
      return parsed;
    }

    const changed = Object.keys(parsed.data) as (keyof typeof parsed.data)[];
    const tariffVersion = await bumpTariffVersion(tx, parsed.data);

    await writeAuditLog(
      {
        actorId: authorized.context.actorId,
        action: "pricing_config.update",
        entityType: "PricingConfig",
        entityId: "1",
        metadata: {
          tariffVersion,
          changed,
          before: Object.fromEntries(
            GENERAL_CONFIG_FIELDS.filter((field) =>
              changed.includes(field),
            ).map((field) => [field, current[field]]),
          ),
          after: { ...parsed.data },
        },
      },
      tx,
    );

    return { data: parsed.data };
  });

  if ("error" in outcome) {
    return NextResponse.json(
      { error: translatePricingError(t, outcome.error) },
      { status: 400 },
    );
  }

  const body: AdminPricingSnapshot = await loadAdminPricingSnapshot();
  return NextResponse.json(body, { status: 200 });
}
