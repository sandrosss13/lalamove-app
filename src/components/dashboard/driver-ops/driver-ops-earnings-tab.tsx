"use client";

import { useMemo, useState } from "react";

import type { DriverDashboardData } from "@/lib/driver-dashboard-data";

/**
 * Trend windows the selector offers, in days. Every value has to stay <= the 90
 * entries `earnings.dailyTrend` always carries: picking one only slices that
 * already-fetched array client-side, it never re-queries.
 */
const PERIODS = [7, 30, 90] as const;

type PeriodDays = (typeof PERIODS)[number];

const DEFAULT_PERIOD_DAYS: PeriodDays = 30;

/**
 * Formatters are module-level so re-renders don't rebuild them. Whole dollars:
 * these are at-a-glance KPI figures, and the locale is pinned rather than left
 * to the runtime because this tree server-renders and then hydrates — a
 * machine-dependent grouping separator would be a hydration mismatch.
 */
const currencyFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/**
 * Trend days are UTC buckets (the data module keys them off `Date.UTC`), so
 * they must be formatted in UTC too — a local-time render would shift every
 * label a day for anyone west of Greenwich.
 */
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatCurrency(amount: number): string {
  return `$${currencyFormatter.format(amount)}`;
}

/** "2026-03-04" → "Mar 4". */
function formatDay(isoDate: string): string {
  return dayFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/** One KPI in the header grid. */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ops-border bg-ops-surface p-4.5">
      <div className="text-[11px] font-medium tracking-wide text-ops-text-muted uppercase">
        {label}
      </div>
      <div className="font-ops mt-2 text-xl leading-none font-semibold">
        {value}
      </div>
    </div>
  );
}

/**
 * Earnings tab: this driver's own daily earnings trend, with a client-side
 * period selector driving both the chart and the two KPIs above it.
 *
 * Deliberately narrower than the company console's Revenue tab — one driver has
 * a single slice of earnings, not a fleet to break down by service or region,
 * and no payout ledger exists in the schema — so nothing here is estimated or
 * fabricated to fill the space. Every figure is derived from `dailyTrend`, which
 * already arrives zero-filled at exactly one entry per day.
 */
export function DriverOpsEarningsTab({
  earnings,
}: {
  earnings: DriverDashboardData["earnings"];
}) {
  const [periodDays, setPeriodDays] = useState<PeriodDays>(DEFAULT_PERIOD_DAYS);

  const { trendSlice, maxDaily, periodTotal, dailyAverage } = useMemo(() => {
    const slice = earnings.dailyTrend.slice(-periodDays);
    const total = slice.reduce((sum, day) => sum + day.total, 0);

    return {
      trendSlice: slice,
      // Bars scale against the tallest day *in the slice*, so a short window is
      // never flattened by an outlier that sits outside it. The floor keeps an
      // all-zero window from dividing by 0.
      maxDaily: Math.max(1, ...slice.map((day) => day.total)),
      periodTotal: total,
      // Averaged over the days actually present rather than over `periodDays`:
      // the two are the same for a full 90-entry trend, but this stays honest if
      // the window ever returns short.
      dailyAverage: slice.length > 0 ? total / slice.length : 0,
    };
  }, [earnings.dailyTrend, periodDays]);

  const hasEarningsInPeriod = periodTotal > 0;
  const firstDay = trendSlice.at(0);
  const lastDay = trendSlice.at(-1);

  return (
    <div className="flex flex-col gap-5">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile
          label={`Earned · last ${periodDays} days`}
          value={formatCurrency(periodTotal)}
        />
        <StatTile label="Daily average" value={formatCurrency(dailyAverage)} />
      </div>

      <div className="rounded-xl border border-ops-border bg-ops-surface p-5.5">
        <div className="mb-1 flex items-baseline justify-between">
          <div className="text-sm font-semibold">Earnings trend</div>
          {/* The bars are relative-height only, so this is the chart's single
              quantitative anchor — without it the plot has no scale at all. */}
          <div className="text-[11px] text-ops-text-muted">
            Best day {formatCurrency(hasEarningsInPeriod ? maxDaily : 0)}
          </div>
        </div>
        <div className="mb-4.5 text-[11px] tracking-wide text-ops-text-muted uppercase">
          Completed deliveries, daily
        </div>

        {/* The bars carry no text, so the plot is announced as a single image
            with a summary rather than as up to 90 unlabelled elements. */}
        <div
          role="img"
          aria-label={`Your daily earnings for the last ${periodDays} days, totalling ${formatCurrency(periodTotal)}`}
          className="flex h-[170px] items-end gap-1"
        >
          {trendSlice.map((day) => (
            <div
              key={day.date}
              title={`${formatDay(day.date)}: ${formatCurrency(day.total)}`}
              style={{ height: `${(day.total / maxDaily) * 100}%` }}
              // A zero day still draws a stub so the axis stays continuous; the
              // muted fill stops that stub from reading as a tiny payday.
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

        {hasEarningsInPeriod ? null : (
          <div className="mt-3 text-center text-sm text-ops-text-muted">
            No completed deliveries in this period.
          </div>
        )}
      </div>
    </div>
  );
}
