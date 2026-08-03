import { headers } from "next/headers";
import Link from "next/link";
import { OrderStatus, type Order } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderCard } from "@/components/order-card";
import { VehicleCard } from "@/components/vehicle-card";
import { VehicleForm } from "@/components/vehicle-form";
import { RemoveVehicleButton } from "@/components/remove-vehicle-button";
import { EditVehicleForm } from "@/components/edit-vehicle-form";
import {
  AccountProfileForm,
  type AccountProfileInitialValues,
} from "@/components/account-profile-form";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/** Order statuses that count as "current" (active, not yet resolved). */
const CURRENT_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.IN_TRANSIT,
];

/**
 * An order with the vehicle assigned to it, as fetched below — clients see
 * which vehicle is handling their delivery once a driver has accepted it.
 */
type OrderWithVehicle = Order & {
  vehicle: { plateNumber: string; make: string; model: string } | null;
};

/** Renders one titled group of orders, or an empty-state line when there are none. */
function OrderGroup({
  title,
  orders,
}: {
  title: string;
  orders: OrderWithVehicle[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">
        {title} <span className="opacity-60">({orders.length})</span>
      </h3>
      {orders.length === 0 ? (
        <p className="text-sm opacity-70">No orders yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Driver dashboard: identity header plus the driver's fleet. Vehicles hang off
 * `DriverProfile`, so a driver who somehow has no profile yet still gets the
 * page — the add form's API call is what tells them to complete it first.
 */
async function DriverAccount({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    include: { vehicles: { orderBy: { createdAt: "desc" } } },
  });

  // Display name: use the profile's identity when present, otherwise fall back
  // to the account name captured at sign-up. Individual entrepreneurs are
  // named people, so they use the personal-name branch alongside individuals.
  const displayName =
    driverProfile?.accountType === "BUSINESS"
      ? (driverProfile.companyName ?? userName)
      : driverProfile
        ? `${driverProfile.firstName ?? ""} ${driverProfile.lastName ?? ""}`.trim() ||
          userName
        : userName;

  const vehicles = driverProfile?.vehicles ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{displayName}</h1>
        <p className="text-sm opacity-60">Driver account</p>
      </header>

      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-bold">
          My vehicles <span className="opacity-60">({vehicles.length})</span>
        </h2>

        {vehicles.length === 0 ? (
          <p className="text-sm opacity-70">
            No vehicles yet — add your first one below.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle}>
                <EditVehicleForm
                  vehicle={{
                    id: vehicle.id,
                    plateNumber: vehicle.plateNumber,
                    make: vehicle.make,
                    model: vehicle.model,
                    year: vehicle.year,
                    vehicleType: vehicle.vehicleType,
                    capacityKg: vehicle.capacityKg,
                  }}
                />
                <RemoveVehicleButton
                  vehicleId={vehicle.id}
                  plateNumber={vehicle.plateNumber}
                />
              </VehicleCard>
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">Add a vehicle</h3>
          <VehicleForm />
        </section>
      </div>
    </main>
  );
}

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">My account</h1>
        <p className="opacity-70">Please sign in to view your account.</p>
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

  // Drivers get a fleet-oriented dashboard on this same route. `UserRole` is
  // CLIENT or DRIVER only, so everything past this branch is a client.
  if (session.user.role === "DRIVER") {
    return (
      <DriverAccount userId={session.user.id} userName={session.user.name} />
    );
  }

  const [clientProfile, orders] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.order.findMany({
      where: { clientId: session.user.id },
      include: {
        vehicle: { select: { plateNumber: true, make: true, model: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Display name: use the profile's identity when present, otherwise fall back
  // to the account name captured at sign-up.
  const displayName =
    clientProfile?.accountType === "BUSINESS"
      ? (clientProfile.companyName ?? session.user.name)
      : clientProfile?.accountType === "INDIVIDUAL"
        ? `${clientProfile.firstName ?? ""} ${clientProfile.lastName ?? ""}`.trim() ||
          session.user.name
        : session.user.name;

  // Defensive: sign-up always creates a profile, but an account without one is
  // still editable — default to an empty individual profile.
  const profileInitialValues: AccountProfileInitialValues = {
    accountType: clientProfile?.accountType ?? "INDIVIDUAL",
    firstName: clientProfile?.firstName ?? null,
    lastName: clientProfile?.lastName ?? null,
    companyName: clientProfile?.companyName ?? null,
    vatId: clientProfile?.vatId ?? null,
    phone: clientProfile?.phone ?? null,
    // `<input type="date">` expects a bare "YYYY-MM-DD" value.
    dateOfBirth: clientProfile?.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: clientProfile?.gender ?? null,
    idNumber: clientProfile?.idNumber ?? null,
  };

  const currentOrders = orders.filter((order) =>
    CURRENT_STATUSES.includes(order.status),
  );
  const completedOrders = orders.filter(
    (order) => order.status === OrderStatus.COMPLETED,
  );
  const canceledOrders = orders.filter(
    (order) => order.status === OrderStatus.CANCELLED,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{displayName}</h1>
        <p className="text-sm opacity-60">Account ID: {session.user.id}</p>
      </header>

      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-bold">My profile</h2>
        <AccountProfileForm
          email={session.user.email}
          initialValues={profileInitialValues}
        />
      </div>

      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-bold">My orders</h2>
        <OrderGroup title="Current" orders={currentOrders} />
        <OrderGroup title="Completed" orders={completedOrders} />
        <OrderGroup title="Canceled" orders={canceledOrders} />
      </div>
    </main>
  );
}
