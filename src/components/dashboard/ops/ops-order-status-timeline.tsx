import type { OpsOrder } from "@/lib/company-dashboard-data";

/**
 * The happy path of an order's life, in order. `CANCELLED` is absent on
 * purpose — it is not a position on this track but an exit from it, and is
 * rendered as its own terminal label below.
 *
 * `CLAIMED` sits between placement and assignment: it only ever lights up for
 * orders this company has taken off the market. An independent driver's order
 * skips straight from `PENDING` to `ACCEPTED`, but a company never sees one of
 * those past the point it is still an open listing.
 */
const STEPS: { key: OpsOrder["status"]; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "CLAIMED", label: "Claimed" },
  { key: "ACCEPTED", label: "Assigned" },
  { key: "IN_TRANSIT", label: "In transit" },
  { key: "COMPLETED", label: "Delivered" },
];

const STEP_ORDER = STEPS.map((step) => step.key);

/**
 * Read-only progress track for a single order, shown at the top of the
 * order-detail drawer.
 *
 * Purely presentational: it reports where the order stands and never offers a
 * way to move it along — advancing a delivery is the assigned driver's action,
 * not the dispatching company's.
 */
export function OpsOrderStatusTimeline({ order }: { order: OpsOrder }) {
  if (order.status === "CANCELLED") {
    return (
      <div className="rounded-lg border border-ops-danger/40 bg-ops-danger/10 py-3 text-center text-sm font-medium text-ops-danger">
        Cancelled
      </div>
    );
  }

  const currentIndex = STEP_ORDER.indexOf(order.status);

  return (
    <div className="relative my-6 flex">
      {/* The connecting rail, inset by half a column so it starts and ends at
          the first and last dots rather than at the container's edges. */}
      <div className="absolute top-[5px] right-6 left-6 z-0 h-0.5 bg-ops-border" />
      {STEPS.map((step, index) => {
        const reached = index <= currentIndex;
        return (
          <div
            key={step.key}
            className="relative z-10 flex flex-1 flex-col items-center"
          >
            <div
              className={`h-2.5 w-2.5 rounded-full ${reached ? "bg-ops-accent" : "bg-ops-border"}`}
            />
            <div
              className={`mt-1.5 text-center text-[11px] ${reached ? "text-ops-text" : "text-ops-text-muted"}`}
            >
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
