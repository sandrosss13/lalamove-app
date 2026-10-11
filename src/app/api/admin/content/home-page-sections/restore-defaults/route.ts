import { NextResponse } from "next/server";

import type { AdminRole, HomePageSection, Prisma } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { isRetiredHomePageSectionType } from "@/lib/admin/home-page-content";
import { revalidateHomePage } from "@/lib/admin/home-page-data";
import { prisma } from "@/lib/prisma";

import {
  bulkResponseBody,
  listLocaleSections,
  parseContentLocaleField,
  planLocalizedDefaultSections,
  readJsonObjectBody,
} from "../bulk";

/**
 * Staff who may compose the public landing page. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * POST /api/admin/content/home-page-sections/restore-defaults — put a locale's
 * page back to the v4 default composition and copy.
 *
 * Body: `{ locale: "KA" | "EN" }`.
 *
 * For every v4 section type and the chrome: the first row of that type gets
 * the localized default content, is switched on and moved to its default
 * position; a type with no row gets one created; any further rows of the same
 * type are switched off. Active rows of a retired type are switched off. Rows
 * nothing renders (an unknown `type`) are left exactly as they are. Nothing is
 * deleted.
 *
 * Destructive to authored copy, so the audit entry records every overwritten
 * row's previous content, position and visibility — after this call it is the
 * only record of them.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();

  const body = await readJsonObjectBody(request, t);
  if ("error" in body) {
    return NextResponse.json({ error: body.error }, { status: 400 });
  }

  const locale = parseContentLocaleField(body.record.locale, "locale", t);
  if ("error" in locale) {
    return NextResponse.json({ error: locale.error }, { status: 400 });
  }

  const [rows, plans] = await Promise.all([
    listLocaleSections(locale.value),
    planLocalizedDefaultSections(locale.value),
  ]);

  // Rows grouped by type, each group already in render order, so "the first
  // row of a type" is the one the page currently shows first.
  const rowsByType = new Map<string, HomePageSection[]>();
  for (const row of rows) {
    rowsByType.set(row.type, [...(rowsByType.get(row.type) ?? []), row]);
  }

  const creates: Prisma.HomePageSectionCreateManyInput[] = [];
  const updates: { id: string; data: Prisma.HomePageSectionUpdateInput }[] = [];
  const restored: {
    id: string;
    type: string;
    previous: { sortOrder: number; isActive: boolean; content: unknown };
  }[] = [];
  const deactivated: { id: string; type: string; reason: string }[] = [];

  for (const plan of plans) {
    const [primary, ...duplicates] = rowsByType.get(plan.type) ?? [];

    if (primary === undefined) {
      creates.push({
        type: plan.type,
        locale: locale.value,
        sortOrder: plan.sortOrder,
        isActive: true,
        content: plan.content,
      });
    } else {
      updates.push({
        id: primary.id,
        data: {
          content: plan.content,
          isActive: true,
          sortOrder: plan.sortOrder,
        },
      });
      restored.push({
        id: primary.id,
        type: primary.type,
        previous: {
          sortOrder: primary.sortOrder,
          isActive: primary.isActive,
          content: primary.content,
        },
      });
    }

    for (const duplicate of duplicates.filter((row) => row.isActive)) {
      updates.push({ id: duplicate.id, data: { isActive: false } });
      deactivated.push({
        id: duplicate.id,
        type: duplicate.type,
        reason: "duplicate",
      });
    }
  }

  for (const row of rows) {
    if (row.isActive && isRetiredHomePageSectionType(row.type)) {
      updates.push({ id: row.id, data: { isActive: false } });
      deactivated.push({ id: row.id, type: row.type, reason: "retired" });
    }
  }

  // The array form: every value was computed above, so nothing needs an
  // interactive session, and it runs on a transaction-mode pooler. Always at
  // least one statement — the plan covers every v4 type.
  await prisma.$transaction([
    ...updates.map(({ id, data }) =>
      prisma.homePageSection.update({
        where: { id },
        data,
        select: { id: true },
      }),
    ),
    ...(creates.length > 0
      ? [prisma.homePageSection.createMany({ data: creates })]
      : []),
  ]);

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "home_page_section.restore_defaults",
    entityType: "HomePageSection",
    metadata: {
      locale: locale.value,
      createdTypes: creates.map((create) => create.type),
      restored,
      deactivated,
    } as Prisma.InputJsonValue,
  });

  revalidateHomePage();

  return NextResponse.json(await bulkResponseBody(locale.value), {
    status: 200,
  });
}
