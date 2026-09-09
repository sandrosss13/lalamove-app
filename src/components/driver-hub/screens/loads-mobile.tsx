"use client";

import { useLoadsBoard } from "@/components/driver-hub/screens/loads-context";
import { pluralise } from "@/components/driver-hub/screens/loads-format";

/**
 * **Placeholder. The real mobile board is task-13 (`task-13-mobile-board.md`).**
 *
 * Mobile only: `lg:hidden`, the counterpart to `loads-table.tsx`'s
 * `hidden lg:block`. Both are always in the DOM; the breakpoint chooses which
 * one paints.
 *
 * **Takes no props, by contract.** Everything comes from `useLoadsBoard()`.
 * task-13 rewrites the body of this file and nothing else — see the note in
 * `loads-table.tsx`, which applies identically here.
 */
export function LoadsMobile() {
  const { visibleLoads } = useLoadsBoard();

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground lg:hidden">
      <p className="tabular-nums">
        Mobile board — coming soon ({pluralise(visibleLoads.length, "load")}).
      </p>
    </div>
  );
}
