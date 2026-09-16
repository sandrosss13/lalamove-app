import { DriverHubShell } from "@/components/driver-hub/driver-hub-shell";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import { getHubHeader } from "@/lib/dashboard/hub/header";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The frame every driver-hub screen renders inside.
 *
 * `(hub)` is a **route group**: the parentheses are invisible in the URL, so
 * these pages are still `/dashboard/loads`, `/dashboard/earnings` and so on —
 * but they are a separate branch of the file tree, and layouts nest by tree
 * rather than by URL. That is the whole point of the group here:
 * `/dashboard/onboarding` and `/dashboard/fleet-onboarding` keep their URLs
 * *and* their own full-screen wizard chrome, because they sit outside this
 * branch and so are never wrapped in this sidebar and header. Do not "tidy"
 * either wizard into `(hub)` — it would frame a wizard inside the hub the
 * wizard's whole job is to unlock.
 *
 * Authentication is not repeated here: `src/app/dashboard/layout.tsx` is the
 * session gate for everything under `/dashboard`, and `resolveHubAccount()`
 * calls the same cached `requireDashboardSession()` anyway, so this costs no
 * second session validation.
 */
export default async function DriverHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await resolveHubAccount();

  // `null` is the interrupted sign-up: the session is valid but the
  // `DriverProfile` / `LogisticsCompany` row it points at was never created.
  // There is no account to draw a sidebar, header or account chip from, so the
  // hub cannot render at all — the same plain fallback the old dashboard used
  // stands in, on the app's default light theme.
  if (!account) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm opacity-60">Provider account</p>
        </header>
        <p className="text-sm opacity-70">
          Your driver profile isn&apos;t set up yet. Finish signing up as a
          driver to see your dashboard.
        </p>
      </main>
    );
  }

  // The header's own data — the active-job pill and the sampled notification
  // surface — is resolved here rather than by any of the eight screens: the bar
  // sits above all of them and shows the same thing on every one, so one pass
  // per request in the layout is the whole point of `getHubHeader()`. It runs
  // after the account resolves because it takes it, and the `null` branch above
  // returns before it, so an interrupted sign-up never reaches Prisma for a
  // header it is not going to draw.
  const header = await getHubHeader(account);

  return (
    <DriverHubShell account={account} header={header}>
      {children}
    </DriverHubShell>
  );
}
