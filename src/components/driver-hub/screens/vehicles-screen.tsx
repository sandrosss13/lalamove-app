"use client";

import * as React from "react";

import { useHubSubtitle } from "@/components/driver-hub/driver-hub-shell";
import {
  FilterStrip,
  HubCard,
  HubEmptyState,
  HubStatusBadge,
  MasterDetailSplit,
  MetricTile,
  SampleNote,
  type FilterStripItem,
} from "@/components/driver-hub/hub-primitives";
import { VehiclesAddForm } from "@/components/driver-hub/screens/vehicles-add-form";
import { VehiclesDetailPanel } from "@/components/driver-hub/screens/vehicles-detail-panel";
import {
  formatGel,
  formatOdometer,
  pluralise,
} from "@/components/driver-hub/screens/vehicles-format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HubVehicle, HubVehiclesData } from "@/lib/dashboard/hub/vehicles";
import { cn } from "@/lib/utils";

/**
 * Vehicles — the fleet a company owns, or the vehicle one driver drives.
 *
 * One screen for all three personas, because `getHubVehicles()` already
 * resolved the scope difference. What changes here is the wording of two tile
 * notes, the empty state and the header subtitle — "Held by a driver right
 * now" and "Available to hand to a driver" both describe a move only a fleet
 * manager can make — **and one affordance**: a driver on a company's roster
 * gets no "Add vehicle" button,
 * because they drive a van their employer owns and assigned to them and there
 * is nothing for them to register.
 *
 * That hidden button is *cosmetic*, in exactly the sense
 * `src/components/driver-hub/driver-hub-nav.ts` means it for `hiddenFor`. The
 * boundary is `POST /api/driver-profile/vehicles`, which returns `403` to a
 * caller whose `DriverProfile.companyId` is non-null whether or not this screen
 * ever drew the button. So the button reads the loader's decided
 * `canAddVehicle` verdict rather than re-testing the persona here: a second
 * copy of the rule in the client is free to drift away from the endpoint that
 * actually decides. `persona` is read only for wording, where three distinct
 * sentences are needed and `kind` can tell only two apart.
 *
 * ## What the design asks for and what ships
 *
 * The handoff's tab strip has five entries (All / Active / In service / Idle /
 * Defleeted) and its destructive action is a reversible defleet. Neither can be
 * honest: `Vehicle` has no lifecycle column, so `HubVehicleStatus` is the two
 * states an open `DriverVehicleAssignment` can actually distinguish, and the
 * remove endpoint is a hard delete. Rather than render three tabs that would
 * always be empty, this screen offers only the ones its data can fill — plus a
 * **Needs review** tab, which is not in the design but *is* real: a PENDING or
 * FLAGGED `BusinessApplicationVehicle` blocks dispatch, and an operator has no
 * other place on this screen to find the vehicles it is blocking. That tab
 * appears only when at least one vehicle is in one of those states, so it is
 * never a dead pill either.
 *
 * That tab is now the **only** surface for a blocking review verdict. The rows
 * and the detail panel used to carry a second status pill beside the Active /
 * Idle one; the handoff has a single right-aligned pill per row
 * (`<div style="text-align:right"><span style="{{ v.tagStyle }}">{{ v.status
 * }}</span></div>`) and a two-pill panel header (status + class), and the extra
 * pill also grew the row past the design's height. So the pills went and the
 * tab stayed — if that tab is ever dropped, a flagged vehicle becomes
 * invisible on this screen.
 *
 * ## Sample data
 *
 * Two of the six columns — Odometer and Cost/km — and the fourth tile are
 * invented (see the `sampled` sub-object in `src/lib/dashboard/hub/vehicles.ts`).
 * The columns are marked **once, on their headers**, with a legend in the
 * toolbar: badging 40 identical cells would drown the table it is meant to
 * qualify, and the marker belongs to the column rather than to any one row.
 *
 * ## Selection
 *
 * The right rail shows one thing at a time and the screen owns which: opening
 * the add form clears the selection, selecting a row closes the add form, and
 * either one disarms the panel's two-step remove. The armed flag lives up here
 * for exactly that reason — a flag inside the panel would survive a re-render
 * into a different vehicle and turn one stray click into the wrong deletion.
 */

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The tabs every fleet can fill. `HubVehicleStatus` is `"Active" | "Idle"`, so
 * these three are exhaustive — there is deliberately no "In service" or
 * "Defleeted" here.
 */
const BASE_TABS = [
  { value: "All", label: "All" },
  { value: "Active", label: "Active" },
  { value: "Idle", label: "Idle" },
] as const satisfies readonly FilterStripItem[];

/** Appended only when some vehicle is actually in a blocking review state. */
const REVIEW_TAB = {
  value: "Needs review",
  label: "Needs review",
} as const satisfies FilterStripItem;

type VehiclesTab =
  (typeof BASE_TABS)[number]["value"] | (typeof REVIEW_TAB)["value"];

/**
 * Whether this vehicle's fleet application is holding it back. `null` (no
 * review row at all) and `APPROVED` are both fine — that is the same gate
 * `dispatchable` encodes.
 */
function needsReview(vehicle: HubVehicle): boolean {
  return (
    vehicle.reviewStatus === "PENDING" || vehicle.reviewStatus === "FLAGGED"
  );
}

/** `FilterStrip` hands back a plain string; this is the narrowing back. */
function isVehiclesTab(value: string): value is VehiclesTab {
  return (
    BASE_TABS.some((item) => item.value === value) || value === REVIEW_TAB.value
  );
}

/* -------------------------------------------------------------------------- */
/* Table geometry                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The design's data table is a CSS grid, not a `<table>` layout — fractional
 * and fixed tracks side by side, which no table-layout algorithm reproduces.
 * So the rows are grids, the table element is a block, and every table role is
 * restated explicitly: a `display` other than `table` is enough for some
 * browsers to drop the implicit roles, and this *is* tabular data.
 *
 * Static class strings rather than an inline `gridTemplateColumns` so Tailwind
 * can see the tracks at build time. Widths are the handoff's, verbatim.
 */
const COLUMNS_FULL =
  "grid-cols-[1.4fr_100px_110px_90px_90px_120px] min-w-[780px]";
const COLUMNS_SPLIT = "grid-cols-[1.6fr_1fr_120px] min-w-[420px]";

/**
 * `font-normal`, stated rather than omitted. The design's `headStyle` sets a
 * size, a tracking, a transform and a colour and **no** `fontWeight`, under a
 * `body` that declares none either — so its column headers inherit 400, and the
 * only weights in that table are the ones the vehicle name and the Cost/km cell
 * opt into explicitly. `TableHead` bakes `font-medium` into its own base
 * classes (`src/components/ui/table.tsx:73`), so simply dropping a weight here
 * would leave that 500 standing: the override has to be spelled out. Same
 * reason `text-muted-foreground` is spelled out against the base `text-foreground`.
 */
const HEAD_CLASSES =
  "h-auto px-0 pb-2.5 text-[11px] font-normal tracking-[0.08em] uppercase text-muted-foreground";
const CELL_CLASSES = "min-w-0 px-0 py-3.5";

/* -------------------------------------------------------------------------- */
/* Honesty copy                                                               */
/* -------------------------------------------------------------------------- */

const SAMPLED_COLUMNS_NOTE =
  "Odometer and cost per km are placeholders: nothing records a reading or a " +
  "cost against a vehicle. Retire with Vehicle.odometerKm and a VehicleExpense " +
  "model.";

const FLEET_COST_NOTE =
  "No fuel, service, parking or toll charge is recorded against any " +
  "vehicle, so there is nothing to average. Retire with a VehicleExpense " +
  "model.";

/**
 * The accent orange, spelled out rather than imported: `hub-primitives.tsx`
 * keeps its own copy private, and Tailwind scans source text, so a class built
 * from a shared variable would never be generated anyway.
 */
const ACCENT_DOT_CLASSES =
  "size-1.5 shrink-0 rounded-full bg-[oklch(64%_0.19_48)]";

/**
 * A column header for a sampled column: the label, the accent dot that ties it
 * to the toolbar's legend, and the explanation for assistive tech. Cheaper than
 * a `<SampleNote />` badge, which does not fit a 90px track — and correct,
 * because the placeholder is a property of the column, not of each cell.
 */
function SampledHead({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <span
        aria-hidden="true"
        title={SAMPLED_COLUMNS_NOTE}
        className={ACCENT_DOT_CLASSES}
      />
      <span className="sr-only"> — sample data. {SAMPLED_COLUMNS_NOTE}</span>
    </span>
  );
}

export type VehiclesScreenProps = {
  data: HubVehiclesData;
};

export function VehiclesScreen({ data }: VehiclesScreenProps) {
  const { kind, persona, canAddVehicle, vehicles, tiles } = data;

  const [tab, setTab] = React.useState<VehiclesTab>("All");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  // The panel's two-step remove, armed from up here — see the file header.
  const [armed, setArmed] = React.useState(false);

  // The design's subhead is three facts, not two — `pageSub.vehicle` reads
  // "7 vehicles registered · 4 on the road, 1 unassigned" — so the third one is
  // restored here. It is *derived* rather than copied: the identical literal in
  // `driver-hub-nav.ts` is only the fallback that renders before this screen's
  // data resolves, and leaving that standing would report one seeded fleet's
  // numbers as if they were this account's.
  //
  // "1 vehicle registered · 1 on the road, 0 unassigned" is technically true
  // for a roster driver and reads like a fleet report about a fleet of one.
  // Their vehicle arrived by assignment, so the subhead says so — and stays
  // correct for the roster driver who also holds a legacy personal vehicle,
  // since `pluralise()` counts both rows.
  useHubSubtitle(
    tiles.vehicleCount === 0
      ? persona === "ROSTER"
        ? "No vehicle assigned to you yet"
        : "No vehicles yet"
      : persona === "ROSTER"
        ? `${pluralise(tiles.vehicleCount, "vehicle")} assigned to you`
        : `${pluralise(tiles.vehicleCount, "vehicle")} registered · ${
            tiles.onTheRoadCount
          } on the road, ${tiles.unassignedCount} unassigned`,
  );

  const reviewPending = vehicles.some(needsReview);

  // A fifth pill only when it would have rows behind it. `useMemo` keeps the
  // array identity stable so `FilterStrip` is not handed a new list each
  // keystroke elsewhere on the page.
  const tabs = React.useMemo<readonly FilterStripItem[]>(
    () => (reviewPending ? [...BASE_TABS, REVIEW_TAB] : BASE_TABS),
    [reviewPending],
  );

  // A refresh can remove the last flagged vehicle while its tab is selected,
  // which would otherwise leave the table filtered by a pill that no longer
  // exists. Falling back to All keeps the strip and the rows in agreement.
  const activeTab: VehiclesTab = tabs.some((item) => item.value === tab)
    ? tab
    : "All";

  const visible = vehicles.filter((vehicle) => {
    if (activeTab === "All") {
      return true;
    }

    if (activeTab === "Needs review") {
      return needsReview(vehicle);
    }

    return vehicle.status === activeTab;
  });

  // The add form wins the rail: `adding` is checked first so a create that has
  // not yet landed cannot render a stale selection beside it.
  const selectedVehicle = adding
    ? null
    : (vehicles.find((vehicle) => vehicle.id === selectedId) ?? null);

  const selectVehicle = React.useCallback((vehicleId: string) => {
    setSelectedId(vehicleId);
    setAdding(false);
    setArmed(false);
  }, []);

  const startAdding = React.useCallback(() => {
    // Belt and braces: with the button hidden nothing calls this for a roster
    // driver today, but the rail's add form posts to an endpoint that would
    // 403 them, and a screen that can reach an unusable form is one refactor
    // away from shipping it. Cheaper to make the state machine itself refuse.
    if (!canAddVehicle) {
      return;
    }

    setAdding(true);
    setSelectedId(null);
    setArmed(false);
  }, [canAddVehicle]);

  const closeDetail = React.useCallback(() => {
    setSelectedId(null);
    setAdding(false);
    setArmed(false);
  }, []);

  const handleCreated = React.useCallback((vehicleId: string | null) => {
    setAdding(false);
    setArmed(false);
    // The new row only exists after the form's `router.refresh()` resolves, so
    // this id points at nothing for a beat and the rail collapses, then opens
    // on the created vehicle. Selecting it up front is what makes the design's
    // "the new vehicle is now the selected one" behaviour survive the refresh.
    setSelectedId(vehicleId);
    // It joins the fleet idle; a driver sitting on the Active tab would watch
    // their new van not appear. The design resets to All for the same reason.
    setTab("All");
  }, []);

  const handleRemoved = React.useCallback(() => {
    setSelectedId(null);
    setArmed(false);
  }, []);

  const split = adding || selectedVehicle !== null;
  const columns = split ? COLUMNS_SPLIT : COLUMNS_FULL;
  const hasVehicles = vehicles.length > 0;

  // Every item in the toolbar is conditional now, so the row itself has to be:
  // a roster driver waiting on their first assignment has no rows to filter and
  // no button to press, and an empty flex row would still contribute its
  // bottom margin as an unexplained gap above the empty state.
  //
  // The design draws the strip and the Add button unconditionally, and that is
  // a deliberate deviation rather than an oversight: in the prototype every
  // control is fake, whereas here the button posts to a route that answers
  // `403` to this exact account. A disabled Add button would advertise a
  // permission a roster driver will never be granted *on this screen* — their
  // employer's van was never theirs to register — and a filter strip over zero
  // rows can only ever say "0 of 0 shown".
  const showToolbar = hasVehicles || canAddVehicle;

  const detail = adding ? (
    <VehiclesAddForm
      kind={kind}
      onCancel={closeDetail}
      onCreated={handleCreated}
    />
  ) : selectedVehicle ? (
    <VehiclesDetailPanel
      vehicle={selectedVehicle}
      kind={kind}
      armed={armed}
      onArmedChange={setArmed}
      onRemoved={handleRemoved}
    />
  ) : undefined;

  const detailLabel = adding
    ? "the add vehicle form"
    : selectedVehicle
      ? `${selectedVehicle.make} ${selectedVehicle.model} details`
      : "vehicle details";

  // The design's own note is the literal "5 vans · 1 sedan · 2 trucks", over a
  // three-entry prototype catalogue this app does not have: the real labels come
  // from `VEHICLE_CLASSES` ("Dry Box", "Open Chassis", …) and from
  // `VehicleTypeSpec.label` ("Cargo Van", "Trailer Truck", …). So the shape is
  // the design's and the vocabulary is the fleet's. The count is not folded into
  // a plural of the label either, because "Truck 1.5t" and "MPV / Estate"
  // pluralise to nonsense.
  const classNote = tiles.classBreakdown
    .map((entry) => `${entry.count} ${entry.label}`)
    .join(" · ");

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Vehicles"
          value={tiles.vehicleCount}
          note={classNote === "" ? undefined : classNote}
        />
        <MetricTile
          label="On the road"
          value={tiles.onTheRoadCount}
          // A fleet's operator reads this as a dispatch fact about somebody
          // else; a driver reads it as a fact about themselves, because the
          // only vehicle they can be shown as holding is one assigned to them.
          note={
            kind === "BUSINESS"
              ? "Held by a driver right now"
              : "In your hands right now"
          }
        />
        <MetricTile
          label="Unassigned"
          value={tiles.unassignedCount}
          // "Available to hand to a driver" is a move only a fleet manager can
          // make. For a single driver the honest reading of the same number is
          // that nobody is currently holding it.
          note={
            kind === "BUSINESS"
              ? "Available to hand to a driver"
              : "Not held by anyone right now"
          }
        />
        {/* "Fleet cost per km" for everyone, as the design has it: its own
            `fleetTiles` label is unconditional, and the note names the four
            charge categories the detail panel's cost list actually shows
            (`SAMPLE_FIXED_RUNNING_COSTS` is service and parking, never
            insurance). A solo driver reading "fleet" of their one van is the
            design's own wording, not a slip. */}
        <MetricTile
          label="Fleet cost per km"
          value={formatGel(tiles.sampled.fleetCostPerKmGel)}
          note="Fuel, service, parking and tolls"
        >
          <SampleNote note={FLEET_COST_NOTE} className="mt-2.5" />
        </MetricTile>
      </div>

      <MasterDetailSplit
        detailLabel={detailLabel}
        detail={detail}
        onCloseDetail={closeDetail}
        master={
          <HubCard>
            {showToolbar ? (
              <div
                className={cn(
                  "mb-[18px] flex flex-wrap items-center gap-x-4 gap-y-3",
                  // With no rows there is no filter strip to sit opposite, so the
                  // toolbar collapses to its right-hand end rather than leaving a
                  // gap where a strip that could only say "0 of 0" would have been.
                  hasVehicles ? "justify-between" : "justify-end",
                )}
              >
                {hasVehicles ? (
                  <FilterStrip
                    items={tabs}
                    value={activeTab}
                    onChange={(next) => {
                      // Only a value the strip is currently rendering may become
                      // the tab — `isVehiclesTab` alone would still admit "Needs
                      // review" after the last flagged vehicle disappeared.
                      if (
                        isVehiclesTab(next) &&
                        tabs.some((item) => item.value === next)
                      ) {
                        setTab(next);
                      }
                    }}
                    ariaLabel="Filter vehicles by status"
                  />
                ) : null}

                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                  {/* The legend for the accent dots on the Odometer and Cost/km
                      headers. Dropped in the split state along with those two
                      columns, so it never explains a marker that is not shown. */}
                  {hasVehicles && !split ? (
                    <SampleNote
                      label="Odometer · Cost/km"
                      note={SAMPLED_COLUMNS_NOTE}
                    />
                  ) : null}
                  {/* Body font, not mono: the design's `fleetCountLabel` is one
                      plain 12px muted string, and mono here would set two row
                      counts in the typeface this screen reserves for plates,
                      odometers and money. */}
                  {hasVehicles ? (
                    <span className="text-xs text-muted-foreground">
                      {visible.length} of {vehicles.length} shown
                    </span>
                  ) : null}
                  {/* A driver on a company's roster drives a van their employer
                      owns and assigned to them; there is nothing for them to
                      register, and `POST /api/driver-profile/vehicles` returns a
                      403 if they try. Hiding the button is the courtesy — the
                      route is the boundary — so this reads the loader's decided
                      `canAddVehicle` rather than re-testing the persona, which
                      would be a second copy of a rule that lives on the server.

                      Nothing renders in its place: a greyed-out control would
                      imply a permission this driver might one day be granted
                      here, and the fleet's van was never theirs to add. */}
                  {canAddVehicle ? (
                    <Button
                      type="button"
                      size="lg"
                      onClick={startAdding}
                      className="h-auto rounded-md px-[14px] py-2 text-[13px]"
                    >
                      Add vehicle
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasVehicles ? (
              <>
                {/* `Table` brings its own `overflow-x-auto` wrapper — the
                    min-width above is what makes that wrapper scroll on a
                    narrow pane. */}
                <Table role="table" className={cn("block", columns)}>
                  <TableHeader role="rowgroup" className="block">
                    <TableRow
                      role="row"
                      className={cn(
                        "grid items-center gap-3 border-b border-border hover:bg-transparent",
                        columns,
                      )}
                    >
                      <TableHead role="columnheader" className={HEAD_CLASSES}>
                        Vehicle
                      </TableHead>
                      {split ? null : (
                        <TableHead role="columnheader" className={HEAD_CLASSES}>
                          Class
                        </TableHead>
                      )}
                      <TableHead role="columnheader" className={HEAD_CLASSES}>
                        Assigned
                      </TableHead>
                      {split ? null : (
                        <>
                          <TableHead
                            role="columnheader"
                            className={HEAD_CLASSES}
                          >
                            <SampledHead>Odometer</SampledHead>
                          </TableHead>
                          <TableHead
                            role="columnheader"
                            className={HEAD_CLASSES}
                          >
                            <SampledHead>Cost/km</SampledHead>
                          </TableHead>
                        </>
                      )}
                      <TableHead
                        role="columnheader"
                        className={cn(HEAD_CLASSES, "text-right")}
                      >
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody role="rowgroup" className="block">
                    {visible.map((vehicle) => {
                      const selected = vehicle.id === selectedVehicle?.id;
                      const assigned =
                        vehicle.assignment?.driverName ?? "Unassigned";

                      return (
                        <TableRow
                          key={vehicle.id}
                          role="row"
                          // Mouse convenience only — the keyboard path is the
                          // button in the Vehicle cell, which does the same.
                          onClick={() => selectVehicle(vehicle.id)}
                          data-state={selected ? "selected" : undefined}
                          className={cn(
                            "grid cursor-pointer items-center gap-3 border-b border-muted text-sm",
                            columns,
                          )}
                        >
                          <TableCell role="cell" className={CELL_CLASSES}>
                            <button
                              type="button"
                              onClick={() => selectVehicle(vehicle.id)}
                              aria-current={selected ? "true" : undefined}
                              className="block w-full min-w-0 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <span className="block truncate font-medium">
                                {vehicle.make} {vehicle.model}
                              </span>
                              {/* A plate and a year are values, so mono. */}
                              <span className="mt-0.5 block truncate font-price text-[11px] text-muted-foreground">
                                {vehicle.plateNumber} · {vehicle.year}
                              </span>
                            </button>
                          </TableCell>

                          {split ? null : (
                            <TableCell
                              role="cell"
                              className={cn(
                                CELL_CLASSES,
                                "truncate text-[13px] text-muted-foreground",
                              )}
                            >
                              {vehicle.vehicleClassLabel}
                            </TableCell>
                          )}

                          <TableCell
                            role="cell"
                            className={cn(
                              CELL_CLASSES,
                              "truncate text-[13px]",
                              vehicle.assignment === null &&
                                "text-muted-foreground",
                            )}
                          >
                            {assigned}
                          </TableCell>

                          {split ? null : (
                            <>
                              <TableCell
                                role="cell"
                                className={cn(
                                  CELL_CLASSES,
                                  "truncate font-price text-[13px]",
                                )}
                              >
                                {formatOdometer(vehicle.sampled.odometerKm)}
                              </TableCell>
                              {/* No size of its own — the design sets only
                                  family and weight here, so this cell inherits
                                  the row's 14px and reads a shade larger than
                                  the odometer beside it, which does carry 13px. */}
                              <TableCell
                                role="cell"
                                className={cn(
                                  CELL_CLASSES,
                                  "truncate font-price font-semibold",
                                )}
                              >
                                {formatGel(vehicle.sampled.costPerKmGel)}
                              </TableCell>
                            </>
                          )}

                          {/* One pill, right-aligned — the design's status cell
                              is a single span. Text alignment rather than a
                              flex column: a second stacked badge is what used
                              to push these rows past the design's height. A
                              blocking review verdict is reachable through the
                              "Needs review" tab instead; see the file header. */}
                          <TableCell
                            role="cell"
                            className={cn(CELL_CLASSES, "text-right")}
                          >
                            <HubStatusBadge status={vehicle.status} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {visible.length === 0 ? (
                  <HubEmptyState
                    message={`No ${activeTab.toLowerCase()} vehicles.`}
                  />
                ) : null}
              </>
            ) : (
              // An empty fleet gets a sentence, not a header row over nothing.
              // Three arms rather than two: a fleet owner has an empty fleet, an
              // independent driver has not registered their vehicle yet, and a
              // roster driver has not been *given* one yet — which is neither of
              // the first two, and is nothing they can act on. The follow-up
              // line is dropped entirely for them rather than reworded into a
              // softer instruction: there is no next step for them to take on
              // this screen, and inventing one would be the same false
              // affordance the hidden Add button just removed.
              <HubEmptyState
                message={
                  persona === "BUSINESS"
                    ? "No vehicles in the fleet yet."
                    : persona === "ROSTER"
                      ? "No vehicle assigned to you yet."
                      : "You have no vehicle registered yet."
                }
              >
                {persona === "ROSTER" ? (
                  <p className="mt-1.5 text-[13px]">
                    Your fleet manager assigns you a vehicle from the
                    company&apos;s own. It appears here once they do.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[13px]">
                    Add one to start taking jobs. It joins as idle until a
                    driver is assigned to it.
                  </p>
                )}
              </HubEmptyState>
            )}
          </HubCard>
        }
      />
    </>
  );
}
