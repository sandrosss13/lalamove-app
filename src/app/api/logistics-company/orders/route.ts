import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The columns `GET` reads back, and the only ones it may return.
 *
 * The *absence* of a select is what made this endpoint leak: a `findMany`
 * carrying only a `where` returns every column of `Order`, so each column added
 * to the model silently joined the response — which is how a client's stop
 * contacts and their finance team's purchase-order reference ended up in the
 * open, unclaimed jobs any company with one matching vehicle can list. Naming
 * the fields means a column added later cannot start leaking through this
 * response by accident; anything new belongs here deliberately or not at all,
 * and this list must stay.
 *
 * `savedCardId` and `purchaseOrderRef` are deliberately absent and must stay
 * absent: one is the client's chosen payment instrument, the other their finance
 * team's internal reference, and no consumer of a dispatch board has any
 * business with either. The six stop-contact columns *are* selected, because a
 * company running a job it has claimed does need them, and are then withheld per
 * row — see `canSeeStopContacts`.
 *
 * The list mirrors the fields the company-facing job surfaces actually render
 * (`getHubJobs` in `src/lib/dashboard/hub/jobs.ts`: addresses, the payout, crew
 * size, the lifecycle timestamps, service level and body type), widened to the
 * identifiers the dispatch actions need (`clientId`, `companyId`, `driverId`,
 * `vehicleId`, `vehicleTypeSpecId`). Relations are not selected because the
 * handler never included any; this list is the scalar row and nothing more.
 *
 * **No client money is in this list, and none may be added.** It used to carry
 * `baseFare`, `distanceFare`, `timeFare`, `helperFee`, `overtimeFee`, `price`
 * and `serviceLevelAdjustment`; all seven are gone, replaced by `driverPayout`
 * and `overtimeDriverPayout`. *"Driver should see only its net, not total
 * paid"* — and a logistics company is under that rule, not outside it. A company
 * is the job's **fulfilling party**, the carrier, not the client: the platform
 * takes its cut of what the client paid and pays the rest to whoever carries the
 * load, company or independent driver alike, so a company's own revenue is its
 * commissioned payout. There is no separate company revenue model in this
 * codebase to decide otherwise with — a `BUSINESS` account renders its earnings
 * through the very same `src/lib/dashboard/hub/earnings.ts` a driver does. A
 * company has no more claim on the client's gross quote than a subcontractor has
 * on what the general contractor billed.
 *
 * The seven had to leave *together*, which is why this is a shape and not a
 * per-field judgement: `price` is `baseFare + distanceFare + timeFare +
 * helperFee` floored at the pricing rule's `minimumFare`, so dropping `price`
 * while keeping its components would withhold nothing at all.
 *
 * Unlike the lifecycle endpoints, which share
 * `CARRIER_ORDER_PARTY_SELECT` in `src/lib/order-response-select.ts` (read that
 * constant's comment for the full reasoning, including why money redaction omits
 * where contact redaction nulls), this constant is corrected in place rather
 * than given a redacted sibling: it has exactly one consumer — this file's own
 * `GET` — and no client branch to preserve, so there is no second audience for
 * an unredacted version to serve.
 */
const COMPANY_ORDER_LIST_SELECT = {
  id: true,
  cargoCategory: true,
  description: true,
  bodyType: true,
  helperCount: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  distanceKm: true,
  driverPayout: true,
  overtimeDriverPayout: true,
  serviceLevel: true,
  vehicleTypeSpecId: true,
  status: true,
  clientId: true,
  companyId: true,
  driverId: true,
  vehicleId: true,
  paymentMethodType: true,
  inTransitAt: true,
  completedAt: true,
  waitingMinutes: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Whether the requesting company may see one order's stop contacts.
 *
 * A stop contact is a named person and their phone number, collected so that
 * whoever turns up knows who to ask for. A company earns them when it takes
 * responsibility for the job — that is, when the order is its own. The open,
 * unclaimed PENDING work this endpoint also lists belongs to nobody yet: a
 * company browsing it has committed to nothing and is entitled to nothing beyond
 * where the job goes and what it pays. The contacts become theirs when the job
 * does, at claim time.
 */
function canSeeStopContacts(
  order: { companyId: string | null },
  companyId: string,
): boolean {
  return order.companyId === companyId;
}

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
 *
 * Every row is trimmed to `COMPANY_ORDER_LIST_SELECT`, and the stop contacts
 * within it are returned as `null` on any row the company has not claimed, so an
 * open job in a dispatch board never carries the client's name and phone number.
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
    select: COMPANY_ORDER_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });

  // Redacted here rather than in the query because the entitlement is per row,
  // not per request: this listing deliberately mixes orders the company has
  // claimed, whose contacts its dispatchers need, with open work it has not,
  // whose contacts it must not have. Expressing that in the `where` would mean
  // two queries and a merge to restore the ordering, for a result this mapping
  // gives exactly. The keys are nulled rather than dropped so every row keeps the
  // same shape for the consuming UI.
  const visibleOrders = orders.map((order) =>
    canSeeStopContacts(order, company.id)
      ? order
      : {
          ...order,
          pickupContactName: null,
          pickupContactPhone: null,
          pickupContactDetails: null,
          dropoffContactName: null,
          dropoffContactPhone: null,
          dropoffContactDetails: null,
        },
  );

  return NextResponse.json(visibleOrders, { status: 200 });
}
