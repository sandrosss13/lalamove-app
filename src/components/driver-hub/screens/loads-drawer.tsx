"use client";

import { useLoadsBoard } from "@/components/driver-hub/screens/loads-context";
import { Button } from "@/components/ui/button";

/**
 * **Placeholder. The real detail drawer is task-11 (`task-11-load-drawer.md`).**
 *
 * Renders nothing when no row is selected, matching the design's "hidden
 * entirely when nothing is selected" — not an empty rail.
 *
 * **`data-admin-surface` on the outermost element is required and is not
 * decoration.** This is `position: fixed`, so it is visually detached from the
 * shell's layout even though it is not (yet) a React portal; if task-11 moves
 * it onto a portal root — a Radix `Sheet`/`Dialog` — the attribute must move
 * with it. Without it the `bg-accent`/`bg-muted`/border tokens resolve to the
 * marketing palette instead of the hub's. Nothing errors; the colours are just
 * quietly wrong, which is why this placeholder carries a working example rather
 * than only a warning.
 *
 * `top-[61px]` clears the hub's sticky header, which is that tall.
 *
 * **Takes no props, by contract.** Everything comes from `useLoadsBoard()`.
 * task-11 rewrites the body of this file and nothing else. It is also the task
 * that adds this feature's clock/date and relative-time formatters — to
 * `loads-format.ts`, not to a second formatting module.
 */
export function LoadsDrawer() {
  const { selectedLoad, selectLoad } = useLoadsBoard();

  if (selectedLoad === null) {
    return null;
  }

  return (
    <div
      data-admin-surface=""
      className="fixed top-[61px] right-0 bottom-0 z-30 hidden w-[400px] max-w-[92vw] overflow-y-auto border-l border-border bg-card p-4 text-sm lg:block"
    >
      <p className="text-muted-foreground">
        Load drawer — coming soon (
        <span className="font-price tabular-nums">
          {selectedLoad.reference}
        </span>
        ).
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => selectLoad(null)}
        className="mt-3"
      >
        Close
      </Button>
    </div>
  );
}
