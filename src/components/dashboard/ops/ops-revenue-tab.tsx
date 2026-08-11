"use client";

import { useMemo, useState } from "react";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { formatCity } from "@/lib/format-city";

/**
 * Trend windows the selector offers, in days. Every value has to stay <= the 90
 * entries `revenue.dailyTrend` always carries: picking one only slices that
 * already-fetched array client-side, it never re-queries.
 */
const PERIODS = [7, 30, 90] as const;

type PeriodDays = (typeof PERIODS)[number];

const DEFAULT_PERIOD_DAYS: PeriodDays = 30;

/** Formatters are module-level so re-renders don't rebuild them on every row. */
const currencyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Trend days are UTC buckets (`date_trunc('day', ...)` in the data module), so
 * they must be formatted in UTC too — a local-time render would shift every
 * label a day for anyone west of Greenwich.
 */
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatCurrency(value: number): string {
  return `$${currencyFormatter.format(value)}`;
}

/** "2026-03-04" → "Mar 4". */
function formatDay(isoDate: string): string {
  return dayFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/** A region bucket's display name; "UNASSIGNED" is a sentinel, not a real city. */
function formatRegion(city: string): string {
  return city === "UNASSIGNED" ? "Unassigned" : formatCity(city);
}

type BreakdownItem = {
  id: string;
  label: string;
  total: number;
  orderCount: number;
};

/**
 * One horizontal-bar breakdown panel. Both breakdowns on this tab aggregate
 * over *all* completed orders (not the selected trend period — the data module
 * pre-aggregates them unwindowed), so each one states its own window in
 * `caption` rather than letting the period chips above imply otherwise.
 */
function RevenueBreakdown({
  title,
  caption,
  items,
  barClassName,
  emptyMessage,
}: {
  title: string;
  caption: string;
  items: BreakdownItem[];
  /** Literal utility class — never interpolated, so Tailwind can see it. */
  barClassName: string;
  emptyMessage: string;
}) {
  // Items arrive sorted by total descending from the data module, so the first
  // one is the scale maximum; the floor keeps an all-zero list from dividing by 0.
  const maxTotal = Math.max(1, ...items.map((item) => item.total));

  return (
    <div className="rounded-xl border border-ops-border bg-ops-surface p-5">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 mb-3 text-[11px] tracking-wide text-ops-text-muted uppercase">
        {caption}
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-ops-text-muted">
          {emptyMessage}
        </div>
      ) : (
        items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-2">
            <div className="w-[110px] flex-shrink-0 truncate text-[13px] text-ops-text-muted">
              {item.label}
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ops-surface-raised">
              <div
                style={{ width: `${(item.total / maxTotal) * 100}%` }}
                className={`h-full rounded-full ${barClassName}`}
              />
            </div>
            <div className="w-[104px] flex-shrink-0 text-right">
              <div className="text-xs">{formatCurrency(item.total)}</div>
              <div className="text-[11px] text-ops-text-muted">
                {item.orderCount} {item.orderCount === 1 ? "order" : "orders"}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ops-border bg-ops-surface p-4">
      <div className="text-xs tracking-wide text-ops-text-muted uppercase">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

/**
 * Revenue tab: a daily trend chart with a client-side period selector, the
 * service/region breakdowns, and the driver-payout table.
 *
 * Only the trend chart responds to the period chips. `byServiceType`/`byRegion`
 * are all-time aggregates and `driverPayouts` is a fixed 90-day aggregate — none
 * of them can be re-bucketed to a shorter window without the per-order rows,
 * which this tab never receives, so each section labels the window it actually
 * covers. Nothing here is estimated or fabricated: no ratings and no payout
 * status, because the schema has neither.
 */
export function OpsRevenueTab({
  revenue,
}: {
  revenue: CompanyDashboardData["revenue"];
}) {
  const [periodDays, setPeriodDays] = useState<PeriodDays>(DEFAULT_PERIOD_DAYS);

  const { trendSlice, maxDaily, periodTotal, peakDay } = useMemo(() => {
    const slice = revenue.dailyTrend.slice(-periodDays);
    return {
      trendSlice: slice,
      // Bars scale against the tallest day *in the slice*, so a short window is
      // never flattened by an outlier that sits outside it.
      maxDaily: Math.max(1, ...slice.map((day) => day.total)),
      periodTotal: slice.reduce((sum, day) => sum + day.total, 0),
      peakDay: slice.reduce<{ date: string; total: number } | null>(
        (best, day) => (best === null || day.total > best.total ? day : best),
        null,
      ),
    };
  }, [revenue.dailyTrend, periodDays]);

  const hasRevenueInPeriod = periodTotal > 0;
  const firstDay = trendSlice.at(0);
  const lastDay = trendSlice.at(-1);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5" role="group" aria-label="Trend period">
          {PERIODS.map((days) => {
            const active = periodDays === days;
            return (
              <button
                key={days}
                type="button"
                aria-pressed={active}
                onClick={() => setPeriodDays(days)}
                className={`rounded-full border px-3.5 py-2 text-xs font-medium ${
                  active
                    ? "border-ops-accent bg-ops-accent/20 text-ops-accent"
                    : "border-ops-border text-ops-text-muted hover:bg-ops-surface-raised"
                }`}
              >
                Last {days} days
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-ops-text-muted">
          Period applies to the trend chart only — the breakdowns below cover
          their own fixed windows.
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label={`Revenue · last ${periodDays} days`}
          value={formatCurrency(periodTotal)}
        />
        <StatCard
          label="Average per day"
          value={formatCurrency(periodTotal / periodDays)}
        />
        <StatCard
          label="Best day"
          // An all-zero window has no meaningful peak, so don't dress a $0.00
          // day up as one.
          value={
            hasRevenueInPeriod && peakDay
              ? `${formatCurrency(peakDay.total)} · ${formatDay(peakDay.date)}`
              : "—"
          }
        />
      </div>

      <div className="rounded-xl border border-ops-border bg-ops-surface p-5.5">
        <div className="mb-1 flex items-baseline justify-between">
          <div className="text-sm font-semibold">Revenue trend</div>
          <div className="text-[11px] text-ops-text-muted">
            Peak {formatCurrency(hasRevenueInPeriod ? maxDaily : 0)}
          </div>
        </div>
        <div className="mb-4.5 text-[11px] tracking-wide text-ops-text-muted uppercase">
          Completed orders, daily
        </div>

        {/* The bars carry no text, so the plot is announced as a single image
            with a summary rather than as 90 unlabelled elements. */}
        <div
          role="img"
          aria-label={`Daily revenue for the last ${periodDays} days, totalling ${formatCurrency(periodTotal)}`}
          className="flex h-[170px] items-end gap-1"
        >
          {trendSlice.map((day) => (
            <div
              key={day.date}
              title={`${formatDay(day.date)}: ${formatCurrency(day.total)}`}
              style={{ height: `${(day.total / maxDaily) * 100}%` }}
              // A zero day still draws a stub so the axis stays continuous; the
              // muted fill stops that stub from reading as a tiny sale.
              className={`min-h-[3px] flex-1 rounded-t ${
                day.total > 0 ? "bg-ops-accent" : "bg-ops-border"
              }`}
            />
          ))}
        </div>

        <div className="mt-2.5 flex justify-between text-[11px] text-ops-text-muted">
          <span>{firstDay ? formatDay(firstDay.date) : null}</span>
          <span>{lastDay ? formatDay(lastDay.date) : null}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <RevenueBreakdown
          title="Revenue by service"
          caption="All completed orders"
          barClassName="bg-ops-accent"
          emptyMessage="No completed orders yet."
          items={revenue.byServiceType.map((service) => ({
            id: service.vehicleTypeSpecId,
            label: service.label,
            total: service.total,
            orderCount: service.orderCount,
          }))}
        />

        <RevenueBreakdown
          title="Revenue by region"
          caption="All completed orders · by driver's city"
          barClassName="bg-sky-400"
          emptyMessage="No completed orders yet."
          items={revenue.byRegion.map((region) => ({
            id: region.city,
            label: formatRegion(region.city),
            total: region.total,
            orderCount: region.orderCount,
          }))}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-ops-border">
        <div className="px-5.5 pt-4.5 pb-1 text-sm font-semibold">
          Driver payouts
        </div>
        <div className="px-5.5 pb-3.5 text-[11px] tracking-wide text-ops-text-muted uppercase">
          Last 90 days · not affected by the period selector
        </div>
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 border-b border-ops-border px-5.5 py-2.5 text-[11px] tracking-wide text-ops-text-muted uppercase">
          <div>Driver</div>
          <div>Orders completed</div>
          <div>Earned</div>
        </div>
        {revenue.driverPayouts.length === 0 ? (
          <div className="p-8 text-center text-sm text-ops-text-muted">
            No completed deliveries in this window.
          </div>
        ) : (
          revenue.driverPayouts.map((payout) => (
            <div
              key={payout.userId}
              className="grid grid-cols-[1.4fr_1fr_1fr] items-center gap-3 border-b border-ops-border/60 px-5.5 py-3 text-sm last:border-none"
            >
              <div className="truncate">{payout.name}</div>
              <div>{payout.completedOrdersCount}</div>
              <div>{formatCurrency(payout.totalEarned)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
