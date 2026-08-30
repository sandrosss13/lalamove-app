import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmployeesScreen } from "@/components/driver-hub/screens/employees-screen";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import { getHubEmployees } from "@/lib/dashboard/hub/employees";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Employees & roles · Driver Hub",
};

/** Where a non-business account is sent — the hub's own home screen. */
const HUB_HOME = "/dashboard/today";

/**
 * The fleet's back office: who works here, what role each holds, and what that
 * role may do.
 *
 * Business-only, and the guard below — not the sidebar — is what enforces
 * that. `hubNavForKind()` merely hides the link, which does nothing about a
 * hand-typed URL or a bookmark; the boundary is this check.
 *
 * `resolveHubAccount()` is React-`cache()`d and the layout above already called
 * it, so this is a memo hit within the same request, not a second query. A
 * `null` account cannot reach here at all: the layout renders its own
 * "profile isn't set up yet" fallback instead of these children.
 *
 * `getHubEmployees()` repeats the business-only check and returns `null` for
 * anyone else, so the roster cannot leak even if this guard were ever removed.
 * The second redirect below is that contract's other half, not a duplicate.
 */
export default async function EmployeesPage() {
  const account = await resolveHubAccount();

  if (account?.kind !== "BUSINESS") {
    redirect(HUB_HOME);
  }

  const data = await getHubEmployees(account);

  if (data === null) {
    redirect(HUB_HOME);
  }

  return <EmployeesScreen data={data} />;
}
