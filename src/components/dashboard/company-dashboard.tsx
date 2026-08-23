import { getCompanyDashboardData } from "@/lib/company-dashboard-data";
import { OpsDashboardShell } from "@/components/dashboard/ops/ops-dashboard-shell";

/**
 * The provider-side ops dashboard for a logistics company: a tabbed dark
 * console (Overview/Orders/Revenue/Fleet/Drivers/Vehicles) wired to real
 * Prisma data via `getCompanyDashboardData`. Replaces the previous plain
 * fleet/roster/bookings page entirely.
 *
 * Every figure the console shows is fetched here, once per page load, and handed
 * down as one serialisable object; the client shell owns tab/drawer/toast state
 * and mutations refresh this server component rather than re-fetching per tab.
 */
export async function CompanyDashboard({ userId }: { userId: string }) {
  const data = await getCompanyDashboardData(userId);

  // Sign-up always creates the company profile, so this only happens when it was
  // interrupted part-way. Nothing on this page can work without it, and the
  // fleet/roster endpoints would reject every call, so say so up front.
  if (!data) {
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

  // The shell renders the `data-ops-dashboard` root element itself — that
  // attribute is what scopes the console palette, the slim scrollbars and the
  // hidden global site header to this page (see globals.css) — because it also
  // carries the `data-ops-theme` value of the visitor's dark/light choice,
  // which is client state.
  return <OpsDashboardShell data={data} />;
}
