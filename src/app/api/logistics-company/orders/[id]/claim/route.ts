import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { ORDER_PARTY_SELECT } from "@/lib/order-response-select";
import {
  capabilityOf,
  loadFits,
  widestCapability,
  type LoadDimensions,
} from "@/lib/orders/vehicle-fit";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/logistics-company/orders/[id]/claim — a logistics company takes an
 * open delivery off the market (PENDING → CLAIMED) without yet naming a driver
 * or a vehicle; that happens at dispatch.
 *
 * The claim mirrors the driver-accept path: a single conditional `updateMany`
 * (status PENDING and no company in the `where`) rather than a read-then-write,
 * so two companies racing for the same order can't both succeed — the database
 * applies at most one update and `count` tells us whether this request won.
 *
 * No body: which vehicle fulfils the order is a dispatch decision, and pinning
 * one at claim time would only go stale while the order waits.
 *
 * This is also the load board's company claim path — deliberately extended in
 * place rather than duplicated into a board-specific endpoint. It already
 * performs the exact operation the board needs (atomic PENDING → CLAIMED,
 * `companyId` set, no vehicle named), and a second implementation of one atomic
 * transition would be two things to keep in sync forever for a distinction —
 * called from the board versus called from anywhere else — that does not change
 * what the operation does. Nothing about its existing 401/403/400/404/409
 * behaviour for non-board callers changed.
 *
 * `status === "CLAIMED"` *is* the "needs assignment" state the board's My Loads
 * view shows; no new column or status value is needed for it, because a claimed
 * order always has `companyId` set and `driverId` still null until dispatch.
 *
 * The success response deliberately omits `Order.price`. See the select at the
 * bottom of this handler for why.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can claim deliveries." },
      { status: 403 },
    );
  }

  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true, activatedAt: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Complete your company profile before claiming deliveries." },
      { status: 400 },
    );
  }

  // The same activation gate the dispatch endpoint applies, for the same reason:
  // `LogisticsCompany.activatedAt` is the single "is this fleet allowed on the
  // road" column, and hiding a button does nothing about a direct POST.
  //
  // Gating claim as well as dispatch is not belt-and-braces. A claim takes an
  // order *off the open market* into CLAIMED, where only its claimant can act on
  // it. A company that could claim but not dispatch would strand real deliveries
  // in a status nobody can move — worse than either gate on its own.
  if (company.activatedAt === null) {
    return NextResponse.json(
      {
        error:
          "Your fleet is still under review. Operations must activate the company before you can claim deliveries.",
      },
      { status: 403 },
    );
  }

  // Distinguish "no such order" (404) from "already taken / not pending" (409):
  // the conditional update alone can't tell them apart, so check existence first.
  //
  // `reference` is read here so the 409 below can name the load for the board's
  // dedicated "just claimed" dialog. Reading it from this pre-claim lookup
  // rather than re-querying after a failed `updateMany` is correct, not stale:
  // `reference` never changes after the order is created. The cargo columns feed
  // the physical fit re-check below.
  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      vehicleTypeSpecId: true,
      cargoWeightKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Claiming a job the fleet cannot physically take would strand it in CLAIMED
  // with no dispatchable vehicle, so the type match is checked up front — the
  // same rule the dispatch endpoint then re-checks against the chosen vehicle.
  //
  // `findMany`, not `findFirst`: the fit re-check below now resolves each
  // vehicle's OWN driver-declared capacity (spec as the per-field fallback), and
  // two trucks of the same class no longer necessarily resolve to the same
  // figures — the assumption a single-row lookup rested on. Both capacity
  // sources are selected for that reason.
  const matchingVehicles = await prisma.vehicle.findMany({
    where: {
      companyId: company.id,
      vehicleTypeSpecId: existing.vehicleTypeSpecId,
    },
    select: {
      payloadKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
      vehicleTypeSpec: {
        select: {
          maxPayloadKg: true,
          cargoLengthM: true,
          cargoWidthM: true,
          cargoHeightM: true,
        },
      },
    },
  });

  // `widestCapability` returns null for an empty fleet and only for an empty
  // fleet, so the "no vehicle of the required type" 400 and the capability the
  // fit check needs fall out of one expression rather than two checks that could
  // drift apart. The refusal itself is unchanged, wording included.
  const fleetCapability = widestCapability(
    matchingVehicles.map((vehicle) =>
      capabilityOf(vehicle, vehicle.vehicleTypeSpec),
    ),
  );

  if (fleetCapability === null) {
    return NextResponse.json(
      {
        error: "Your fleet has no vehicle of the type this delivery requires.",
      },
      { status: 400 },
    );
  }

  // A second, independent check alongside the type match above. The board
  // applies its own physical fit filter at listing time, but that filter runs
  // against a snapshot: the load could be re-weighed, the fleet could change, or
  // a caller could hit this endpoint directly and bypass the board entirely. A
  // listing is a snapshot; this request is what commits, so fit is re-checked
  // here.
  //
  // **`capabilityOf` + `widestCapability` + `loadFits` from
  // `src/lib/orders/vehicle-fit.ts`, the same trio `GET /api/loads` filters a
  // company's board with — deliberately the one and only definition of "fits" in
  // the codebase.** This route previously carried its own copy that measured the
  // load against `VehicleTypeSpec` alone, and that divergence was not academic:
  // `model Vehicle` in `prisma/schema.prisma` records a submit-time check
  // forcing a declared `payloadKg` to be at or above its class spec's
  // `maxPayloadKg` (read that block for the current, authoritative statement of
  // what these columns mean — it is amended as their use grows, so it is pointed
  // at here rather than quoted). Declared capacity is therefore systematically
  // at or above the spec, so a spec-only re-check is systematically stricter
  // than the board: a dispatcher clicks Claim on a load the board showed them
  // and gets a 400. One shared predicate is the only way that stays fixed.
  //
  // `widestCapability` is the per-axis maximum across the type-matching trucks,
  // and is knowingly optimistic in the same way the board is — see its own doc
  // comment. That optimism is right for a claim: the company names a real
  // vehicle at dispatch and sees any mismatch there, at a desk, before anything
  // rolls. Being *stricter* than the board is the failure that costs a
  // dispatcher a refusal on a load they were just offered.
  //
  // **The null pre-check is a deliberate asymmetry with the listing, not an
  // oversight.** `loadFits` resolves a null load dimension to "does not fit",
  // which is right for a *listing* — hiding a load of unknown size costs nobody
  // anything, while committing a fleet to one that turns out not to fit strands
  // the order in CLAIMED. It is wrong for *this* route, which is also the legacy
  // claim path: it predates cargo capture and has always claimed orders with
  // null weight and dimensions, and applying the listing's rule here would make
  // every one of those orders permanently unclaimable by the same endpoint that
  // has always claimed them. So an order with no declared cargo AT ALL skips the
  // check (nothing to measure), and an order that declares any cargo is measured
  // by `loadFits` exactly as the board measures it — including its all-or-
  // nothing rule, under which a partially declared load does not fit. That case
  // cannot strand a board user, because the board never lists such a load either.
  const declaredCargo: LoadDimensions = {
    weightKg: existing.cargoWeightKg,
    lengthM: existing.cargoLengthM,
    widthM: existing.cargoWidthM,
    heightM: existing.cargoHeightM,
  };

  const hasDeclaredCargo =
    declaredCargo.weightKg !== null ||
    declaredCargo.lengthM !== null ||
    declaredCargo.widthM !== null ||
    declaredCargo.heightM !== null;

  if (hasDeclaredCargo && !loadFits(declaredCargo, fleetCapability)) {
    return NextResponse.json(
      {
        error:
          "Your fleet's vehicles of this type can't carry this load's cargo — it exceeds the weight or size limit.",
      },
      { status: 400 },
    );
  }

  // Atomic claim: only rows that are still PENDING and unclaimed are updated.
  const { count } = await prisma.order.updateMany({
    where: { id, status: OrderStatus.PENDING, companyId: null },
    data: { companyId: company.id, status: OrderStatus.CLAIMED },
  });

  // Losing the race is the one failure a well-behaved concurrent client has to
  // branch on, so it carries a machine-readable `code` and the load's
  // `reference` — the board's dedicated "just claimed by someone else" dialog
  // names the load, and a cuid is not something a dispatcher can recognise. The
  // other failures on this route keep their plain `{ error }` shape: only the
  // responses a client actually branches on get a `code`.
  if (count === 0) {
    return NextResponse.json(
      {
        error: "This load was just claimed by someone else.",
        code: "ALREADY_CLAIMED",
        reference: existing.reference,
      },
      { status: 409 },
    );
  }

  // `price` is what the CLIENT pays and must never reach a board-facing surface;
  // `driverPayout` (the 85% share stored on the order at creation) is the only
  // money figure the board may show — the board has no role-specific UI, so a
  // company sees exactly what a driver sees. `ORDER_PARTY_SELECT` includes
  // `price`: correct for the lifecycle endpoints it was written for, wrong here.
  //
  // Spread-and-override rather than a hand-listed select: this stays in step
  // with `ORDER_PARTY_SELECT` as that constant grows new fields, while
  // guaranteeing `price` specifically can never be one of them. `handlingTags`
  // is added so the confirm dialog can warn about a HAZMAT load — a warning
  // only: `DriverLicence` has no certification field anywhere in the schema, so
  // nothing here gates a hazmat claim, and nothing should until that field and
  // the onboarding capture behind it exist.
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      ...ORDER_PARTY_SELECT,
      price: false,
      driverPayout: true,
      reference: true,
      handlingTags: true,
    },
  });
  return NextResponse.json(order, { status: 200 });
}
