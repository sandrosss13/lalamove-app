import { prisma } from "@/lib/prisma";
import { VehicleCard } from "@/components/vehicle-card";
import { VehicleForm } from "@/components/vehicle-form";
import { RemoveVehicleButton } from "@/components/remove-vehicle-button";
import { EditVehicleForm } from "@/components/edit-vehicle-form";

/**
 * A driver's dashboard: identity header plus the vehicles they are responsible
 * for. Vehicles hang off `DriverProfile`, so a driver who somehow has no
 * profile yet still gets the page — the add form's API call is what tells them
 * to complete it first.
 *
 * A driver on a company's roster manages no vehicles of their own: the fleet
 * belongs to the company and dispatch is what pairs a driver with one of its
 * vehicles, so they get a read-only note instead of the list and add form.
 */
export async function DriverDashboard({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    include: {
      company: { select: { companyName: true } },
      // The card and edit form read the type's label, payload limit and code
      // off the relation — they are no longer columns on `Vehicle`.
      vehicles: {
        include: { vehicleTypeSpec: true },
        orderBy: { createdAt: "desc" },
      },
    },
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

  const company = driverProfile?.company ?? null;
  const vehicles = driverProfile?.vehicles ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{displayName}</h1>
        <p className="text-sm opacity-60">
          {company ? `Driver at ${company.companyName}` : "Driver account"}
        </p>
      </header>

      {company ? (
        <div className="flex flex-col gap-6">
          <h2 className="text-2xl font-bold">Vehicles</h2>
          <p className="text-sm opacity-70">
            You&apos;re part of {company.companyName}&apos;s fleet — vehicles
            are managed by your company.
          </p>
        </div>
      ) : (
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
                      vehicleTypeCode: vehicle.vehicleTypeSpec.code,
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
      )}
    </main>
  );
}
