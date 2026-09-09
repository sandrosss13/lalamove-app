import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { CARRIER_ORDER_PARTY_SELECT } from "@/lib/order-response-select";
import { driverPayoutFor } from "@/lib/orders/payout";
import { prisma } from "@/lib/prisma";

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 */
function parseCompleteOrderBody(
  body: unknown,
): { data: { waitingMinutes: number } } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const { waitingMinutes } = body as Record<string, unknown>;

  if (
    typeof waitingMinutes !== "number" ||
    !Number.isInteger(waitingMinutes) ||
    waitingMinutes < 0
  ) {
    return {
      error:
        "waitingMinutes is required and must be a whole number of minutes.",
    };
  }

  return { data: { waitingMinutes } };
}

/** Round a currency amount to whole cents. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * POST /api/orders/[id]/complete — the assigned driver closes their delivery
 * (IN_TRANSIT → COMPLETED), reporting the loading/unloading minutes it took.
 *
 * Waiting time is reported once at completion rather than timed live, and only
 * the part beyond the vehicle type's `freeLoadingMinutes` is charged, at that
 * type's `overtimeRatePerMinute`. The result is stored as `overtimeFee` and
 * settled on top of `price`, which is left exactly as it was quoted — a booked
 * fare never changes after the fact.
 *
 * `overtimeFee` is what the CLIENT pays for that waiting time, so the platform's
 * commission comes off it exactly as it comes off the fare. The driver's share
 * is resolved in the same step, at the commission rate **stored on the order** —
 * never the current global constant — and written to `overtimeDriverPayout` in
 * the same update, so the client-facing fee and the driver-facing payout can
 * never diverge. `driverPayout` is deliberately not touched here; see the
 * comment at the computation below.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseCompleteOrderBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { waitingMinutes } = parsed.data;
  const { id } = await params;

  // The overtime rates come from the type booked on the order, not from the
  // vehicle that happened to fulfil it, so the charge matches what was quoted.
  // `commissionRate` is selected for the same reason: the driver's share of the
  // overtime must be computed at the rate this order was booked under.
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      driverId: true,
      status: true,
      commissionRate: true,
      vehicleTypeSpec: {
        select: {
          pricingRule: {
            select: { freeLoadingMinutes: true, overtimeRatePerMinute: true },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.driverId !== session.user.id) {
    return NextResponse.json(
      { error: "You are not assigned to this delivery." },
      { status: 403 },
    );
  }

  if (order.status !== OrderStatus.IN_TRANSIT) {
    return NextResponse.json(
      { error: "This delivery cannot be completed right now." },
      { status: 409 },
    );
  }

  const pricingRule = order.vehicleTypeSpec.pricingRule;

  // Every seeded vehicle type has a rule, so this only guards against
  // hand-edited data. Failing loudly beats silently waiving the overtime.
  if (!pricingRule) {
    return NextResponse.json(
      { error: "This delivery's vehicle type has no pricing rule." },
      { status: 500 },
    );
  }

  const overtimeMinutes = Math.max(
    0,
    waitingMinutes - pricingRule.freeLoadingMinutes,
  );
  const overtimeFee = roundCurrency(
    overtimeMinutes * pricingRule.overtimeRatePerMinute,
  );

  // `order.commissionRate` — the rate stamped onto this row at booking — and
  // never `PLATFORM_COMMISSION_RATE` or `driverPayoutFor`'s default. That is the
  // whole reason the column exists: a job booked at 15% and completed after the
  // global rate was retuned to 18% would otherwise end up with a `driverPayout`
  // at one rate and an `overtimeDriverPayout` at another, with nothing on the
  // row to explain the disagreement.
  //
  // `driverPayout` is NOT recomputed here, and completion must never write to
  // it. It holds one stable meaning for the life of an order — what the job was
  // quoted to pay, the same figure the load board showed the driver when they
  // took it. Merging the two would make the board's historical number and the
  // earnings screen's number for one job silently disagree, and would fold a
  // figure only knowable at completion (overtime depends on `waitingMinutes`,
  // reported just now) into one that was settled at booking.
  const overtimeDriverPayout = driverPayoutFor(
    overtimeFee,
    order.commissionRate,
  );

  // Both figures in one update: an order can never carry a non-zero
  // `overtimeFee` alongside a stale, default-`0` `overtimeDriverPayout`, whether
  // from a crash between two writes or from a later refactor splitting them.
  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: OrderStatus.COMPLETED,
      completedAt: new Date(),
      waitingMinutes,
      overtimeFee,
      overtimeDriverPayout,
    },
    // Carrier-only response — see `CARRIER_ORDER_PARTY_SELECT`'s doc comment;
    // never `ORDER_PARTY_SELECT` here. Only the order's assigned driver reaches
    // this update, and this route was the worst of the six: it returned bare
    // `ORDER_PARTY_SELECT`, handing the completing driver `price` and the
    // `overtimeFee` this very call had just computed — the client's side of both
    // halves of the job.
    //
    // The `data:` object above is untouched by this select. `overtimeFee` is
    // still written (the client is billed it) and `overtimeDriverPayout` is
    // still commissioned from it at the order's own stored rate; the response
    // simply reports the second and not the first.
    select: CARRIER_ORDER_PARTY_SELECT,
  });

  return NextResponse.json(updated, { status: 200 });
}
