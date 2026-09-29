"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
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
import {
  DriversDetailPanel,
  driverStatusWord,
} from "@/components/driver-hub/screens/drivers-detail-panel";
import { FleetAvailabilityCard } from "@/components/driver-hub/screens/fleet-availability-card";
import {
  formatGel,
  formatJoinedMonth,
  formatRating,
  shortId,
} from "@/components/driver-hub/screens/drivers-format";
import { useHubStatusLabel } from "@/components/driver-hub/use-hub-status-label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HubDriversData } from "@/lib/dashboard/hub/drivers";
import type { HubFleetAvailability } from "@/lib/dashboard/hub/fleet-availability";
import { cn } from "@/lib/utils";

/**
 * Drivers — the fleet's roster: who is on it, who is working right now, and
 * what each of them has earned.
 *
 * Business accounts only; `drivers/page.tsx` is what enforces that, and
 * `getHubDrivers()` refuses an individual account independently.
 *
 * ## Two status axes, one pill
 *
 * `HubDriver` carries `presence` (Online/Offline — the app is open) and
 * `reviewState` (Active / In review / Not activated / Suspended — where they
 * stand with operations) as *independent* facts, because they are: a suspended
 * driver can still have the app open, and an offline driver can be perfectly
 * in order. The design has room for one status word in each place — a 110px
 * roster column and a single pill in the detail panel — so both surfaces show
 * whichever of the two is the more blocking answer, through the one
 * `driverStatusWord()` rule. The collapsed axis is never lost: it rides along
 * as screen-reader text beside the pill.
 *
 * There is deliberately **no "Offboarded" tab**, though the design's
 * `driverTabs` lists one ("All, Online, Offline, Needs review, Offboarded").
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

/**
 * `labelKey` is a root-relative message key, resolved into `FilterStripItem`
 * labels at render time; `value` stays English because it is compared against
 * `HubDriver`'s presence and review-state words, not shown.
 */
const DRIVER_TABS = [
  { value: "All", labelKey: "common.shared.all" },
  { value: "Online", labelKey: "driverHub.driversScreen.online" },
  { value: "Offline", labelKey: "driverHub.driversScreen.offline" },
  { value: "Needs review", labelKey: "common.shared.needsReview" },
] as const;

type DriversTab = (typeof DRIVER_TABS)[number]["value"];

/** `FilterStrip` hands back a plain string; this is the narrowing back. */
function isDriversTab(value: string): value is DriversTab {
  return DRIVER_TABS.some((tab) => tab.value === value);
}

/**
 * The empty-table line for each filter, phrased for the filter that emptied
 * it. Keys under `driverHub.driversScreen`, resolved at render time.
 */
const EMPTY_MESSAGE_KEY: Record<
  DriversTab,
  "emptyAll" | "emptyOnline" | "emptyOffline" | "emptyNeedsReview"
> = {
  All: "emptyAll",
  Online: "emptyOnline",
  Offline: "emptyOffline",
  "Needs review": "emptyNeedsReview",
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

/**
 * `font-normal` rather than no weight at all: the design's `headStyle()` sets
 * none, so the header inherits 400 — but `TableHead` bakes `font-medium` into
 * its own base classes, so dropping the weight from here would leave the 500
 * standing. It has to be overridden explicitly.
 */
const HEAD_CLASSES =
  "h-auto px-0 pb-2.5 text-[11px] font-normal tracking-[0.08em] uppercase text-muted-foreground";
const CELL_CLASSES = "min-w-0 px-0 py-3.5";

/* -------------------------------------------------------------------------- */
/* Derived row values                                                         */
/* -------------------------------------------------------------------------- */

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
  /**
   * Today's Fleet Availability board, or `null` when the loader refused.
   *
   * `null` is unreachable behind this page's `kind !== "BUSINESS"` guard —
   * `getHubFleetAvailability()` refuses on exactly the condition the page has
   * already redirected on. It is honoured rather than asserted away, for the
   * same reason `getHubDrivers()`'s own `null` is: a `null!` here would turn a
   * future change in either check into a runtime crash on the roster instead of
   * one missing section.
   */
  availability: HubFleetAvailability | null;
};

export function DriversScreen({
  data,
  vehicles,
  availability,
}: DriversScreenProps) {
  const { drivers, tiles } = data;
  const router = useRouter();
  const t = useTranslations("driverHub.driversScreen");
  const tShared = useTranslations("common.shared");
  const tRoot = useTranslations();
  const statusLabel = useHubStatusLabel();
  const tabItems: FilterStripItem[] = DRIVER_TABS.map((item) => ({
    value: item.value,
    label: tRoot(item.labelKey),
  }));

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

  // Tile notes and the subhead, all derived from the roster already in hand so
  // a note can never disagree with the number above it.
  //
  // `joinedAt` is `DriverProfile.createdAt`, so "added this month" is a real
  // count. Months are compared as *formatted* strings rather than timestamps:
  // `formatJoinedMonth` is pinned to the Tbilisi calendar this whole screen is
  // bucketed in, and reusing it here means the tile and each driver's "joined
  // Feb 2026" line can never disagree about which month a join fell in. The
  // only way server render and hydration differ is a month rolling over
  // between the two, which is a one-second window twelve times a year.
  const currentMonth = formatJoinedMonth(new Date().toISOString());
  const addedThisMonthCount = drivers.filter(
    (driver) => formatJoinedMonth(driver.joinedAt) === currentMonth,
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

  // The design's "7 registered drivers · 4 online in Tbilisi now", derived.
  // The city half is the roster's own online cities rather than the artboard's
  // hard-coded Tbilisi, and "nobody online right now" replaces a "0 online in
  // now" that would name no city at all.
  useHubSubtitle(
    `${t("subtitleRegistered", { count: drivers.length })} · ${
      onlineCities.length === 0
        ? t("subtitleNobodyOnline")
        : t("subtitleOnlineIn", {
            count: tiles.onlineNowCount,
            cities: onlineCities.join(", "),
          })
    }`,
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
    ? t("registerFormLabel")
    : t("driverDetails", {
        name: selectedDriver?.name ?? t("driverFallback"),
      });

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
          label={t("registeredDrivers")}
          value={tiles.registeredDriversCount}
          note={
            addedThisMonthCount === 0
              ? t("nobodyAddedThisMonth")
              : t("addedThisMonth", { count: addedThisMonthCount })
          }
        />
        <MetricTile
          label={t("onlineNow")}
          value={tiles.onlineNowCount}
          note={
            onlineCities.length === 0
              ? t("nobodyTakingWork")
              : // Comma-joined throughout, like the design's "Across Vake,
                // Saburtalo, Gldani, Vera" — no "and" before the last.
                t("acrossCities", { cities: onlineCities.join(", ") })
          }
        />
        <MetricTile
          label={t("fleetAvgRating")}
          value={tiles.sampled.fleetAvgRating.toFixed(2)}
          note={t("fromRatedJobs", {
            count: tiles.sampled.fleetRatedJobCount,
          })}
        >
          <SampleNote note={t("ratingSampleNote")} className="mt-2.5" />
        </MetricTile>
        <MetricTile
          label={tShared("needsReview")}
          value={tiles.needsReviewCount}
          note={
            tiles.needsReviewCount === 0
              ? t("everyoneActivated")
              : // Ordered as the design's "1 pending, 1 suspended" — the
                // states that are merely waiting first, the one that blocks
                // the driver outright last. The words stay ours: "pending"
                // would collapse two states this roster keeps apart, and both
                // are printed verbatim on the pills in the table below.
                [
                  inReviewCount > 0
                    ? t("inReviewCount", { count: inReviewCount })
                    : null,
                  notActivatedCount > 0
                    ? t("notActivatedCount", { count: notActivatedCount })
                    : null,
                  suspendedCount > 0
                    ? t("suspendedCount", { count: suspendedCount })
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
                items={tabItems}
                value={tab}
                onChange={(next) => {
                  if (isDriversTab(next)) {
                    setTab(next);
                  }
                }}
                ariaLabel={t("filterByStatus")}
              />
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                {/* The Rating column is the one invented figure in this table,
                    so the marker sits on the table's own toolbar. */}
                <SampleNote
                  label={t("sampleRatings")}
                  note={t("ratingSampleNote")}
                />
                {/* Body font, not mono: the design's `driverCountLabel` is a
                    plain 12px muted string, and the hub reserves mono for
                    values a reader might compare or copy. */}
                <span className="text-xs text-muted-foreground">
                  {t("shownCount", {
                    visible: visible.length,
                    total: drivers.length,
                  })}
                </span>
                <Button
                  type="button"
                  size="lg"
                  onClick={startAdding}
                  className="h-auto rounded-md px-[14px] py-2 text-[13px]"
                >
                  {t("addDriver")}
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
                    {tShared("driver")}
                  </TableHead>
                  {split ? null : (
                    <>
                      <TableHead role="columnheader" className={HEAD_CLASSES}>
                        {tShared("zone")}
                      </TableHead>
                      <TableHead role="columnheader" className={HEAD_CLASSES}>
                        {tShared("jobsWk")}
                      </TableHead>
                    </>
                  )}
                  <TableHead role="columnheader" className={HEAD_CLASSES}>
                    {tShared("rating")}
                  </TableHead>
                  {split ? null : (
                    <TableHead role="columnheader" className={HEAD_CLASSES}>
                      {tShared("earned")}
                    </TableHead>
                  )}
                  <TableHead
                    role="columnheader"
                    className={cn(HEAD_CLASSES, "text-right")}
                  >
                    {tShared("status")}
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
                          {/* `{{ d.id }} · {{ d.vehicle }}` — an id and the
                              *class* of the vehicle they drive ("Large Van"),
                              not its plate: a plate identifies the vehicle and
                              belongs on the Vehicles screen, while the class is
                              what tells an operator what this driver can carry.
                              The whole line is mono, as it is in the design.

                              The id is the profile cuid, shortened. The
                              design's "GE-88214" is a display id no column
                              holds, so the full cuid rides along as a title —
                              a truncated id is a label, not an identifier. */}
                          <span
                            title={driver.driverProfileId}
                            className="mt-0.5 block truncate font-price text-[11px] text-muted-foreground"
                          >
                            {shortId(driver.driverProfileId)} ·{" "}
                            {driver.assignedVehicle?.vehicleTypeLabel ??
                              tShared("unassigned")}
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
                        <HubStatusBadge
                          status={driverStatusWord(driver)}
                          label={statusLabel(driverStatusWord(driver))}
                        />
                        {/* The axis the single pill had to drop. */}
                        <span className="sr-only">
                          {" "}
                          — {statusLabel(driver.presence)},{" "}
                          {statusLabel(driver.reviewState)}
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
                message={t(
                  drivers.length === 0
                    ? EMPTY_MESSAGE_KEY.All
                    : EMPTY_MESSAGE_KEY[tab],
                )}
              >
                {drivers.length === 0 ? (
                  <p className="mt-1 text-[13px]">
                    {t("registerYourFirstDriverToStart")}
                  </p>
                ) : null}
              </HubEmptyState>
            ) : null}
          </HubCard>
        }
      />

      {/* Deliberately a sibling of the split rather than a card inside its
          master column. The board carries a 272px sticky label column and a
          timeline whose width is the visible hours times the zoom, and the
          master column narrows to `minmax(300px, 1.5fr)` the moment the detail
          rail opens — which would leave the timeline about thirty pixels wide
          and scrolling inside a column that is itself scrolling. Out here it
          keeps the full page width whatever the rail is doing, and selecting a
          driver no longer resizes the day. */}
      {availability === null ? null : (
        <FleetAvailabilityCard initial={availability} />
      )}
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
  const t = useTranslations("driverHub.driversScreen");
  const tShared = useTranslations("common.shared");

  return (
    <HubCard
      // Announced as soon as it appears: the operator has to act on this before
      // it goes, and it renders below the button that produced it.
      role="status"
      aria-live="polite"
      className="border-[oklch(64%_0.19_48)]"
    >
      <p className="text-base font-semibold">
        {driver.vehicleAssigned
          ? t("registeredWithVehicle", { name: driver.name })
          : t("registered", { name: driver.name })}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {t("giveThemDetails")}{" "}
        <strong className="font-semibold text-foreground">{t("once")}</strong>{" "}
        {t("itIsNotStoredAnywhereIn")}
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-[10px] border border-border p-3">
          <dt className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground">
            {tShared("email")}
          </dt>
          <dd className="mt-1.5 truncate font-price text-[15px] font-semibold select-all">
            {driver.email}
          </dd>
        </div>
        <div className="min-w-0 rounded-[10px] border border-border p-3">
          <dt className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground">
            {tShared("temporaryPassword")}
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
        {t("doneIHaveSharedIt")}
      </Button>
    </HubCard>
  );
}
