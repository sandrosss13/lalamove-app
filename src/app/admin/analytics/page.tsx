import { redirect } from "next/navigation";
import { Download } from "lucide-react";

import { adminNavSection } from "@/components/admin/admin-nav";
import { DateRangePicker } from "@/components/admin/analytics/date-range-picker";
import { MetricCards } from "@/components/admin/analytics/metric-cards";
import { Button } from "@/components/ui/button";
import { getSalesSummary, resolveSalesRange } from "@/lib/admin/analytics";
import { hasAdminRole, requireSystemUser } from "@/lib/admin/auth";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Sales Analytics — the back office's landing page (`/admin` forwards here for
 * anyone whose role can see it).
 *
 * The selected range lives entirely in the URL. That is what makes this a
 * server component with no data-fetching client code: the picker pushes new
 * `?from=`/`?to=` params, Next re-renders this page on the server, and the
 * cards come back with fresh numbers. A range is therefore shareable and
 * bookmarkable, and the export link below always points at exactly the range
 * being looked at.
 *
 * Unlike the other four sections this one has no tabs, so it sits outside the
 * `(sections)` group and applies its own role gate instead of inheriting
 * `AdminSectionLayout`'s. The gate mirrors that one exactly: `requireSystemUser`
 * (already run by the root layout, and `cache()`d, so this call is free) has
 * only established that the visitor is *some* active staff member, and the
 * sidebar hiding this link from other roles does nothing about a typed URL.
 * Denied staff go to `/admin`, which forwards them to a section they can open,
 * so this cannot ping-pong.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { systemUserProfile } = await requireSystemUser();
  const section = adminNavSection("analytics");

  if (!hasAdminRole(systemUserProfile, section.adminRoles)) {
    redirect("/admin");
  }

  const params = await searchParams;
  const range = resolveSalesRange({ from: params.from, to: params.to });
  const summary = await getSalesSummary(range);

  // Built from the *resolved* params rather than the raw query string, so a
  // partial or malformed URL exports the same range the cards are showing.
  const exportHref = `/api/admin/analytics/export?from=${range.fromParam}&to=${range.toParam}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {section.label}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            from={range.fromParam}
            to={range.toParam}
            today={range.todayParam}
          />

          {/* A plain anchor, not `next/link`: the response is a file download
              rather than a route, so there is no client navigation to make and
              nothing worth prefetching. `Content-Disposition` on the route
              supplies the filename. */}
          <Button asChild variant="outline" size="sm">
            <a href={exportHref}>
              <Download data-icon="inline-start" />
              Export to Excel
            </a>
          </Button>
        </div>
      </div>

      <MetricCards summary={summary} />
    </div>
  );
}
