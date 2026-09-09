"use client";

import { useLoadsBoard } from "@/components/driver-hub/screens/loads-context";
import { pluralise } from "@/components/driver-hub/screens/loads-format";

/**
 * **Placeholder. The real desktop table is task-10 (`task-10-loads-table.md`).**
 *
 * Desktop only: `hidden lg:block`, the same `lg` breakpoint `MasterDetailSplit`
 * already gates the hub's two-column layouts on. `loads-mobile.tsx` is its
 * `lg:hidden` counterpart and both render unconditionally — the switch is CSS,
 * never a JS-measured breakpoint, which would either mismatch on hydration or
 * need a third "not yet known" render state.
 *
 * **Takes no props, by contract.** Everything comes from `useLoadsBoard()`.
 * task-10 rewrites the body of this file and nothing else: not
 * `loads-screen.tsx`, not `loads-context.tsx`, not this function's name or
 * signature. Three other agents are editing the three sibling files at the same
 * time.
 */
export function LoadsTable() {
  const { visibleLoads, hiddenByCapacityCount } = useLoadsBoard();

  return (
    <div className="hidden rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground lg:block">
      <p className="tabular-nums">
        Loads table — coming soon ({pluralise(visibleLoads.length, "load")}).
      </p>
      {hiddenByCapacityCount > 0 ? (
        <p className="mt-1 text-xs tabular-nums">
          {pluralise(hiddenByCapacityCount, "load")} hidden — over your vehicle
          capacity or dimensions.
        </p>
      ) : null}
    </div>
  );
}
