import { useTranslations } from "next-intl";

import type { SalesSummary } from "@/lib/admin/analytics";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Formatters are module-level so a re-render never rebuilds them (the same
 * reason `ops-revenue-tab.tsx` hoists its own).
 */
const currencyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const countFormatter = new Intl.NumberFormat("en-US");

/**
 * Money is shown to the cent rather than rounded to whole units: these figures
 * are reconciled against the Excel export, which carries the exact values.
 */
function formatCurrency(value: number): string {
  return `$${currencyFormatter.format(value)}`;
}

/**
 * `labelKey` / `hintKey` are full message paths rather than copy: `metricsFor`
 * is a plain function, so the text is resolved where the card renders.
 */
type Metric = {
  labelKey: string;
  value: string;
  /** One line under the number, saying what the number counts. */
  hintKey: string;
};

function metricsFor(summary: SalesSummary): Metric[] {
  return [
    {
      // "Turnover" and "Revenue" are the same `sum(price)` over different sets
      // of orders, so both labels name their set — otherwise the two cards read
      // as the same number computed twice.
      //
      // "paid", not "all": `getSalesSummary` leaves out `INITIATED`, the
      // pre-payment state, so "all orders" would now name a set this figure
      // does not cover.
      labelKey: "admin.metricCards.turnoverPaidOrders",
      value: formatCurrency(summary.turnover),
      hintKey: "admin.metricCards.grossBookingsPlacedInRange",
    },
    {
      labelKey: "admin.metricCards.revenueCompletedOrders",
      value: formatCurrency(summary.revenue),
      hintKey: "admin.metricCards.recognisedOnDelivery",
    },
    {
      labelKey: "common.shared.completed",
      value: countFormatter.format(summary.completedCount),
      hintKey: "admin.metricCards.deliveredOrders",
    },
    {
      labelKey: "admin.metricCards.inProcess",
      value: countFormatter.format(summary.inProcessCount),
      hintKey: "admin.metricCards.claimedAcceptedOrInTransit",
    },
    {
      labelKey: "common.shared.pending",
      value: countFormatter.format(summary.pendingCount),
      hintKey: "admin.metricCards.awaitingACarrier",
    },
    {
      labelKey: "common.shared.cancelled",
      value: countFormatter.format(summary.cancelledCount),
      hintKey: "admin.metricCards.calledOffBeforeDelivery",
    },
  ];
}

/**
 * The dashboard's headline row. Purely presentational — it takes an already
 * computed `SalesSummary` and never queries or fetches, so the page owns the
 * selected range and this owns nothing but the layout.
 *
 * Every card is counted over `Order.createdAt`, i.e. when the order was
 * *placed*, including the completed/cancelled ones: an order booked on the last
 * day of the range and delivered a week later still belongs to the range it was
 * booked in, so the counts always add up to the orders behind `turnover`.
 *
 * Every card is also over paid orders only — `INITIATED`, the pre-payment
 * state, is outside the report entirely. See `toSalesCountKey` in
 * `src/lib/admin/analytics.ts`.
 */
export function MetricCards({ summary }: { summary: SalesSummary }) {
  const t = useTranslations();

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metricsFor(summary).map((metric) => (
        <Card key={metric.labelKey} size="sm">
          <CardHeader>
            <CardDescription className="text-xs">
              {t(metric.labelKey)}
            </CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {metric.value}
            </CardTitle>
            <CardDescription className="text-xs">
              {t(metric.hintKey)}
            </CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
