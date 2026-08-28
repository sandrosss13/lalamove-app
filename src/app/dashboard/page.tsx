import { CompanyDashboard } from "@/components/dashboard/company-dashboard";
import { DriverDashboard } from "@/components/dashboard/driver-dashboard";
import { requireDashboardSession } from "@/lib/dashboard/auth";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The provider-side home: where an independent driver, a company-affiliated
 * driver, and a logistics company each manage their own account.
 *
 * Authentication, the forced-password-change gate and the CLIENT bounce all
 * live in `layout.tsx` now, so this page is purely the role branch. The guard
 * call below is the same cached one the layout already made, so it costs no
 * second session validation — it is here only to hand back the non-null
 * session object.
 */
export default async function DashboardPage() {
  const session = await requireDashboardSession();

  if (session.user.role === "COMPANY") {
    return <CompanyDashboard userId={session.user.id} />;
  }

  // `UserRole` is CLIENT, DRIVER or COMPANY, and the layout has already sent
  // clients to `/account`, so everything left is a driver.
  return (
    <DriverDashboard userId={session.user.id} userName={session.user.name} />
  );
}
