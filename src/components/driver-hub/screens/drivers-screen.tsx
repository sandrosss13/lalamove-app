"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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
import {
  DriversAddPanel,
  type DriversVehicleOption,
  type RegisteredDriver,
} from "@/components/driver-hub/screens/drivers-add-panel";
import { DriversDetailPanel } from "@/components/driver-hub/screens/drivers-detail-panel";
import {
  formatGel,
  formatRating,
  shortId,
} from "@/components/driver-hub/screens/drivers-format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HubDriver, HubDriversData } from "@/lib/dashboard/hub/drivers";
import { cn } from "@/lib/utils";

/**
 * Drivers — the fleet's roster: who is on it, who is working right now, and
 * what each of them has earned.
 *
 * Business accounts only; `drivers/page.tsx` is what enforces that, and
 * `getHubDrivers()` refuses an individual account independently.
 *
 * ## Two status axes, one column
 *
 * `HubDriver` carries `presence` (Online/Offline — the app is open) and
 * `reviewState` (Active / In review / Not activated / Suspended — where they
 * stand with operations) as *independent* facts, because they are: a suspended
 * driver can still have the app open, and an offline driver can be perfectly
 * in order. The design's roster has one 110px status column, so the row shows
 * whichever of the two is the more blocking answer and the detail panel shows
 * both pills side by side. The collapsed axis is never lost — it rides along
 * as screen-reader text on the same cell.
 *
 * There is deliberately **no "Offboarded" tab**, though the design has one.
 * Removing a driver nulls `DriverProfile.companyId` and keeps no membership
 * record, so nothing can populate that tab: it would be a filter that is
 * permanently empty and implies the platform still tracks ex-employees.
 *
 * ## Real vs sample
 *
 * Everything except the rating figures is read from the database. The fleet
 * average rating tile, the Rating column and the panel's Acceptance/Rating
 * boxes and Verification rows come from `sampled` objects and each carries a
 * `<SampleNote />`.
 */

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

const DRIVER_TABS = [
  { value: "All", label: "All" },
  { value: "Online", label: "Online" },
  { value: "Offline", label: "Offline" },
  { value: "Needs review", label: "Needs review" },
] as const satisfies readonly FilterStripItem[];

type DriversTab = (typeof DRIVER_TABS)[number]["value"];

/** `FilterStrip` hands back a plain string; this is the narrowing back. */
function isDriversTab(value: string): value is DriversTab {
  return DRIVER_TABS.some((tab) => tab.value === value);
}

/** The empty-table line for each filter, phrased for the filter that emptied it. */
const EMPTY_MESSAGE: Record<DriversTab, string> = {
  All: "No drivers on this roster yet.",
  Online: "Nobody is online right now.",
  Offline: "Everybody on the roster is online.",
  "Needs review": "Nothing outstanding — every driver is activated and clear.",
};

/* -------------------------------------------------------------------------- */
/* Table geometry                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The design's data table is a CSS grid, not a `<table>` layout — fractional
 * and fixed columns side by side, which no table-layout algorithm reproduces.
 * So the rows are grids and the table element is a block, and every table role
 * is stated explicitly: a `display` other than `table` is enough for some
 * browsers to drop the implicit roles, and this *is* tabular data.
 *
 * Columns are static class strings rather than an inline `gridTemplateColumns`
 * so Tailwind can see them at build time.
 */
const COLUMNS_FULL =
  "grid-cols-[1.3fr_110px_90px_70px_90px_110px] min-w-[760px]";
const COLUMNS_SPLIT = "grid-cols-[1.6fr_70px_110px] min-w-[380px]";

const HEAD_CLASSES =
  "h-auto px-0 pb-2.5 text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground";
const CELL_CLASSES = "min-w-0 px-0 py-3.5";

/* -------------------------------------------------------------------------- */
/* Honesty copy                                                               */
/* -------------------------------------------------------------------------- */

const RATING_SAMPLE_NOTE =
  "Nothing records a customer rating for an order, so every rating on this " +
  "screen is a placeholder. Retire with an OrderRating model.";

/* -------------------------------------------------------------------------- */
/* Derived row values                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The one status word a roster row has room for.
 *
 * The review state wins whenever it is not "Active", because that is the axis
 * that decides whether the driver can work at all — an operator scanning the
 * list needs "Suspended" far more than "Online". A driver in good standing
 * falls through to their presence, which is what the design's roster shows.
 */
function rowStatus(driver: HubDriver): string {
  return driver.reviewState === "Active" ? driver.presence : driver.reviewState;
}

/** Singular/plural for the counts in the header subhead and the tile notes. */
function plural(count: number, singular: string, many: string): string {
  return count === 1 ? singular : many;
}

/** "Tbilisi, Batumi and Kutaisi" — the cities behind the Online now tile. */
function listCities(cities: readonly string[]): string {
  if (cities.length <= 1) {
    return cities[0] ?? "";
  }

  const last = cities[cities.length - 1] ?? "";

  return `${cities.slice(0, -1).join(", ")} and ${last}`;
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export type DriversScreenProps = {
  data: HubDriversData;
  /**
   * Fleet vehicles nobody currently holds, for the register form's "Assign a
   * vehicle" list. Shaped by the page rather than here — resolving the licence
   * category a vehicle's class demands is a server-side concern.
   */
  vehicles: readonly DriversVehicleOption[];
};

export function DriversScreen({ data, vehicles }: DriversScreenProps) {
  const { drivers, tiles } = data;
  const router = useRouter();

  const [tab, setTab] = React.useState<DriversTab>("All");
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(
    null,
  );
  const [adding, setAdding] = React.useState(false);
  /**
   * Whether the detail panel's offboard action is armed. It lives here, not in
   * the panel, so that selecting another driver disarms it — a panel-local flag
   * would survive a re-render into a different person. Navigating away unmounts
   * this screen, which is what clears it on navigation.
   */
  const [armed, setArmed] = React.useState(false);
  /**
   * The one-time temporary password the register endpoint just returned.
   *
   * It is held *here*, above the form that produced it, and rendered in its own
   * card outside the master/detail rail. The endpoint hands this out exactly
   * once and never stores it in readable form, so anything that unmounts the
   * form — closing the panel, selecting a row, the `router.refresh()` this
   * screen fires right after — must not be able to take it with it. Only the
   * operator's own "Done" dismisses it.
   */
  const [registered, setRegistered] = React.useState<RegisteredDriver | null>(
    null,
  );

  useHubSubtitle(
    `${drivers.length} ${plural(
      drivers.length,
      "driver",
      "drivers",
    )} · ${tiles.onlineNowCount} online`,
  );

  // The rail shows one thing at a time, and the register form wins: opening it
  // clears the selection, and picking a driver closes it. Both disarm.
  const selectedDriver = adding
    ? null
    : (drivers.find((driver) => driver.userId === selectedUserId) ?? null);

  const visible =
    tab === "All"
      ? drivers
      : tab === "Needs review"
        ? drivers.filter((driver) => driver.reviewState !== "Active")
        : drivers.filter((driver) => driver.presence === tab);

  const selectDriver = React.useCallback((userId: string) => {
    setSelectedUserId(userId);
    setAdding(false);
    setArmed(false);
  }, []);

  const startAdding = React.useCallback(() => {
    setAdding(true);
    setSelectedUserId(null);
    setArmed(false);
  }, []);

  const closeDetail = React.useCallback(() => {
    setSelectedUserId(null);
    setAdding(false);
    setArmed(false);
  }, []);

  const handleRegistered = React.useCallback(
    (driver: RegisteredDriver) => {
      setRegistered(driver);
      setAdding(false);
      setArmed(false);
      // The new driver only exists in this list after the server component
      // re-runs; the credentials card above is already rendered from state and
      // is untouched by the refresh.
      router.refresh();
    },
    [router],
  );

  // In the split state the table drops Zone, Jobs · wk and Earned, per the
  // handoff.
  const split = adding || selectedDriver !== null;
  const columns = split ? COLUMNS_SPLIT : COLUMNS_FULL;

  const detail = adding ? (
    <DriversAddPanel
      vehicles={vehicles}
      onCancel={closeDetail}
      onRegistered={handleRegistered}
    />
  ) : selectedDriver ? (
    <DriversDetailPanel
      driver={selectedDriver}
      armed={armed}
      onArmedChange={setArmed}
      onOffboarded={closeDetail}
    />
  ) : undefined;

  const detailLabel = adding
    ? "the register a driver form"
    : `${selectedDriver?.name ?? "driver"} details`;

  // Tile notes, all derived from the roster already in hand so a note can never
  // disagree with the number above it.
  const withVehicleCount = drivers.filter(
    (driver) => driver.assignedVehicle !== null,
  ).length;
  const onlineCities = Array.from(
    new Set(
      drivers
        .filter((driver) => driver.presence === "Online")
        .map((driver) => driver.cityLabel),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const suspendedCount = drivers.filter(
    (driver) => driver.reviewState === "Suspended",
  ).length;
  const notActivatedCount = drivers.filter(
    (driver) => driver.reviewState === "Not activated",
  ).length;
  const inReviewCount = drivers.filter(
    (driver) => driver.reviewState === "In review",
  ).length;

  return (
    <>
      {registered === null ? null : (
        <CredentialsCard
          driver={registered}
          onDismiss={() => setRegistered(null)}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Registered drivers"
          value={tiles.registeredDriversCount}
          note={`${withVehicleCount} with a vehicle assigned`}
        />
        <MetricTile
          label="Online now"
          value={tiles.onlineNowCount}
          note={
            onlineCities.length === 0
              ? "Nobody is taking work right now"
              : `Across ${listCities(onlineCities)}`
          }
        />
        <MetricTile
          label="Fleet avg rating"
          value={tiles.sampled.fleetAvgRating.toFixed(2)}
          note={`From ${tiles.sampled.fleetRatedJobCount} rated jobs`}
        >
          <SampleNote note={RATING_SAMPLE_NOTE} className="mt-2.5" />
        </MetricTile>
        <MetricTile
          label="Needs review"
          value={tiles.needsReviewCount}
          note={
            tiles.needsReviewCount === 0
              ? "Everyone is activated and clear"
              : [
                  suspendedCount > 0 ? `${suspendedCount} suspended` : null,
                  inReviewCount > 0 ? `${inReviewCount} in review` : null,
                  notActivatedCount > 0
                    ? `${notActivatedCount} not activated`
                    : null,
                ]
                  .filter((part) => part !== null)
                  .join(", ")
          }
        />
      </div>

      <MasterDetailSplit
        detailLabel={detailLabel}
        detail={detail}
        onCloseDetail={closeDetail}
        master={
          <HubCard>
            <div className="mb-[18px] flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <FilterStrip
                items={DRIVER_TABS}
                value={tab}
                onChange={(next) => {
                  if (isDriversTab(next)) {
                    setTab(next);
                  }
                }}
                ariaLabel="Filter drivers by status"
              />
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                {/* The Rating column is the one invented figure in this table,
                    so the marker sits on the table's own toolbar. */}
                <SampleNote label="Sample ratings" note={RATING_SAMPLE_NOTE} />
                <span className="text-xs text-muted-foreground">
                  <span className="font-price">{visible.length}</span> of{" "}
                  <span className="font-price">{drivers.length}</span> shown
                </span>
                <Button
                  type="button"
                  size="lg"
                  onClick={startAdding}
                  className="h-auto rounded-md px-[14px] py-2 text-[13px]"
                >
                  Add driver
                </Button>
              </div>
            </div>

            {/* `Table` brings its own `overflow-x-auto` wrapper — the min-width
                in the column classes is what makes that wrapper scroll on a
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
                    Driver
                  </TableHead>
                  {split ? null : (
                    <>
                      <TableHead role="columnheader" className={HEAD_CLASSES}>
                        Zone
                      </TableHead>
                      <TableHead role="columnheader" className={HEAD_CLASSES}>
                        Jobs · wk
                      </TableHead>
                    </>
                  )}
                  <TableHead role="columnheader" className={HEAD_CLASSES}>
                    Rating
                  </TableHead>
                  {split ? null : (
                    <TableHead role="columnheader" className={HEAD_CLASSES}>
                      Earned
                    </TableHead>
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
                {visible.map((driver) => {
                  const selected = driver.userId === selectedDriver?.userId;

                  return (
                    <TableRow
                      key={driver.userId}
                      role="row"
                      // Mouse convenience only — the keyboard path is the
                      // button in the Driver cell, which does the same thing.
                      onClick={() => selectDriver(driver.userId)}
                      data-state={selected ? "selected" : undefined}
                      className={cn(
                        "grid cursor-pointer items-center gap-3 border-b border-muted text-sm",
                        columns,
                        selected && "bg-muted",
                      )}
                    >
                      <TableCell role="cell" className={CELL_CLASSES}>
                        <button
                          type="button"
                          onClick={() => selectDriver(driver.userId)}
                          aria-current={selected ? "true" : undefined}
                          className="block w-full min-w-0 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className="block truncate font-medium">
                            {driver.name}
                          </span>
                          {/* An id and a plate are values, so they are mono.
                              The full profile id rides along as a title —
                              a truncated id is a label, not an identifier. */}
                          <span
                            title={driver.driverProfileId}
                            className="mt-0.5 block truncate font-price text-[11px] text-muted-foreground"
                          >
                            {shortId(driver.driverProfileId)} ·{" "}
                            {driver.assignedVehicle?.plateNumber ??
                              "Unassigned"}
                          </span>
                        </button>
                      </TableCell>

                      {split ? null : (
                        <>
                          {/* Zone is the driver's city. There is no zone model
                              in the schema — `GeorgianCity` stops at TBILISI —
                              so the city is the honest proxy for the design's
                              districts. See `HubDriver.cityLabel`. */}
                          <TableCell
                            role="cell"
                            className={cn(
                              CELL_CLASSES,
                              "truncate text-[13px] text-muted-foreground",
                            )}
                          >
                            {driver.cityLabel}
                          </TableCell>
                          <TableCell
                            role="cell"
                            className={cn(CELL_CLASSES, "font-price")}
                          >
                            {driver.jobsThisWeek}
                          </TableCell>
                        </>
                      )}

                      <TableCell
                        role="cell"
                        className={cn(CELL_CLASSES, "font-price")}
                      >
                        {formatRating(driver.sampled.rating)}
                      </TableCell>

                      {split ? null : (
                        <TableCell
                          role="cell"
                          className={cn(
                            CELL_CLASSES,
                            "truncate font-price font-semibold",
                          )}
                        >
                          {formatGel(driver.totalEarnedGel)}
                        </TableCell>
                      )}

                      <TableCell
                        role="cell"
                        className={cn(CELL_CLASSES, "text-right")}
                      >
                        <HubStatusBadge status={rowStatus(driver)} />
                        {/* The axis the single pill had to drop. */}
                        <span className="sr-only">
                          {" "}
                          — {driver.presence}, {driver.reviewState}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {visible.length === 0 ? (
              <HubEmptyState
                // An empty roster is empty under every filter, and "Everybody
                // on the roster is online" would be an absurd thing to tell a
                // company that has registered nobody — so the roster's own
                // message wins over the filter's.
                message={
                  drivers.length === 0 ? EMPTY_MESSAGE.All : EMPTY_MESSAGE[tab]
                }
              >
                {drivers.length === 0 ? (
                  <p className="mt-1 text-[13px]">
                    Register your first driver to start dispatching jobs.
                  </p>
                ) : null}
              </HubEmptyState>
            ) : null}
          </HubCard>
        }
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* One-time credentials                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The temporary password, shown once.
 *
 * `POST /api/logistics-company/drivers/register` returns it in its 201 and
 * never stores it in readable form, so this card is the only place it will ever
 * exist. It therefore sits at the top of the page rather than inside the rail,
 * survives the `router.refresh()` that pulls the new driver into the roster,
 * and dismisses only on the operator's explicit "Done" — nothing about
 * selecting a row or closing a panel can take it away first.
 *
 * `select-all` makes one click select the whole value: no clipboard API is used
 * because it is unavailable outside a secure context and its rejection would be
 * a silent failure on the one value that cannot be recovered.
 */
function CredentialsCard({
  driver,
  onDismiss,
}: {
  driver: RegisteredDriver;
  onDismiss: () => void;
}) {
  return (
    <HubCard
      // Announced as soon as it appears: the operator has to act on this before
      // it goes, and it renders below the button that produced it.
      role="status"
      aria-live="polite"
      className="border-[oklch(64%_0.19_48)]"
    >
      <p className="text-base font-semibold">
        {driver.name} is registered
        {driver.vehicleAssigned ? " and has their vehicle" : ""}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Give them these sign-in details now. The password is shown{" "}
        <strong className="font-semibold text-foreground">once</strong> — it is
        not stored anywhere in readable form, and closing this card is the end
        of it. They set their own password after signing in.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-[10px] border border-border p-3">
          <dt className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground">
            Email
          </dt>
          <dd className="mt-1.5 truncate font-price text-[15px] font-semibold select-all">
            {driver.email}
          </dd>
        </div>
        <div className="min-w-0 rounded-[10px] border border-border p-3">
          <dt className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground">
            Temporary password
          </dt>
          <dd className="mt-1.5 truncate font-price text-[15px] font-semibold select-all">
            {driver.tempPassword}
          </dd>
        </div>
      </dl>

      <Button
        type="button"
        variant="outline"
        onClick={onDismiss}
        className="mt-4 h-auto rounded-md px-[15px] py-[9px] text-[13px] font-medium"
      >
        Done — I have shared it
      </Button>
    </HubCard>
  );
}
