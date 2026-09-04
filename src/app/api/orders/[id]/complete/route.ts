import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { ORDER_PARTY_SELECT } from "@/lib/order-response-select";
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
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      driverId: true,
      status: true,
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

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: OrderStatus.COMPLETED,
      completedAt: new Date(),
      waitingMinutes,
      overtimeFee,
    },
    select: ORDER_PARTY_SELECT,
  });

  return NextResponse.json(updated, { status: 200 });
}
