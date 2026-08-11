import { getDriverDashboardData } from "@/lib/driver-dashboard-data";
import { DriverOpsDashboardShell } from "@/components/dashboard/driver-ops/driver-ops-dashboard-shell";

/**
 * A driver's ops dashboard: a tabbed dark console (Overview/Deliveries/
 * Earnings/Vehicle) wired to real Prisma data via `getDriverDashboardData`.
 * Replaces the previous plain vehicles/bookings page entirely.
 *
 * Every figure the console shows is fetched here, once per page load, and handed
 * down as one serialisable object; the client shell owns tab/drawer/toast state
 * and mutations refresh this server component rather than re-fetching per tab.
 */
export async function DriverDashboard({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const data = await getDriverDashboardData(userId);

  // Sign-up always creates the driver profile, so this only happens when it was
  // interrupted part-way. There is nothing to show inside the dark console
  // without it, so this fallback stays on the app's default light theme.
  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">{userName}</h1>
          <p className="text-sm opacity-60">Driver account</p>
        </header>
        <p className="text-sm opacity-70">
          Your driver profile isn&apos;t set up yet. Finish signing up as a
          driver to see your dashboard.
        </p>
      </main>
    );
  }

  // `data-ops-dashboard` is what scopes the dark palette, the slim scrollbars
  // and the hidden global site header to this page (see globals.css) — the same
  // attribute the company console uses, so no driver-specific CSS is needed.
  return (
    <div
      data-ops-dashboard=""
      className="min-h-screen bg-ops-bg font-[family-name:var(--font-ibm-plex)] text-ops-text antialiased"
    >
      <DriverOpsDashboardShell data={data} />
    </div>
  );
}
