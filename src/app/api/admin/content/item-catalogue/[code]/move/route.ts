import { NextResponse } from "next/server";

import { Prisma, type AdminRole } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

import { parseMoveBody, planCatalogueMove } from "../../validation";

/**
 * Staff who may read and write the item catalogue. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * POST /api/admin/content/item-catalogue/[code]/move — move an entry one step
 * up or down within its group. Body: `{ direction: "up" | "down", scope?:
 * "all" | "active" }`, where `scope: "active"` steps past deactivated entries
 * the admin has filtered out of view.
 *
 * Its own endpoint rather than a `sortOrder` in the `PATCH`, because a move
 * rewrites the whole group: every entry is renumbered 10, 20, 30, … (see
 * `planCatalogueMove`), which is how seeded or hand-typed ties get resolved
 * instead of making a swap a no-op. Buttons, not drag-and-drop, as specified.
 *
 * Read and written in one transaction so two admins moving items in the same
 * group at once cannot interleave into a half-renumbered group.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();

  const { code } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseMoveBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json(
      { error: t(parsed.error.key, parsed.error.values) },
      { status: 400 },
    );
  }

  const { direction, scope } = parsed.data;

  let outcome;
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        const target = await tx.itemCatalogEntry.findUnique({
          where: { code },
          select: { id: true, group: true },
        });

        if (!target) {
          return { kind: "not-found" as const };
        }

        const group = await tx.itemCatalogEntry.findMany({
          where: { group: target.group },
          select: { code: true, sortOrder: true, active: true },
        });

        const changes = planCatalogueMove(group, code, direction, scope);

        // Already first or last: a successful no-op rather than an error, the
        // same answer a double-click on a disabled-too-late button should get.
        if (changes === null) {
          return { kind: "unchanged" as const, target };
        }

        for (const change of changes) {
          await tx.itemCatalogEntry.update({
            where: { code: change.code },
            data: { sortOrder: change.to },
          });
        }

        return { kind: "moved" as const, target, changes };
      },
      // Serializable so a concurrent move in the same group fails rather than
      // renumbering from a stale read; the losing admin is told to try again.
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return NextResponse.json(
        { error: t("admin.itemCatalogueValidation.moveConflict") },
        { status: 409 },
      );
    }

    throw error;
  }

  if (outcome.kind === "not-found") {
    return NextResponse.json(
      { error: t("admin.itemCatalogueValidation.itemNotFound") },
      { status: 404 },
    );
  }

  if (outcome.kind === "moved" && outcome.changes.length > 0) {
    await writeAuditLog({
      actorId: authorized.context.actorId,
      action: "item_catalogue_entry.reorder",
      entityType: "ItemCatalogEntry",
      entityId: outcome.target.id,
      // Every renumbered row, not only the one moved, with its old and new
      // `sortOrder`: a move rewrites the group, so the before/after is the
      // group's.
      metadata: {
        code,
        group: outcome.target.group,
        direction,
        scope,
        before: Object.fromEntries(
          outcome.changes.map((change) => [change.code, change.from]),
        ),
        after: Object.fromEntries(
          outcome.changes.map((change) => [change.code, change.to]),
        ),
      },
    });
  }

  return NextResponse.json(
    { code, moved: outcome.kind === "moved" },
    { status: 200 },
  );
}
