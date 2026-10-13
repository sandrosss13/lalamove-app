import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { passwordChangeRefusal } from "@/lib/orders/action-errors";
import { getDeliveryEta } from "@/lib/orders/delivery-eta";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/orders/[id]/location — the assigned driver's last known position for
 * a single order, polled by the client-facing tracking map.
 *
 * The live position lives on `DriverProfile`, but `Order.driverId` points at
 * `User` (named relation "DriverDeliveries"), so the profile is reached through
 * a nested select on `driver`.
 *
 * Only the two parties to the delivery — the ordering client and the assigned
 * driver — may read it, so a driver's whereabouts are never exposed to an
 * unrelated signed-in user.
 *
 * Alongside the position it carries `eta` — where the driver is heading next
 * (the pickup while `ACCEPTED`, the dropoff while `IN_TRANSIT`) and roughly when
 * they will arrive — or null when none applies: no driver, no reported
 * position, an ungeocoded target stop, or a status with nothing to arrive at.
 * It comes from `getDeliveryEta` (`@/lib/orders/delivery-eta`), which caches
 * the driving route per order so a page polling every five seconds does not
 * spend a LocationIQ lookup on every poll.
 */
export async function GET(
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

  // The forced-password-change gate, for the **driver** only. This route is
  // shared: the ordering client polls it for the tracking map, and the gate is
  // about a driver acting on a temporary password — it must not stop a client
  // (or any other role) from following their own delivery. Every other gated
  // route is carrier-only and gates every role; this is the one that cannot.
  const passwordRefusal = passwordChangeRefusal(session.user, t, "DRIVER_ONLY");
  if (passwordRefusal) {
    return passwordRefusal;
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      status: true,
      clientId: true,
      driverId: true,
      pickupLat: true,
      pickupLng: true,
      dropoffLat: true,
      dropoffLng: true,
      driver: {
        select: {
          driverProfile: {
            select: {
              currentLat: true,
              currentLng: true,
              locationUpdatedAt: true,
              isOnline: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: t("common.shared.orderNotFound") },
      { status: 404 },
    );
  }

  const userId = session.user.id;
  if (order.clientId !== userId && order.driverId !== userId) {
    return NextResponse.json(
      { error: t("errors.ordersLocation.youDoNotHaveAccessTo") },
      { status: 403 },
    );
  }

  // Nobody has claimed the delivery yet — a null driver is a normal state the
  // map renders as "waiting", not an error.
  if (order.driverId === null) {
    return NextResponse.json({ driver: null, eta: null }, { status: 200 });
  }

  // An assigned driver should always have a profile, but a driver account
  // created without one (or deleted since) must degrade to "no position known"
  // rather than throwing a 500 at a page that polls every few seconds.
  const driverProfile = order.driver?.driverProfile;
  const driverLat = driverProfile?.currentLat ?? null;
  const driverLng = driverProfile?.currentLng ?? null;

  // A stale position still gets an ETA: the page already warns that the
  // position may be out of date, and the last known one is still the best
  // guess. Both coordinates of a stop must be present for it to count.
  const eta = await getDeliveryEta(id, {
    status: order.status,
    driver:
      driverLat !== null && driverLng !== null
        ? { lat: driverLat, lng: driverLng }
        : null,
    pickup:
      order.pickupLat !== null && order.pickupLng !== null
        ? { lat: order.pickupLat, lng: order.pickupLng }
        : null,
    dropoff:
      order.dropoffLat !== null && order.dropoffLng !== null
        ? { lat: order.dropoffLat, lng: order.dropoffLng }
        : null,
  });

  return NextResponse.json(
    {
      driver: {
        lat: driverLat,
        lng: driverLng,
        updatedAt: driverProfile?.locationUpdatedAt ?? null,
        isOnline: driverProfile?.isOnline ?? false,
      },
      eta,
    },
    { status: 200 },
  );
}
