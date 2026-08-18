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

type Metric = {
  label: string;
  value: string;
  /** One line under the number, saying what the number counts. */
  hint: string;
};

function metricsFor(summary: SalesSummary): Metric[] {
  return [
    {
      // "Turnover" and "Revenue" are the same `sum(price)` over different sets
      // of orders, so both labels name their set — otherwise the two cards read
      // as the same number computed twice.
      label: "Turnover (all orders)",
      value: formatCurrency(summary.turnover),
      hint: "Gross bookings placed in range",
    },
    {
      label: "Revenue (completed orders)",
      value: formatCurrency(summary.revenue),
      hint: "Recognised on delivery",
    },
    {
      label: "Completed",
      value: countFormatter.format(summary.completedCount),
      hint: "Delivered orders",
    },
    {
      label: "In process",
      value: countFormatter.format(summary.inProcessCount),
      hint: "Claimed, accepted or in transit",
    },
    {
      label: "Pending",
      value: countFormatter.format(summary.pendingCount),
      hint: "Awaiting a carrier",
    },
    {
      label: "Cancelled",
      value: countFormatter.format(summary.cancelledCount),
      hint: "Called off before delivery",
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
 */
export function MetricCards({ summary }: { summary: SalesSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metricsFor(summary).map((metric) => (
        <Card key={metric.label} size="sm">
          <CardHeader>
            <CardDescription className="text-xs">
              {metric.label}
            </CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {metric.value}
            </CardTitle>
            <CardDescription className="text-xs">{metric.hint}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
