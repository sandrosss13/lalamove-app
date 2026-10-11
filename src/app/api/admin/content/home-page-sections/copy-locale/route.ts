import { NextResponse } from "next/server";

import type { AdminRole, HomePageSection, Prisma } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { revalidateHomePage } from "@/lib/admin/home-page-data";
import { prisma } from "@/lib/prisma";

import {
  bulkResponseBody,
  listLocaleSections,
  parseContentLocaleField,
  readJsonObjectBody,
  toInputJson,
} from "../bulk";

/**
 * Staff who may compose the public landing page. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * POST /api/admin/content/home-page-sections/copy-locale — make one locale's
 * sections a copy of another's, typically to start a translation from the
 * finished page rather than from the defaults.
 *
 * Body: `{ from: "KA" | "EN", to: "KA" | "EN" }` (must differ).
 *
 * Rows are paired by `type`, in render order: the n-th source row of a type
 * overwrites the n-th target row of that type (`content`, `isActive`,
 * `sortOrder`), and a source row with no counterpart creates one. Target rows
 * left without a source counterpart are switched off rather than deleted, so
 * the target ends up rendering exactly what the source renders while nothing
 * authored there is lost. Content is copied verbatim — the copied text is in
 * the source language until someone translates it.
 *
 * The audit entry records each overwritten target row's previous state.
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

  const from = parseContentLocaleField(body.record.from, "from", t);
  if ("error" in from) {
    return NextResponse.json({ error: from.error }, { status: 400 });
  }

  const to = parseContentLocaleField(body.record.to, "to", t);
  if ("error" in to) {
    return NextResponse.json({ error: to.error }, { status: 400 });
  }

  if (from.value === to.value) {
    return NextResponse.json(
      { error: t("errors.adminContentHomePageSections.localesMustDiffer") },
      { status: 400 },
    );
  }

  const [sourceRows, targetRows] = await Promise.all([
    listLocaleSections(from.value),
    listLocaleSections(to.value),
  ]);

  // Target rows queued per type in render order; pairing consumes them.
  const unpairedTargets = new Map<string, HomePageSection[]>();
  for (const row of targetRows) {
    unpairedTargets.set(row.type, [
      ...(unpairedTargets.get(row.type) ?? []),
      row,
    ]);
  }

  const creates: Prisma.HomePageSectionCreateManyInput[] = [];
  const updates: { id: string; data: Prisma.HomePageSectionUpdateInput }[] = [];
  const overwritten: {
    id: string;
    type: string;
    sourceId: string;
    previous: { sortOrder: number; isActive: boolean; content: unknown };
  }[] = [];

  for (const source of sourceRows) {
    const queue = unpairedTargets.get(source.type) ?? [];
    const target = queue.shift();

    if (target === undefined) {
      creates.push({
        type: source.type,
        locale: to.value,
        sortOrder: source.sortOrder,
        isActive: source.isActive,
        content: toInputJson(source.content),
      });
      continue;
    }

    updates.push({
      id: target.id,
      data: {
        content: toInputJson(source.content),
        isActive: source.isActive,
        sortOrder: source.sortOrder,
      },
    });
    overwritten.push({
      id: target.id,
      type: target.type,
      sourceId: source.id,
      previous: {
        sortOrder: target.sortOrder,
        isActive: target.isActive,
        content: target.content,
      },
    });
  }

  const deactivated: { id: string; type: string }[] = [];
  for (const leftovers of unpairedTargets.values()) {
    for (const row of leftovers.filter((leftover) => leftover.isActive)) {
      updates.push({ id: row.id, data: { isActive: false } });
      deactivated.push({ id: row.id, type: row.type });
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
      action: "home_page_section.copy_locale",
      entityType: "HomePageSection",
      metadata: {
        from: from.value,
        to: to.value,
        createdTypes: creates.map((create) => create.type),
        overwritten,
        deactivated,
      } as Prisma.InputJsonValue,
    });

    revalidateHomePage();
  }

  return NextResponse.json(await bulkResponseBody(to.value), { status: 200 });
}
