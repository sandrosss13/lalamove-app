import { NextResponse } from "next/server";

import type { AdminRole, Prisma } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  isHomePageChromeSectionType,
  isHomePageSectionType,
  isRetiredHomePageSectionType,
  withDefaultSections,
} from "@/lib/admin/home-page-content";
import { revalidateHomePage } from "@/lib/admin/home-page-data";
import { prisma } from "@/lib/prisma";

import {
  CHROME_SORT_ORDER_BASE,
  bulkResponseBody,
  listLocaleSections,
  parseContentLocaleField,
  planLocalizedDefaultSections,
  readJsonObjectBody,
  type DefaultSectionPlan,
} from "../bulk";

/**
 * Staff who may compose the public landing page. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * One position in the composed page: an existing row, or a default about to
 * be created for a type the locale has no row for.
 */
type Slot =
  | { kind: "row"; id: string; type: string; sortOrder: number }
  | { kind: "default"; type: string; plan: DefaultSectionPlan };

/**
 * POST /api/admin/content/home-page-sections/materialize — turn the defaults a
 * locale is silently rendering into editable rows.
 *
 * Body: `{ locale: "KA" | "EN" }`.
 *
 * For every v4 section type (and the chrome) with *no* row in the locale —
 * active or not — a row is created holding the localized default copy, so the
 * public page looks exactly as it did and the admin list now shows every
 * section it renders. Existing rows keep their content and `isActive`; new rows
 * are slotted in where the public page already showed them
 * (`withDefaultSections`), and the locale is renumbered densely so the admin
 * order matches the rendered order. Active rows of a retired type are switched
 * off (never deleted). Idempotent: a second call changes nothing.
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

  // Every type with any row, inactive included: switching a section off is a
  // decision, and filling it back in would overrule it.
  const authoredTypes = new Set(rows.map((row) => row.type));

  const composed = withDefaultSections<Slot>(
    rows.map((row) => ({
      kind: "row",
      id: row.id,
      type: row.type,
      sortOrder: row.sortOrder,
    })),
    plans.map((plan) => ({ kind: "default", type: plan.type, plan })),
    authoredTypes,
  );

  // Dense renumbering in composed order: body sections from 0, chrome from
  // `CHROME_SORT_ORDER_BASE` (the renderer places chrome by type, so that
  // number only keeps it at the bottom of the admin list).
  let bodyIndex = 0;
  let chromeIndex = 0;
  const positioned = composed.map((slot) => {
    const isChrome =
      isHomePageSectionType(slot.type) &&
      isHomePageChromeSectionType(slot.type);
    const sortOrder = isChrome
      ? CHROME_SORT_ORDER_BASE + chromeIndex++
      : bodyIndex++;
    return { slot, sortOrder };
  });

  const creates: Prisma.HomePageSectionCreateManyInput[] = [];
  const updates: { id: string; data: Prisma.HomePageSectionUpdateInput }[] = [];
  const deactivatedRetired: { id: string; type: string }[] = [];

  const activeById = new Map(rows.map((row) => [row.id, row.isActive]));

  for (const { slot, sortOrder } of positioned) {
    if (slot.kind === "default") {
      creates.push({
        type: slot.plan.type,
        locale: locale.value,
        sortOrder,
        isActive: true,
        content: slot.plan.content,
      });
      continue;
    }

    const data: Prisma.HomePageSectionUpdateInput = {};
    if (slot.sortOrder !== sortOrder) {
      data.sortOrder = sortOrder;
    }
    if (
      isRetiredHomePageSectionType(slot.type) &&
      activeById.get(slot.id) === true
    ) {
      data.isActive = false;
      deactivatedRetired.push({ id: slot.id, type: slot.type });
    }
    if (Object.keys(data).length > 0) {
      updates.push({ id: slot.id, data });
    }
  }

  if (creates.length > 0 || updates.length > 0) {
    // The array form: every value was computed above, so nothing needs an
    // interactive session, and it runs on a transaction-mode pooler.
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
      action: "home_page_section.materialize_defaults",
      entityType: "HomePageSection",
      metadata: {
        locale: locale.value,
        createdTypes: creates.map((create) => create.type),
        deactivatedRetired,
        renumbered: updates.filter(({ data }) => "sortOrder" in data).length,
      },
    });

    revalidateHomePage();
  }

  return NextResponse.json(await bulkResponseBody(locale.value), {
    status: 200,
  });
}
