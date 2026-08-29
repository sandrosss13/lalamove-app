import * as React from "react";

/**
 * Wraps every design-sync preview in the `data-admin-surface` marker this
 * design system's primitives are actually built against (see globals.css:
 * `body:has([data-admin-surface])` and `[data-admin-surface] *`). Without
 * it, `bg-accent` / `bg-muted` (used throughout button/select/dropdown-menu/
 * popover/card hover + surface states) resolve to the landing page's warm
 * palette instead of the neutral shadcn tokens - and the default `border`
 * color falls back to `currentColor` instead of `--border`. This is a
 * design-sync-only wrapper (not part of the app's real component set) so
 * every rendered preview matches how these primitives actually look inside
 * the app's admin back office.
 */
export function DsAdminSurface({ children }: { children?: React.ReactNode }) {
  return (
    <div data-admin-surface style={{ minHeight: "100%" }}>
      {children}
    </div>
  );
}
