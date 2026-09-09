"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { DriverHubHeader } from "@/components/driver-hub/driver-hub-header";
import { DriverHubSidebar } from "@/components/driver-hub/driver-hub-sidebar";
import {
  hubNavForAccount,
  hubNavItemForPath,
} from "@/components/driver-hub/driver-hub-nav";
import type { HubAccount } from "@/lib/dashboard/hub/account";

/**
 * The driver hub's frame: a fixed 248px rail, a sticky header, and the page
 * body every screen renders into.
 *
 * Mirrors `src/components/admin/admin-shell.tsx` — a server layout resolves the
 * signed-in account once and hands it to one client shell, which owns the
 * chrome and derives the active nav entry from `usePathname()`. Nothing here
 * fetches: the account is already plain serialisable data by the time it
 * crosses this boundary.
 *
 * `data-admin-surface` on the root is load-bearing three times over (see the
 * `body:has([data-admin-surface])` block in `globals.css`): it pins this
 * surface to the light scheme the `src/components/ui` primitives are toned
 * for, resolves the `accent`/`muted` token collision between the shadcn and
 * landing palettes, and hides the global site header — which would otherwise
 * stack a second navbar above this one. `font-body` opts the subtree into IBM
 * Plex Sans, which is a variable rather than a `body` default in this project.
 *
 * Radix **portalled** content (SelectContent, DialogContent, PopoverContent,
 * DropdownMenuContent) renders outside this subtree and therefore outside the
 * attribute, so every such element must repeat `data-admin-surface=""` on
 * itself — see `src/components/fleet-onboarding/steps/step-4-drivers-assignment.tsx`
 * for the precedent.
 */

/* -------------------------------------------------------------------------- */
/* Header overrides                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The pieces of the sticky header a screen may override from below it.
 *
 * One context carrying both overrides rather than two nested providers: they
 * describe the same bar, they are set by the same kind of mount-time effect,
 * and a second provider around the same children would buy nothing but another
 * layer to read past. Named `HubHeaderContextValue` (it was
 * `HubSubtitleContextValue`) now that it carries more than the subtitle —
 * `useHubSubtitle`'s exported name and behaviour are unchanged, so no caller
 * moved.
 */
type HubHeaderContextValue = {
  /** `null` restores the active nav item's static subtitle. */
  setSubtitle: (subtitle: string | null) => void;
  /** `null` hides the vehicle pill — the default for every screen but Loads. */
  setVehiclePill: (pill: React.ReactNode | null) => void;
};

const HubHeaderContext = React.createContext<HubHeaderContextValue | null>(
  null,
);

/**
 * Lets a screen replace the header's subhead with one derived from its data.
 *
 * Six of the seven subheads are runtime values — Today's date, Earnings' chosen
 * range, and the counts on Jobs, Vehicles, Drivers and Employees — while
 * `driver-hub-nav.ts` can only carry a static literal, which is what renders
 * before a screen's data resolves. A screen therefore *calls this hook* with
 * its own string rather than reaching into the header:
 *
 * ```tsx
 * // inside a "use client" screen rendered under <DriverHubShell>
 * useHubSubtitle(`${jobs.length} jobs in the last 30 days`);
 * ```
 *
 * Pass `null` while the value is still unknown and the static fallback stays
 * up. The override is registered in an effect, never during render — writing to
 * a parent's state mid-render is the classic "cannot update a component while
 * rendering a different component" warning — and it is cleared on unmount, so
 * navigating to a screen that sets no subtitle cannot inherit the previous
 * one's. React runs an unmounting subtree's cleanups before the entering
 * subtree's effects within the same commit, so the clear can never land after
 * the next screen's set.
 *
 * Only callable inside the shell; a screen outside it has no header to retitle.
 */
export function useHubSubtitle(subtitle: string | null): void {
  const context = React.useContext(HubHeaderContext);

  if (context === null) {
    throw new Error(
      "useHubSubtitle must be called inside <DriverHubShell> — it retitles " +
        "the hub header, which only exists under src/app/dashboard/(hub).",
    );
  }

  const { setSubtitle } = context;

  React.useEffect(() => {
    setSubtitle(subtitle);

    return () => {
      setSubtitle(null);
    };
  }, [setSubtitle, subtitle]);
}

/**
 * Lets a screen render extra content in the header's right-hand row, between
 * the title/spacer and the account chip — today only the Load Board's
 * vehicle-capacity pill (design §1 of
 * `specs/driver-load-board/tasks/task-09-board-shell.md`).
 *
 * The same registration pattern, and the same reasoning, as `useHubSubtitle`
 * above: set in an effect rather than during render, cleared on unmount, so
 * navigating away from Loads cannot leave a stale pill up on the next screen.
 *
 * **Pass a memoised node, or `null`.** The effect's dependency is the node
 * itself, and JSX constructed inline during render is a fresh object every
 * time — an un-memoised pill would re-register on every render of the calling
 * screen, which is a wasted state write per keystroke in the filter panel. The
 * one caller (`loads-screen.tsx`) wraps its pill in `React.useMemo`.
 */
export function useHubVehiclePill(pill: React.ReactNode | null): void {
  const context = React.useContext(HubHeaderContext);

  if (context === null) {
    throw new Error(
      "useHubVehiclePill must be called inside <DriverHubShell> — it fills a " +
        "slot in the hub header, which only exists under src/app/dashboard/(hub).",
    );
  }

  const { setVehiclePill } = context;

  React.useEffect(() => {
    setVehiclePill(pill);

    return () => {
      setVehiclePill(null);
    };
  }, [setVehiclePill, pill]);
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export type DriverHubShellProps = {
  /** Resolved once by `(hub)/layout.tsx` via `resolveHubAccount()`. */
  account: HubAccount;
  children: React.ReactNode;
};

/**
 * What the header shows on a path that matches no nav entry. Unreachable from
 * inside the `(hub)` route group — every child of this shell is one of the
 * eight registered screens — but a title is cheaper than a crash if a future
 * route lands here before it registers itself in `HUB_NAV`.
 */
const FALLBACK_TITLE = "Driver Hub";

export function DriverHubShell({ account, children }: DriverHubShellProps) {
  const pathname = usePathname();
  const [subtitleOverride, setSubtitleOverride] = React.useState<string | null>(
    null,
  );
  const [vehiclePillOverride, setVehiclePillOverride] =
    React.useState<React.ReactNode | null>(null);

  // `useState`'s setters are referentially stable, so the context value only
  // has to be memoised against itself — it never changes, and every screen's
  // registration effect therefore runs once rather than on each shell
  // re-render.
  const headerContext = React.useMemo<HubHeaderContextValue>(
    () => ({
      setSubtitle: setSubtitleOverride,
      setVehiclePill: setVehiclePillOverride,
    }),
    [],
  );

  // Nav filtering is cosmetic — hiding a link does nothing about a hand-typed
  // URL, so every screen withheld from a persona re-derives its own rule
  // server-side: `drivers/page.tsx` and `employees/page.tsx` on
  // `kind !== "BUSINESS"`, and `loads/page.tsx` on the roster case (which
  // `GET /api/loads` 403s to match). The Wallet is now withheld from a roster
  // driver in the list below, and `earnings/page.tsx` owes it the matching
  // server-side redirect.
  const items = hubNavForAccount(account);
  const activeItem = hubNavItemForPath(pathname);

  return (
    <div
      data-admin-surface
      className="flex min-h-screen bg-background font-body text-foreground"
    >
      <DriverHubSidebar
        items={items}
        activeId={activeItem?.id}
        persona={account.persona}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <DriverHubHeader
          account={account}
          title={activeItem?.title ?? FALLBACK_TITLE}
          subtitle={subtitleOverride ?? activeItem?.subtitle ?? ""}
          vehiclePill={vehiclePillOverride}
        />

        {/* Page body: 28px 32px 56px, one 1180px content column, sections
            stacked with a 20px gap — so a screen returns its sections as
            siblings and never restates the page's own spacing. */}
        <main className="min-w-0 flex-1 px-8 pt-7 pb-14">
          <div className="flex min-w-0 max-w-[1180px] flex-col gap-5">
            <HubHeaderContext.Provider value={headerContext}>
              {children}
            </HubHeaderContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}
