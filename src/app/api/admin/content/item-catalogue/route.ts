import { NextResponse } from "next/server";

import {
  Prisma,
  type AdminRole,
  type CargoCategory,
  type CargoHandlingTag,
  type ChassisType,
  type ItemCatalogEntry,
  type ItemGroup,
} from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

import { nextSortOrder, parseCreateItemBody } from "./validation";

/**
 * Staff who may read and write the item catalogue. The same pair as every
 * other content route: the catalogue's labels and figures are content an
 * editor tunes, like banners and vehicle photos. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * One catalogue entry as the admin table and form render it. Timestamps are ISO
 * strings because this crosses the wire; the page and the dialog import this
 * type (type-only, so nothing of this server module reaches the browser) rather
 * than restating the shape, which is what keeps them from drifting.
 */
export type AdminItemCatalogueRow = {
  id: string;
  code: string;
  group: ItemGroup;
  labelEn: string;
  labelKa: string;
  synonymsEn: string[];
  synonymsKa: string[];
  weightKg: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  stackable: boolean;
  needsTwoPeople: boolean;
  requiredBody: ChassisType | null;
  handlingTags: CargoHandlingTag[];
  cargoCategory: CargoCategory;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Body of `GET /api/admin/content/item-catalogue`. */
export type AdminItemCatalogueListResponse = {
  items: AdminItemCatalogueRow[];
};

/** Body of `POST /api/admin/content/item-catalogue` and the `PATCH` beside it. */
export type AdminItemCatalogueResponse = {
  item: AdminItemCatalogueRow;
};

/**
 * Serializes a row for the wire. Shared shape with the `[code]` routes, which
 * restate it rather than importing from here: a `route.ts` is a Next.js entry
 * point, and exporting runtime values out of one for another module to consume
 * makes the routes' build-time contracts depend on each other.
 */
function toItemRow(entry: ItemCatalogEntry): AdminItemCatalogueRow {
  return {
    id: entry.id,
    code: entry.code,
    group: entry.group,
    labelEn: entry.labelEn,
    labelKa: entry.labelKa,
    synonymsEn: entry.synonymsEn,
    synonymsKa: entry.synonymsKa,
    weightKg: entry.weightKg,
    lengthM: entry.lengthM,
    widthM: entry.widthM,
    heightM: entry.heightM,
    stackable: entry.stackable,
    needsTwoPeople: entry.needsTwoPeople,
    requiredBody: entry.requiredBody,
    handlingTags: entry.handlingTags,
    cargoCategory: entry.cargoCategory,
    sortOrder: entry.sortOrder,
    active: entry.active,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

/**
 * True when `error` is the unique violation on `code` — the only unique
 * constraint on the table besides the primary key, so any P2002 here is that
 * one. Caught as well as pre-checked: two admins creating the same code at once
 * both pass the read below.
 */
function isDuplicateCodeError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * GET /api/admin/content/item-catalogue — every entry, active or not, in the
 * order the editor groups them: by group, then `sortOrder`, then code.
 *
 * Unpaginated on purpose. The catalogue is a few dozen hand-curated rows, and
 * the editor's whole job is showing each group's running order, which paging
 * would cut in half. The active filter is applied in the page, which needs the
 * inactive rows anyway to reorder around them.
 */
export async function GET(): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const entries = await prisma.itemCatalogEntry.findMany({
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
  });

  const body: AdminItemCatalogueListResponse = {
    items: entries.map(toItemRow),
  };

  return NextResponse.json(body, { status: 200 });
}

/**
 * POST /api/admin/content/item-catalogue — add one entry.
 *
 * A blank `sortOrder` puts the entry after the last one in its group, which is
 * what an admin adding an item almost always means; the up/down buttons move
 * it from there.
 */
export async function POST(request: Request): Promise<NextResponse> {
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

  const parsed = parseCreateItemBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json(
      { error: t(parsed.error.key, parsed.error.values) },
      { status: 400 },
    );
  }

  const { sortOrder, ...fields } = parsed.data;

  // A 409 rather than a 400: the body is valid, the conflict is with a row
  // already in the table — possibly a deactivated one, whose code stays
  // reserved for good (see the model doc).
  const duplicate = await prisma.itemCatalogEntry.findUnique({
    where: { code: fields.code },
    select: { id: true },
  });

  if (duplicate) {
    return NextResponse.json(
      {
        error: t("admin.itemCatalogueValidation.codeTaken", {
          code: fields.code,
        }),
      },
      { status: 409 },
    );
  }

  let resolvedSortOrder = sortOrder;
  if (resolvedSortOrder === null) {
    const siblings = await prisma.itemCatalogEntry.findMany({
      where: { group: fields.group },
      select: { sortOrder: true },
    });
    resolvedSortOrder = nextSortOrder(siblings.map((row) => row.sortOrder));
  }

  let entry: ItemCatalogEntry;
  try {
    entry = await prisma.itemCatalogEntry.create({
      data: { ...fields, sortOrder: resolvedSortOrder },
    });
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return NextResponse.json(
        {
          error: t("admin.itemCatalogueValidation.codeTaken", {
            code: fields.code,
          }),
        },
        { status: 409 },
      );
    }

    throw error;
  }

  const row = toItemRow(entry);

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "item_catalogue_entry.create",
    entityType: "ItemCatalogEntry",
    entityId: entry.id,
    // Before/after on every catalogue mutation, as the task asks; a create has
    // no before. Timestamps are left out — the audit row carries its own.
    metadata: {
      code: entry.code,
      before: null,
      after: auditSnapshot(row),
    },
  });

  const body: AdminItemCatalogueResponse = { item: row };

  return NextResponse.json(body, { status: 201 });
}

/** Row fields an audit entry needs no copy of: the audit row has its own. */
const AUDIT_OMITTED_FIELDS = new Set(["id", "createdAt", "updatedAt"]);

/** A row minus the fields an audit entry needs no copy of. */
function auditSnapshot(row: AdminItemCatalogueRow): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(row).filter(([field]) => !AUDIT_OMITTED_FIELDS.has(field)),
  ) as Prisma.InputJsonObject;
}
