import { headers } from "next/headers";
import Link from "next/link";
import { OrderStatus, type VehicleType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AcceptOrderButton } from "@/components/accept-order-button";
import { DriverStatusToggle } from "@/components/driver-status-toggle";
import { OrderCard } from "@/components/order-card";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/** The vehicle fields needed to match orders and to label the accept picker. */
type DriverVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  vehicleType: VehicleType;
};

/** Picker label for a vehicle, e.g. "AA-123-BB — Mercedes-Benz Sprinter". */
function vehicleLabel(vehicle: DriverVehicle): string {
  return `${vehicle.plateNumber} — ${vehicle.make} ${vehicle.model}`;
}

export default async function OrdersPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">Your orders</h1>
        <p className="opacity-70">Please sign in to view your orders.</p>
        <div className="flex justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            Sign up
          </Link>
        </div>
      </main>
    );
  }

  const { id: userId, role } = session.user;
  const isDriver = role === "DRIVER";

  // Fetched before the orders query because a driver's fleet decides which jobs
  // they may see at all. Drivers also get an availability toggle from the same
  // row, but only once they have a profile — there is no `isOnline` flag to
  // drive it before then.
  const driverProfile = isDriver
    ? await prisma.driverProfile.findUnique({
        where: { userId },
        select: {
          isOnline: true,
          vehicles: {
            select: {
              id: true,
              plateNumber: true,
              make: true,
              model: true,
              vehicleType: true,
            },
          },
        },
      })
    : null;

  const driverVehicles: DriverVehicle[] = driverProfile?.vehicles ?? [];
  // A delivery can only be taken in a vehicle of the type it asks for, so the
  // distinct set of registered types is what a driver's open-job list is
  // filtered by.
  const registeredVehicleTypes = [
    ...new Set(driverVehicles.map((vehicle) => vehicle.vehicleType)),
  ];

  // With no vehicle registered there is nothing a driver could accept, so the
  // orders query is skipped entirely in favour of a prompt to add one.
  const hasNoVehicles = isDriver && registeredVehicleTypes.length === 0;

  // Clients see their own orders; drivers see open jobs matching a vehicle they
  // have registered, plus their own deliveries. Assigned deliveries are not
  // type-filtered: that match was already made when the order was accepted.
  const orders = hasNoVehicles
    ? []
    : await prisma.order.findMany({
        where: isDriver
          ? {
              OR: [
                {
                  status: OrderStatus.PENDING,
                  driverId: null,
                  vehicleType: { in: registeredVehicleTypes },
                },
                { driverId: userId },
              ],
            }
          : { clientId: userId },
        include: {
          vehicle: {
            select: { plateNumber: true, make: true, model: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {isDriver ? "Available & assigned deliveries" : "Your orders"}
        </h1>
        <Link href="/" className="text-sm font-medium hover:opacity-70">
          ← New order
        </Link>
      </div>

      {driverProfile ? (
        <DriverStatusToggle initialIsOnline={driverProfile.isOnline} />
      ) : null}

      {hasNoVehicles ? (
        <p className="opacity-70">
          You haven&apos;t registered a vehicle yet. Add one to start seeing
          deliveries.{" "}
          <Link href="/account" className="font-medium underline">
            Add a vehicle
          </Link>
        </p>
      ) : orders.length === 0 ? (
        <p className="opacity-70">
          {isDriver
            ? "No deliveries available right now."
            : "You haven't placed any orders yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order}>
              {/* Drivers can claim only orders that are still open (PENDING and
                  unassigned); their own accepted deliveries just show status.
                  The picker is limited to vehicles of this order's own type,
                  since a driver may have several types registered. */}
              {isDriver &&
              order.status === OrderStatus.PENDING &&
              order.driverId === null ? (
                <AcceptOrderButton
                  orderId={order.id}
                  eligibleVehicles={driverVehicles
                    .filter(
                      (vehicle) => vehicle.vehicleType === order.vehicleType,
                    )
                    .map((vehicle) => ({
                      id: vehicle.id,
                      label: vehicleLabel(vehicle),
                    }))}
                />
              ) : null}
              {order.driverId !== null &&
              (order.status === OrderStatus.ACCEPTED ||
                order.status === OrderStatus.IN_TRANSIT) ? (
                <Link
                  href={`/orders/${order.id}/track`}
                  className="mt-3 inline-block text-sm font-medium hover:opacity-70"
                >
                  Track delivery →
                </Link>
              ) : null}
            </OrderCard>
          ))}
        </ul>
      )}
    </main>
  );
}
