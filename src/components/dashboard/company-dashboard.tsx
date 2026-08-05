import { prisma } from "@/lib/prisma";
import { CompanyVehicleCard } from "@/components/company-vehicle-card";
import { CompanyVehicleForm } from "@/components/company-vehicle-form";
import { CompanyRemoveVehicleButton } from "@/components/company-remove-vehicle-button";
import {
  CompanyDriverRoster,
  type CompanyRosterDriver,
} from "@/components/company-driver-roster";
import { CompanyBookings } from "@/components/dashboard/company-bookings";

/**
 * "AKHALTSIKHE" → "Akhaltsikhe". Every `GeorgianCity` value is a single word,
 * so capitalising the first letter is enough — cheaper than duplicating the
 * 25-entry label table the sign-up form carries for its `<select>`.
 */
function formatCity(city: string): string {
  return city.charAt(0) + city.slice(1).toLowerCase();
}

/**
 * A logistics company's dashboard: who they are, the vehicles they own, and the
 * drivers on their roster. The fleet is owned by the company itself rather than
 * by any one driver — dispatch is what pairs a driver with a vehicle, and that
 * happens per order.
 */
export async function CompanyDashboard({ userId }: { userId: string }) {
  const company = await prisma.logisticsCompany.findUnique({
    where: { userId },
    include: {
      // The fleet card reads the type's label, payload limit and loading access
      // off the relation — they are no longer columns on `Vehicle`.
      vehicles: {
        include: { vehicleTypeSpec: true },
        orderBy: { createdAt: "desc" },
      },
      // Same fields, and the same order, as GET /api/logistics-company/drivers
      // returns, so the roster looks identical before and after a refresh.
      drivers: {
        select: {
          userId: true,
          phone: true,
          isOnline: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Sign-up always creates the company profile, so this only happens when it
  // was interrupted part-way. Nothing on this page can work without it, and the
  // fleet/roster endpoints would reject every call, so say so up front.
  if (!company) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm opacity-60">Logistics company account</p>
        </header>
        <p className="text-sm opacity-70">
          Your company profile isn&apos;t set up yet. Finish signing up as a
          logistics company to manage your fleet and drivers.
        </p>
      </main>
    );
  }

  const drivers: CompanyRosterDriver[] = company.drivers.map((driver) => ({
    userId: driver.userId,
    name: driver.user.name,
    email: driver.user.email,
    phone: driver.phone,
    isOnline: driver.isOnline,
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{company.companyName}</h1>
        <p className="text-sm opacity-60">
          Logistics company · {formatCity(company.city)}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-bold">
          Fleet <span className="opacity-60">({company.vehicles.length})</span>
        </h2>

        {company.vehicles.length === 0 ? (
          <p className="text-sm opacity-70">
            No vehicles yet — add your first one below.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {company.vehicles.map((vehicle) => (
              <CompanyVehicleCard key={vehicle.id} vehicle={vehicle}>
                <CompanyRemoveVehicleButton
                  vehicleId={vehicle.id}
                  plateNumber={vehicle.plateNumber}
                />
              </CompanyVehicleCard>
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">Add a vehicle</h3>
          <CompanyVehicleForm />
        </section>
      </div>

      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-bold">
          Drivers <span className="opacity-60">({drivers.length})</span>
        </h2>
        <CompanyDriverRoster drivers={drivers} />
      </div>

      <CompanyBookings companyId={company.id} />
    </main>
  );
}
