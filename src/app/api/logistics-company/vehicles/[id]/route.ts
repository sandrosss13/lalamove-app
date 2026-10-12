import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteVehiclePhotos } from "@/lib/supabase-storage";
import { parseTrailerPlate } from "@/lib/vehicles/trailer-plate";

/**
 * PATCH /api/logistics-company/vehicles/[id] — set or clear the trailer plate
 * of one of the signed-in company's fleet vehicles.
 *
 * Body: JSON `{ "trailerPlateNumber": string | null }`. A blank string or null
 * clears it; otherwise it is trimmed, validated (2–15 of `[A-Za-z0-9- ]`) and
 * stored upper-cased. The key must be present so an empty body is not mistaken
 * for "clear". Returns `{ id, trailerPlateNumber }`.
 *
 * Same ownership rule as DELETE: another company's vehicle is 404, not 403.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      {
        error: t(
          "errors.logisticsCompanyVehicles.onlyLogisticsCompaniesCanEditFleet",
        ),
      },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("trailerPlateNumber" in body)
  ) {
    return NextResponse.json(
      { error: t("errors.logisticsCompanyVehicles.trailerPlateInvalid") },
      { status: 400 },
    );
  }

  const trailerPlate = parseTrailerPlate(
    (body as { trailerPlateNumber: unknown }).trailerPlateNumber,
  );
  if ("error" in trailerPlate) {
    return NextResponse.json(
      { error: t("errors.logisticsCompanyVehicles.trailerPlateInvalid") },
      { status: 400 },
    );
  }

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: t("common.shared.vehicleNotFound") },
      { status: 404 },
    );
  }

  // Ownership is part of the write's `where`, so another company's vehicle
  // (or an independent driver's) matches nothing.
  const result = await prisma.vehicle.updateMany({
    where: { id, companyId: company.id },
    data: { trailerPlateNumber: trailerPlate.value },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: t("common.shared.vehicleNotFound") },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { id, trailerPlateNumber: trailerPlate.value },
    { status: 200 },
  );
}

/**
 * DELETE /api/logistics-company/vehicles/[id] — retire one of the signed-in
 * company's fleet vehicles.
 *
 * Ownership is part of the lookup, and a vehicle belonging to someone else is
 * reported as 404 rather than 403: a 403 would confirm that the id exists,
 * letting a caller enumerate other companies' vehicles.
 *
 * The database row is the source of truth, so the Storage objects are deleted
 * best-effort afterwards — a failure there is logged and the request still
 * succeeds, leaving at worst an orphaned file.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      {
        error: t(
          "errors.logisticsCompanyVehicles.onlyLogisticsCompaniesCanRemoveFleet",
        ),
      },
      { status: 403 },
    );
  }

  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: t("common.shared.vehicleNotFound") },
      { status: 404 },
    );
  }

  // Scoped by owner, so this returns nothing for another company's vehicle —
  // or for a vehicle owned by an independent driver.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, companyId: company.id },
    select: { id: true, photoUrls: true },
  });

  if (!vehicle) {
    return NextResponse.json(
      { error: t("common.shared.vehicleNotFound") },
      { status: 404 },
    );
  }

  await prisma.vehicle.delete({ where: { id: vehicle.id } });

  await deleteVehiclePhotos(vehicle.photoUrls).catch((error: unknown) => {
    console.error("Failed to delete vehicle photos from Storage:", error);
  });

  return NextResponse.json({ id: vehicle.id }, { status: 200 });
}
