import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/logistics-company/drivers/[userId] — remove a driver from the
 * signed-in company's roster.
 *
 * This only clears the link: the driver keeps their account, profile and
 * vehicles, and simply becomes independent again (which is why the relation is
 * `SetNull` rather than `Cascade`).
 *
 * Membership is part of the lookup, and a driver on someone else's roster is
 * reported as 404 rather than 403 — a 403 would confirm the account exists,
 * turning this into a membership oracle.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can remove drivers." },
      { status: 403 },
    );
  }

  const { userId } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  }

  // Scoped by roster membership, so this returns nothing for a driver who is
  // independent or belongs to another company.
  const driverProfile = await prisma.driverProfile.findFirst({
    where: { userId, companyId: company.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  }

  await prisma.driverProfile.update({
    where: { id: driverProfile.id },
    data: { companyId: null },
  });

  return NextResponse.json({ userId }, { status: 200 });
}
