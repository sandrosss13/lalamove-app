import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/logistics-company/orders — the deliveries a company can act on: the
 * open ones it could claim, plus every order it has already claimed or
 * dispatched, whatever their status. Newest first.
 *
 * "Could claim" means the company owns at least one vehicle of the type the
 * order asks for — the same rule the claim endpoint enforces, so the list never
 * offers a job the claim would then reject.
 *
 * A company that hasn't created its profile yet owns no fleet and no orders,
 * which is an empty list rather than an error (matching the fleet and roster
 * endpoints).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can dispatch deliveries." },
      { status: 403 },
    );
  }

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json([], { status: 200 });
  }

  const fleet = await prisma.vehicle.findMany({
    where: { companyId: company.id },
    select: { vehicleTypeSpecId: true },
  });

  // An order can only be taken in a vehicle of the type it asks for, so the
  // distinct set of fleet types is what the open-job list is filtered by.
  const fleetVehicleTypeSpecIds = [
    ...new Set(fleet.map((vehicle) => vehicle.vehicleTypeSpecId)),
  ];

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        {
          status: OrderStatus.PENDING,
          companyId: null,
          vehicleTypeSpecId: { in: fleetVehicleTypeSpecIds },
        },
        { companyId: company.id },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orders, { status: 200 });
}
