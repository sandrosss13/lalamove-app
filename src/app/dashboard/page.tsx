import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { CompanyDashboard } from "@/components/dashboard/company-dashboard";
import { DriverDashboard } from "@/components/dashboard/driver-dashboard";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The provider-side home: where an independent driver, a company-affiliated
 * driver, and a logistics company each manage their own account. Clients have
 * nothing to do here — `/account` is theirs — so they are sent back to it.
 */
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="opacity-70">Please sign in to view your dashboard.</p>
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

  // A driver registered by a company starts on a temporary password. Gate every
  // role behind the reset so the flag can't be sidestepped by role branching.
  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  if (session.user.role === "CLIENT") {
    redirect("/account");
  }

  if (session.user.role === "COMPANY") {
    return <CompanyDashboard userId={session.user.id} />;
  }

  // `UserRole` is CLIENT, DRIVER or COMPANY, so everything left is a driver.
  return (
    <DriverDashboard userId={session.user.id} userName={session.user.name} />
  );
}
