import Link from "next/link";
import { OrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AcceptOrderButton } from "@/components/accept-order-button";
import { DriverStatusToggle } from "@/components/driver-status-toggle";
import { OrderCard } from "@/components/order-card";
import { DeliveryLifecycleActions } from "@/components/dashboard/delivery-lifecycle-actions";

/** The vehicle fields needed to match orders and to label the accept picker. */
type DriverVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  vehicleTypeSpecId: string;
};

/** Picker label for a vehicle, e.g. "AA-123-BB — Mercedes-Benz Sprinter". */
function vehicleLabel(vehicle: DriverVehicle): string {
  return `${vehicle.plateNumber} — ${vehicle.make} ${vehicle.model}`;
}

/**
 * A driver's booking activity on `/dashboard`, in the two shapes the platform
 * supports.
 *
 * An independent driver works the open market: they see pending deliveries
 * asking for a vehicle type they have registered, and accept one directly. A
 * driver on a company's roster never does — their company claims and dispatches
 * work to them — so they only ever see what they have been assigned.
 *
 * Both then run the same lifecycle on their own deliveries: start, then complete
 * with the loading time the overtime fee is settled from.
 */
export async function DriverBookings({
  userId,
  companyId,
}: {
  userId: string;
  companyId: string | null;
}) {
  const isIndependent = companyId === null;

  // Refetched here rather than passed down: the availability toggle and the
  // open-job filter both need the profile, and keeping the query beside its two
  // consumers stops the dashboard's own query growing a bookings-shaped tail.
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    select: {
      isOnline: true,
      vehicles: {
        select: {
          id: true,
          plateNumber: true,
          make: true,
          model: true,
          vehicleTypeSpecId: true,
        },
      },
    },
  });

  const driverVehicles: DriverVehicle[] = driverProfile?.vehicles ?? [];

  // A delivery can only be taken in a vehicle of the type it asks for, so the
  // distinct set of registered types is what the open-job list is filtered by.
  const registeredVehicleTypeSpecIds = [
    ...new Set(driverVehicles.map((vehicle) => vehicle.vehicleTypeSpecId)),
  ];

  // Assigned deliveries are never type-filtered: that match was already made
  // when the order was accepted or dispatched.
  const orders = await prisma.order.findMany({
    where: isIndependent
      ? {
          OR: [
            {
              status: OrderStatus.PENDING,
              driverId: null,
              vehicleTypeSpecId: { in: registeredVehicleTypeSpecIds },
            },
            { driverId: userId },
          ],
        }
      : { driverId: userId },
    include: {
      vehicle: { select: { plateNumber: true, make: true, model: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const openOrders = orders.filter(
    (order) => order.status === OrderStatus.PENDING && order.driverId === null,
  );
  const myDeliveries = orders.filter((order) => order.driverId === userId);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold">Deliveries</h2>

      {/* Availability drives the location beacon, so it is only offered once a
          profile exists — there is no `isOnline` flag to toggle before then. */}
      {driverProfile ? (
        <DriverStatusToggle initialIsOnline={driverProfile.isOnline} />
      ) : null}

      {isIndependent ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">
            Available <span className="opacity-60">({openOrders.length})</span>
          </h3>

          {driverVehicles.length === 0 ? (
            <p className="text-sm opacity-70">
              You haven&apos;t registered a vehicle yet. Add one above to start
              seeing deliveries.
            </p>
          ) : openOrders.length === 0 ? (
            <p className="text-sm opacity-70">
              No deliveries available right now.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {openOrders.map((order) => (
                <OrderCard key={order.id} order={order}>
                  {/* The picker is limited to vehicles of this order's own
                      type, since a driver may have several types registered. */}
                  <AcceptOrderButton
                    orderId={order.id}
                    eligibleVehicles={driverVehicles
                      .filter(
                        (vehicle) =>
                          vehicle.vehicleTypeSpecId === order.vehicleTypeSpecId,
                      )
                      .map((vehicle) => ({
                        id: vehicle.id,
                        label: vehicleLabel(vehicle),
                      }))}
                  />
                </OrderCard>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">
          My deliveries{" "}
          <span className="opacity-60">({myDeliveries.length})</span>
        </h3>

        {myDeliveries.length === 0 ? (
          <p className="text-sm opacity-70">
            {isIndependent
              ? "You haven't taken a delivery yet."
              : "Nothing dispatched to you yet — your company assigns deliveries to you."}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {myDeliveries.map((order) => (
              <OrderCard key={order.id} order={order}>
                {order.status === OrderStatus.ACCEPTED ||
                order.status === OrderStatus.IN_TRANSIT ? (
                  <>
                    <DeliveryLifecycleActions
                      orderId={order.id}
                      status={order.status}
                    />
                    <Link
                      href={`/orders/${order.id}/track`}
                      className="mt-3 inline-block text-sm font-medium hover:opacity-70"
                    >
                      Track delivery →
                    </Link>
                  </>
                ) : null}
              </OrderCard>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
