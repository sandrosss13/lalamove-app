import { NextResponse } from "next/server";

import type { AdminRole, VehicleCategory } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import type { AdminVehiclePhotoListResponse } from "@/app/api/admin/content/vehicle-photos/route";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { revalidateHomePage } from "@/lib/admin/home-page-data";
import { listAdminVehiclePhotoRows } from "@/lib/admin/vehicle-photos";
import { prisma } from "@/lib/prisma";
import { planVehicleReorder } from "@/lib/vehicle-homepage-display";

/**
 * Staff who may order the homepage vehicle catalogue. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/** The duty classes a request may name — `VehicleCategory`'s values. */
const CATEGORIES: readonly VehicleCategory[] = ["MEDIUM_DUTY", "HEAVY_DUTY"];

function isVehicleCategory(value: unknown): value is VehicleCategory {
  return (
    typeof value === "string" &&
    (CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * PUT /api/admin/content/vehicle-photos/reorder — rewrite one duty class's
 * homepage order in a single transaction.
 *
 * Body: `{ category: "MEDIUM_DUTY" | "HEAVY_DUTY", ids: string[] }`. `ids` is
 * the new order, first to last; every id must be a vehicle type of that
 * category. Types the list leaves out keep their relative order and are placed
 * after the listed ones. Every type of the category is renumbered to its index,
 * so it comes out with a dense `0..n-1` `homepageSortOrder` and no ties.
 *
 * Homepage only: the signed-in booking form keeps its own cheapest-first order
 * and never reads `homepageSortOrder`.
 *
 * Responds with the full list (`{ items }`, as the list `GET`), so the page can
 * adopt the server's order without a second request.
 */
export async function PUT(request: Request): Promise<NextResponse> {
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

  if (
    typeof rawBody !== "object" ||
    rawBody === null ||
    Array.isArray(rawBody)
  ) {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeAJson") },
      { status: 400 },
    );
  }

  const record = rawBody as Record<string, unknown>;

  if (!isVehicleCategory(record.category)) {
    return NextResponse.json(
      { error: t("errors.adminContentVehiclePhotos.categoryInvalid") },
      { status: 400 },
    );
  }

  const category = record.category;

  const rows = await prisma.vehicleTypeSpec.findMany({
    where: { category },
    // The category's current homepage order, so unlisted rows keep theirs.
    orderBy: [{ homepageSortOrder: "asc" }, { label: "asc" }],
    select: { id: true, code: true, homepageSortOrder: true },
  });

  const plan = planVehicleReorder(rows, record.ids);

  if (!plan.ok && plan.reason === "invalid_ids") {
    return NextResponse.json(
      { error: t("errors.adminContentVehiclePhotos.idsMustBeDistinctIds") },
      { status: 400 },
    );
  }

  // A 409 rather than a 400: the request is well-formed, but it describes a
  // list that no longer matches the database (a type re-seeded or moved to the
  // other category). The admin should reload, not retry.
  if (!plan.ok) {
    return NextResponse.json(
      { error: t("errors.adminContentVehiclePhotos.idsMustBelongToCategory") },
      { status: 409 },
    );
  }

  if (plan.moves.length > 0) {
    // The array form: nothing is read inside the transaction, so it needs no
    // interactive session, and it runs on a transaction-mode pooler.
    await prisma.$transaction(
      plan.moves.map((move) =>
        prisma.vehicleTypeSpec.update({
          where: { id: move.id },
          data: { homepageSortOrder: move.to },
          select: { id: true },
        }),
      ),
    );

    const codeById = new Map(rows.map((row) => [row.id, row.code]));

    await writeAuditLog({
      actorId: authorized.context.actorId,
      action: "vehicle_type.homepage_reorder",
      entityType: "VehicleTypeSpec",
      metadata: {
        category,
        // Codes rather than cuids: that is the identity a reader of the log
        // reasons about.
        order: plan.order.map((id) => codeById.get(id) ?? id),
        moves: plan.moves.map((move) => ({
          ...move,
          code: codeById.get(move.id) ?? null,
        })),
      },
    });

    // Belt-and-braces: the landing sections read the uncached
    // `GET /api/vehicle-types` client-side, but no cached homepage render
    // should outlive the change either.
    revalidateHomePage();
  }

  const body: AdminVehiclePhotoListResponse = {
    items: await listAdminVehiclePhotoRows(),
  };

  return NextResponse.json(body, { status: 200 });
}
