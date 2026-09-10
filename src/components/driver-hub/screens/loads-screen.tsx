"use client";

import * as React from "react";

import { useHubVehiclePill } from "@/components/driver-hub/driver-hub-shell";
import { HubEmptyState } from "@/components/driver-hub/hub-primitives";
import { LoadsClaimDialogs } from "@/components/driver-hub/screens/loads-claim-dialogs";
import {
  LoadsProvider,
  useLoadsBoard,
  type LoadsClaimVehicle,
  type LoadsVehicleClass,
} from "@/components/driver-hub/screens/loads-context";
import { LoadsDrawer } from "@/components/driver-hub/screens/loads-drawer";
import { LoadsFilters } from "@/components/driver-hub/screens/loads-filters";
import {
  formatDims,
  formatWeightKg,
  pluralise,
  type VehicleCapability,
} from "@/components/driver-hub/screens/loads-format";
import { LoadsMobile } from "@/components/driver-hub/screens/loads-mobile";
import { LoadsTable } from "@/components/driver-hub/screens/loads-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HubAccountKind } from "@/lib/dashboard/hub/account";

/**
 * The load board: open client bookings this account can claim, the ones it
 * already holds, and the ones it has hidden.
 *
 * This file is *composition only*. It mounts the provider, registers the
 * header's vehicle pill, draws the tab bar and the filter toggle, and renders
 * the four Wave 4 surfaces. Every piece of state it reads comes from
 * `useLoadsBoard()`; it computes nothing.
 *
 * ## Why the four surfaces take no props
 *
 * `loads-table.tsx`, `loads-drawer.tsx`, `loads-claim-dialogs.tsx` and
 * `loads-mobile.tsx` are implemented by four agents working simultaneously
 * (task-10 through task-13). Each rewrites the body of exactly one of those
 * files. A prop passed from here would be a shared edge between this file and
 * one of theirs — and the first thing any of them would need to change. Reading
 * from the context instead means the boundary holds without coordination.
 *
 * ## No Desktop/Mobile segmented control
 *
 * The design's prototype has one, and its own note says to drop it in
 * production and use real breakpoints. `LoadsTable` (`hidden lg:block`) and
 * `LoadsMobile` (`lg:hidden`) are both always mounted and CSS picks. Nothing
 * replaces the control.
 *
 * ## The Filters control follows the list it actually filters
 *
 * `filtersApply` is false on "My loads" and in the rejected sub-view, where
 * `visibleLoads` ignores the four filter controls outright. The toggle is then
 * rendered **disabled with a reason** rather than removed: that is what the
 * rest of the hub does with a control it cannot honour — the drawer's "Open job
 * sheet", `employees-screen.tsx`, `vehicles-add-form.tsx` — it keeps the tab
 * bar's right edge from jumping as the driver switches tabs, and it says the
 * filters still exist rather than implying this board never had any.
 *
 * The active-count badge is *suppressed* instead, because it is not a control
 * but a claim about the list on screen: "2 filters active" over a list nothing
 * is filtering is false, and a greyed-out number is still the same number.
 * `activeFilterCount` keeps its meaning — what is set, not what is biting.
 *
 * The panel closes with it, for the same reason plus one more: a disabled
 * toggle beside an open panel of live-looking selects is a dead end, since the
 * only control that closes the panel is the one that has just been switched
 * off. `filtersOpen` is left untouched, so the panel returns exactly as the
 * driver left it when the open board comes back.
 */

/**
 * The header pill's data: a class label plus the capacity resolved for it.
 * Built server-side in `loads/page.tsx` — it describes the account's own
 * vehicle, which `GET /api/loads` (an endpoint about loads) does not return.
 */
export type HubVehiclePill = {
  label: string;
  capability: VehicleCapability;
};

/**
 * Why Filters is disabled on "My loads" and in the rejected sub-view.
 *
 * One string for the visible tooltip and the `sr-only` sentence beside it, so
 * the two cannot drift — the pairing `loads-drawer.tsx` and
 * `hub-online-toggle.tsx` both use for their own disabled controls, because a
 * `title` alone reaches a mouse and nobody else.
 */
const FILTERS_INERT_TITLE =
  "Filters apply to the open board only. My loads and the rejected list " +
  "always show every load.";

export type LoadsScreenProps = {
  /** Picks which claim endpoint `confirmClaim()` calls. */
  accountKind: HubAccountKind;
  /**
   * The driver's registered vehicles, with the capacity and body-type facts a
   * claim is decided on. Empty for a company.
   */
  claimVehicles: LoadsClaimVehicle[];
  /**
   * The vehicle-class catalogue, which the board looks a load's booked class up
   * in to build the capacity floor a claim vehicle must clear. Empty for a
   * company. Both of these are passed straight through to `LoadsProvider` —
   * this file computes nothing, per its own doc comment.
   */
  vehicleClasses: LoadsVehicleClass[];
  /** `null` for an account with no vehicle registered yet — the pill is absent. */
  vehiclePill: HubVehiclePill | null;
};

export function LoadsScreen({
  accountKind,
  claimVehicles,
  vehicleClasses,
  vehiclePill,
}: LoadsScreenProps) {
  return (
    <LoadsProvider
      accountKind={accountKind}
      claimVehicles={claimVehicles}
      vehicleClasses={vehicleClasses}
    >
      <LoadsScreenBody vehiclePill={vehiclePill} />
    </LoadsProvider>
  );
}

/**
 * Split out from `LoadsScreen` for one reason: `useLoadsBoard()` has to be
 * called *below* `<LoadsProvider>`, and a component cannot consume a context it
 * renders itself.
 */
function LoadsScreenBody({
  vehiclePill,
}: {
  vehiclePill: HubVehiclePill | null;
}) {
  const {
    isLoading,
    loadError,
    tab,
    setTab,
    filtersOpen,
    setFiltersOpen,
    activeFilterCount,
    filtersApply,
    availableCount,
    mineCount,
  } = useLoadsBoard();

  // Memoised because `useHubVehiclePill` registers its argument in an effect
  // keyed on identity: inline JSX is a new object every render, which would
  // re-register the pill on every keystroke in the filter panel.
  const pillNode = React.useMemo(() => {
    if (vehiclePill === null) {
      return null;
    }

    return (
      <div className="flex items-center gap-2 rounded-lg border border-border py-[5px] pr-[10px] pl-2">
        {/* Decorative: the pill's meaning is entirely in its text, and a dot
            announced as "green circle" tells a screen reader nothing. */}
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-[oklch(59.6%_0.145_163.225)]"
        />
        <span className="text-xs text-muted-foreground">Vehicle</span>
        <span className="font-price text-xs tabular-nums">
          {vehiclePill.label} ·{" "}
          {formatWeightKg(vehiclePill.capability.payloadKg)} ·{" "}
          {formatDims(vehiclePill.capability)}
        </span>
      </div>
    );
  }, [vehiclePill]);

  useHubVehiclePill(pillNode);

  if (isLoading) {
    return <HubEmptyState message="Loading loads…" />;
  }

  if (loadError !== null) {
    return (
      <HubEmptyState message="Couldn't load the board.">
        <p className="mt-1 text-sm">{loadError}</p>
      </HubEmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-4">
        {/* `variant="line"` is the underline treatment the design draws — no
            pill background, an `after:` bottom border on the active trigger.
            Not `FilterStrip`, which the rest of the hub uses and which is the
            filled-pill look this design does not have. */}
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "available" | "mine")}
        >
          <TabsList variant="line" className="h-auto gap-5 bg-transparent p-0">
            <TabsTrigger
              value="available"
              className="rounded-none border-none px-0 py-2.5 text-sm font-medium text-muted-foreground data-active:text-foreground"
            >
              Available loads{" "}
              {/* The counts are over the raw arrays, so they do not shrink when
                  a filter is on — the tab says how much work exists, the list
                  says how much of it you are looking at. */}
              <span className="text-muted-foreground tabular-nums">
                ({availableCount})
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="mine"
              className="rounded-none border-none px-0 py-2.5 text-sm font-medium text-muted-foreground data-active:text-foreground"
            >
              My loads{" "}
              <span className="text-muted-foreground tabular-nums">
                ({mineCount})
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!filtersApply}
          title={filtersApply ? undefined : FILTERS_INERT_TITLE}
          onClick={() => setFiltersOpen(!filtersOpen)}
          // Tracks the panel below, which is gated on both — on the two lists
          // the filters do not reach, the button controls nothing that is open.
          aria-expanded={filtersOpen && filtersApply}
          className="gap-1.5 text-[13px] font-medium"
        >
          Filters
          {/* Absent at zero rather than showing "0": a badge reading nothing is
              a badge that costs the eye a fixation to dismiss. Absent again
              wherever the filters do not reach the list — the count would then
              be describing rows nothing has removed. */}
          {filtersApply && activeFilterCount > 0 ? (
            <Badge
              className="h-auto rounded-full bg-foreground px-1.5 py-0 text-[11px] text-background tabular-nums"
              aria-label={pluralise(activeFilterCount, "filter") + " active"}
            >
              {activeFilterCount}
            </Badge>
          ) : null}
          {/* A disabled button is out of the tab order and its `title` is not
              reliably announced, so the reason is real text too. */}
          {filtersApply ? null : (
            <span className="sr-only">{FILTERS_INERT_TITLE}</span>
          )}
        </Button>
      </div>

      {filtersOpen && filtersApply ? <LoadsFilters /> : null}

      <LoadsTable />
      <LoadsMobile />
      <LoadsDrawer />
      <LoadsClaimDialogs />
    </div>
  );
}
