import { OrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { OrderCard } from "@/components/order-card";
import { ClaimOrderButton } from "@/components/dashboard/claim-order-button";
import {
  CompanyDispatchForm,
  type DispatchDriverOption,
  type DispatchVehicleOption,
} from "@/components/dashboard/company-dispatch-form";

/** The fleet fields needed to match orders and to label the dispatch picker. */
type FleetVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  vehicleTypeSpecId: string;
};

/** Picker label for a vehicle, e.g. "AA-123-BB — Mercedes-Benz Sprinter". */
function vehicleLabel(vehicle: FleetVehicle): string {
  return `${vehicle.plateNumber} — ${vehicle.make} ${vehicle.model}`;
}

/**
 * A logistics company's booking activity on `/dashboard`: the open deliveries it
 * could take, and everything it has already taken.
 *
 * A company works in two steps rather than one. Claiming takes an order off the
 * open market (PENDING → CLAIMED) without committing anyone to it; dispatching
 * then pairs it with a roster driver and a fleet vehicle (CLAIMED → ACCEPTED),
 * after which the driver runs the same start/complete lifecycle an independent
 * driver does. The dispatch form therefore only appears while an order is still
 * CLAIMED.
 */
export async function CompanyBookings({ companyId }: { companyId: string }) {
  const [fleet, rosterDrivers] = await Promise.all([
    prisma.vehicle.findMany({
      where: { companyId },
      select: {
        id: true,
        plateNumber: true,
        make: true,
        model: true,
        vehicleTypeSpecId: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.driverProfile.findMany({
      where: { companyId },
      select: { userId: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // A delivery can only be taken in a vehicle of the type it asks for, so the
  // distinct set of fleet types is what the open-job list is filtered by.
  const fleetVehicleTypeSpecIds = [
    ...new Set(fleet.map((vehicle) => vehicle.vehicleTypeSpecId)),
  ];

  // Orders already taken by this company are not type-filtered: that match was
  // already made when the order was claimed.
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        {
          status: OrderStatus.PENDING,
          companyId: null,
          vehicleTypeSpecId: { in: fleetVehicleTypeSpecIds },
        },
        { companyId },
      ],
    },
    include: {
      vehicle: { select: { plateNumber: true, make: true, model: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const openOrders = orders.filter((order) => order.companyId === null);
  const ownOrders = orders.filter((order) => order.companyId === companyId);

  const driverOptions: DispatchDriverOption[] = rosterDrivers.map((driver) => ({
    userId: driver.userId,
    name: driver.user.name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold">Deliveries</h2>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">
          Available <span className="opacity-60">({openOrders.length})</span>
        </h3>

        {fleet.length === 0 ? (
          <p className="text-sm opacity-70">
            Add a fleet vehicle above to start seeing deliveries you can take.
          </p>
        ) : openOrders.length === 0 ? (
          <p className="text-sm opacity-70">
            No deliveries available right now.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {openOrders.map((order) => (
              <OrderCard key={order.id} order={order}>
                <ClaimOrderButton orderId={order.id} />
              </OrderCard>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">
          Claimed &amp; dispatched{" "}
          <span className="opacity-60">({ownOrders.length})</span>
        </h3>

        {ownOrders.length === 0 ? (
          <p className="text-sm opacity-70">
            You haven&apos;t claimed a delivery yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {ownOrders.map((order) => {
              // Narrowed to this order's own type: dispatching a mismatched
              // vehicle is rejected by the API, so it is never offered here.
              const eligibleVehicles: DispatchVehicleOption[] = fleet
                .filter(
                  (vehicle) =>
                    vehicle.vehicleTypeSpecId === order.vehicleTypeSpecId,
                )
                .map((vehicle) => ({
                  id: vehicle.id,
                  label: vehicleLabel(vehicle),
                }));

              return (
                <OrderCard key={order.id} order={order}>
                  {order.status === OrderStatus.CLAIMED ? (
                    <CompanyDispatchForm
                      orderId={order.id}
                      drivers={driverOptions}
                      vehicles={eligibleVehicles}
                    />
                  ) : null}
                </OrderCard>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
