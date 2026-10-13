import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

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
} from "../bulk";

/**
 * Staff who may compose the public landing page. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * Upper bound on `ids`. A landing page is a couple of dozen rows at most; the
 * bound only keeps a malformed request from building an enormous transaction.
 */
const MAX_REORDER_IDS = 500;

/**
 * PUT /api/admin/content/home-page-sections/reorder — rewrite one locale's
 * running order in a single transaction.
 *
 * Body: `{ locale: "KA" | "EN", ids: string[] }`. `ids` is the new order,
 * first to last; every id must be a row of that locale. Rows the list leaves
 * out (the admin may omit chrome or the pinned section) keep their relative
 * order and are placed after the listed ones. Every row is renumbered to its
 * index, so the locale comes out with a dense `0..n-1` order and no ties.
 *
 * Replaces the drag-and-drop's would-be N sequential `PATCH { sortOrder }`
 * calls, which could leave the page half-reordered if one failed.
 */
export async function PUT(request: Request): Promise<NextResponse> {
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

  const { ids } = body.record;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_REORDER_IDS ||
    !ids.every((id) => typeof id === "string" && id !== "") ||
    new Set(ids).size !== ids.length
  ) {
    return NextResponse.json(
      { error: t("errors.adminContentHomePageSections.idsMustBeDistinctIds") },
      { status: 400 },
    );
  }

  const orderedIds = ids as string[];
  const rows = await listLocaleSections(locale.value);
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  // A 409 rather than a 400: the request is well-formed, but it describes a
  // list that no longer matches the database (a row deleted, or moved to the
  // other locale, in another tab). The admin should reload, not retry.
  if (!orderedIds.every((id) => rowsById.has(id))) {
    return NextResponse.json(
      {
        error: t("errors.adminContentHomePageSections.idsMustBelongToLocale", {
          locale: locale.value,
        }),
      },
      { status: 409 },
    );
  }

  const listed = new Set(orderedIds);
  const finalOrder = [
    ...orderedIds,
    ...rows.filter((row) => !listed.has(row.id)).map((row) => row.id),
  ];

  // Only rows whose position actually changes are written.
  const moves = finalOrder.flatMap((id, index) => {
    const row = rowsById.get(id);
    return row !== undefined && row.sortOrder !== index
      ? [{ id, from: row.sortOrder, to: index }]
      : [];
  });

  if (moves.length > 0) {
    // The array form: nothing is read inside the transaction, so it needs no
    // interactive session, and it runs on a transaction-mode pooler.
    await prisma.$transaction(
      moves.map((move) =>
        prisma.homePageSection.update({
          where: { id: move.id },
          data: { sortOrder: move.to },
          select: { id: true },
        }),
      ),
    );

    await writeAuditLog({
      actorId: authorized.context.actorId,
      action: "home_page_section.bulk_reorder",
      entityType: "HomePageSection",
      metadata: {
        locale: locale.value,
        order: finalOrder,
        moves,
      },
    });

    revalidateHomePage();
  }

  return NextResponse.json(await bulkResponseBody(locale.value), {
    status: 200,
  });
}
