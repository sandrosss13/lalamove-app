import { NextResponse } from "next/server";

import type {
  AdminRole,
  CargoCategory,
  CargoHandlingTag,
  ChassisType,
  ItemCatalogEntry,
  ItemGroup,
  Prisma,
} from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

import { parseUpdateItemBody, type ItemCatalogueFields } from "../validation";

/**
 * Staff who may read and write the item catalogue. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * The wire shape of an entry, restated from the collection route rather than
 * imported: a `route.ts` is a Next.js entry point, and importing runtime values
 * across two of them would tie their build-time contracts together. Only the
 * *type* is shared, and it is re-declared here as the response body's type.
 */
type AdminItemCatalogueRow = {
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
 * The values of just the fields a patch touched, before or after it. Recorded
 * rather than the whole row so the trail says what this specific edit did, and
 * with both sides so a mistuned figure can be put back from the log alone.
 */
function pickFields(
  entry: ItemCatalogEntry,
  fields: readonly (keyof ItemCatalogueFields)[],
): Prisma.InputJsonObject {
  return Object.fromEntries(fields.map((field) => [field, entry[field]]));
}

/**
 * The audit action for a patch. A patch that only flips `active` is the
 * table's deactivate/reactivate toggle, and gets its own verb so the trail
 * can be searched for "who hid this item" without reading every edit.
 */
function auditAction(
  changed: readonly (keyof ItemCatalogueFields)[],
  active: boolean,
): string {
  if (changed.length === 1 && changed[0] === "active") {
    return active
      ? "item_catalogue_entry.reactivate"
      : "item_catalogue_entry.deactivate";
  }

  return "item_catalogue_entry.update";
}

/**
 * PATCH /api/admin/content/item-catalogue/[code] — edit an entry, in whole or
 * in part.
 *
 * Partial by design: the edit dialog sends every field, while the table's
 * active toggle sends only `active`, and both are the same request here.
 * Keyed by `code` rather than `id` because the code is the entry's stable,
 * human-readable identity, and it can never change after create.
 *
 * There is deliberately no `DELETE` beside this. `OrderItem` rows snapshot
 * their figures and would survive a delete, but deactivating keeps the code
 * reserved — goods shortcuts and reporting key on it, and a recreated row
 * reusing it would quietly merge two different items in every report.
 */
export async function PATCH(
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

  // Read before write so a missing code is a clean 404 rather than a Prisma
  // "record not found" exception, and so the length ≥ width check can see the
  // figure this patch does not carry, and the audit entry the old values.
  const existing = await prisma.itemCatalogEntry.findUnique({
    where: { code },
  });

  if (!existing) {
    return NextResponse.json(
      { error: t("admin.itemCatalogueValidation.itemNotFound") },
      { status: 404 },
    );
  }

  const parsed = parseUpdateItemBody(rawBody, existing);
  if ("error" in parsed) {
    return NextResponse.json(
      { error: t(parsed.error.key, parsed.error.values) },
      { status: 400 },
    );
  }

  const entry = await prisma.itemCatalogEntry.update({
    where: { code },
    data: parsed.data,
  });

  const changed = Object.keys(parsed.data) as (keyof ItemCatalogueFields)[];

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: auditAction(changed, entry.active),
    entityType: "ItemCatalogEntry",
    entityId: entry.id,
    metadata: {
      code: entry.code,
      changed,
      before: pickFields(existing, changed),
      after: pickFields(entry, changed),
    },
  });

  return NextResponse.json({ item: toItemRow(entry) }, { status: 200 });
}
