"use client";

import * as React from "react";

import { useHubSubtitle } from "@/components/driver-hub/driver-hub-shell";
import {
  FilterStrip,
  HubCard,
  HubEmptyState,
  HubStatusBadge,
  MasterDetailSplit,
  type FilterStripItem,
} from "@/components/driver-hub/hub-primitives";
import { JobsDetailPanel } from "@/components/driver-hub/screens/jobs-detail-panel";
import {
  formatDistanceKm,
  formatGel,
  formatJobTime,
  formatJobTimestamp,
  pluralise,
} from "@/components/driver-hub/screens/jobs-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HubJob, HubJobsData } from "@/lib/dashboard/hub/jobs";
import { cn } from "@/lib/utils";

/**
 * Job history — every job this account has ever run, filtered by state, with
 * the selected one opened beside the list.
 *
 * ## The screen with nothing to apologise for
 *
 * This is the one hub screen that renders no `<SampleNote />` at all, and that
 * is a property worth protecting rather than a coincidence: every column here,
 * every timeline step and every fare line is a column on `Order`. See the
 * module comment on `src/lib/dashboard/hub/jobs.ts`. If a future change wants a
 * figure this screen cannot source — a tip, a stop count, an acceptance
 * latency — it belongs in `sample.ts` behind a badge, or nowhere.
 *
 * Two places the design is deliberately not followed, both for that reason:
 * the **Tip** fare line is absent (`Order` has no tip column) and the
 * four-step timeline is three steps (`Order` is single-leg and records no
 * acceptance) — see `jobs-detail-panel.tsx`.
 *
 * ## Selection
 *
 * The screen owns which job is selected and nothing else; the panel is
 * read-only, so unlike Vehicles and Drivers there is no armed destructive flag
 * to clear and no mutation to sequence. Selection is keyed on `HubJob.id`, the
 * cuid — never on `shortId`, which is six derived characters that two orders
 * can perfectly well share. `shortId` is what the reader sees; `id` is what the
 * screen means.
 */

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The design's four tabs. "Active" is the union of the two unfinished states,
 * which is exactly what `HubJobCounts.active` already tallies — so the tabs and
 * the counts cannot describe different sets.
 */
const TABS = [
  { value: "All", label: "All" },
  { value: "Active", label: "Active" },
  { value: "Completed", label: "Completed" },
  { value: "Cancelled", label: "Cancelled" },
] as const satisfies readonly FilterStripItem[];

type JobsTab = (typeof TABS)[number]["value"];

/** `FilterStrip` hands back a plain string; this is the narrowing back. */
function isJobsTab(value: string): value is JobsTab {
  return TABS.some((item) => item.value === value);
}

function matchesTab(job: HubJob, tab: JobsTab): boolean {
  switch (tab) {
    case "All":
      return true;
    case "Active":
      return job.status === "In transit" || job.status === "Scheduled";
    case "Completed":
      return job.status === "Completed";
    case "Cancelled":
      return job.status === "Cancelled";
  }
}

/* -------------------------------------------------------------------------- */
/* Timestamps                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The one timestamp worth putting in a 90px column for a job in this state.
 *
 * A completed job is remembered by when it was delivered, a scheduled one by
 * the slot it is booked into, one in transit by when it started moving, and a
 * cancelled one by when it was booked — nothing records when it was cancelled.
 * Written as a switch rather than a chain of `??` so each state's answer is
 * stated rather than inferred from the order of the fallbacks.
 *
 * `scheduledAt` is null on every order booked before that column existed, and
 * `inTransitAt` is null on an order cancelled before dispatch, so both fall
 * back to `createdAt` — the only timestamp every row is guaranteed to have.
 */
function primaryTimestamp(job: HubJob): string {
  switch (job.status) {
    case "Completed":
      return job.completedAt ?? job.createdAt;
    case "Scheduled":
      return job.scheduledAt ?? job.createdAt;
    case "In transit":
      return job.inTransitAt ?? job.createdAt;
    case "Cancelled":
      return job.createdAt;
  }
}

/* -------------------------------------------------------------------------- */
/* Table geometry                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The design's data table is a CSS grid, not a `<table>` layout — fixed and
 * fractional tracks side by side, which no table-layout algorithm reproduces.
 * So the rows are grids, the table element is a block, and every table role is
 * restated explicitly: a `display` other than `table` is enough for some
 * browsers to drop the implicit roles, and this *is* tabular data.
 *
 * One track list for both states, unlike Vehicles and Drivers. The handoff
 * gives Jobs a single column set and no split-state reduction — all six columns
 * here are load-bearing, and the `Table` primitive's own `overflow-x-auto`
 * scrolls the 740px floor inside the narrowed pane, which is the behaviour the
 * handoff's "narrow panes scroll horizontally" rule asks for.
 *
 * A static class string rather than an inline `gridTemplateColumns` so Tailwind
 * can see the tracks at build time. Widths are the handoff's, verbatim.
 */
const COLUMNS =
  "grid-cols-[110px_minmax(180px,1fr)_90px_90px_90px_110px] min-w-[740px]";

// `font-normal`, and it has to be spelled out rather than simply omitted:
// `TableHead` bakes `font-medium` into its own base classes
// (`src/components/ui/table.tsx`), so dropping the weight from here leaves
// tailwind-merge nothing to override and the header still renders at 500.
//
// Weight 400 is what the handoff draws — its header row sets a size, a
// transform, a letter-spacing and a colour, and no weight at all. The
// uppercase 11px treatment is what separates the head from the rows here; a
// bumped weight on top of it reads as a second emphasis.
const HEAD_CLASSES =
  "h-auto px-0 pb-2.5 text-[11px] font-normal tracking-[0.08em] uppercase text-muted-foreground";
const CELL_CLASSES = "min-w-0 px-0 py-3.5";

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export type JobsScreenProps = {
  data: HubJobsData;
  /**
   * The instant the server rendered this page at.
   *
   * Relative day labels ("Yesterday 18:20") need a "now", and reading one from
   * the clock would sample it twice — once during the server render, once at
   * hydration — so a render straddling Tbilisi midnight would relabel a row
   * between the two passes and trip a hydration mismatch. One instant handed
   * down from the page makes both passes agree by construction. Combined with
   * the pinned locale and time zone in `jobs-format.ts`, every string this
   * screen prints is identical on both sides.
   *
   * It goes stale while the tab sits open, which is the same staleness the rest
   * of this server-rendered snapshot already has; `router.refresh()` from
   * anywhere in the hub renews it.
   */
  nowIso: string;
};

export function JobsScreen({ data, nowIso }: JobsScreenProps) {
  const { jobs, counts } = data;

  const [tab, setTab] = React.useState<JobsTab>("All");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  useHubSubtitle(
    counts.all === 0
      ? "No jobs yet"
      : `${pluralise(counts.all, "job")} · ${counts.completed} completed · ${
          counts.active
        } active`,
  );

  const visible = jobs.filter((job) => matchesTab(job, tab));

  // A refresh can drop the selected job out of the list entirely (it is the
  // account's own history, so this is rare, but a reassignment does it), and a
  // stale id must collapse the rail rather than leave a panel describing a row
  // that is no longer there.
  const selectedJob = jobs.find((job) => job.id === selectedId) ?? null;

  const closeDetail = React.useCallback(() => {
    setSelectedId(null);
  }, []);

  const hasJobs = jobs.length > 0;

  return (
    <MasterDetailSplit
      detailLabel={
        selectedJob === null ? "job details" : `job ${selectedJob.shortId}`
      }
      detail={
        selectedJob === null ? undefined : (
          <JobsDetailPanel
            job={selectedJob}
            nowIso={nowIso}
            primaryAtIso={primaryTimestamp(selectedJob)}
          />
        )
      }
      onCloseDetail={closeDetail}
      master={
        <HubCard>
          {/* With no rows at all there is nothing to filter, so the toolbar is
              absent rather than offering four pills that all say "0 of 0". */}
          {hasJobs ? (
            <div className="mb-[18px] flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <FilterStrip
                items={TABS}
                value={tab}
                onChange={(next) => {
                  if (isJobsTab(next)) {
                    setTab(next);
                  }
                }}
                ariaLabel="Filter jobs by status"
              />
              {/* The denominator is the server's own tally rather than
                  `jobs.length`, so the caption and the tab counts can never
                  describe different sets. */}
              <span className="text-xs text-muted-foreground">
                <span className="font-price">{visible.length}</span> of{" "}
                <span className="font-price">{counts.all}</span> shown
              </span>
            </div>
          ) : null}

          {hasJobs ? (
            <>
              {/* `Table` brings its own `overflow-x-auto` wrapper — the
                  min-width in `COLUMNS` is what makes that wrapper scroll on a
                  narrow pane. */}
              <Table role="table" className={cn("block", COLUMNS)}>
                <TableHeader role="rowgroup" className="block">
                  <TableRow
                    role="row"
                    className={cn(
                      "grid items-center gap-3 border-b border-border hover:bg-transparent",
                      COLUMNS,
                    )}
                  >
                    <TableHead role="columnheader" className={HEAD_CLASSES}>
                      Job
                    </TableHead>
                    <TableHead role="columnheader" className={HEAD_CLASSES}>
                      Route
                    </TableHead>
                    <TableHead role="columnheader" className={HEAD_CLASSES}>
                      Distance
                    </TableHead>
                    <TableHead role="columnheader" className={HEAD_CLASSES}>
                      Time
                    </TableHead>
                    <TableHead role="columnheader" className={HEAD_CLASSES}>
                      Fare
                    </TableHead>
                    <TableHead
                      role="columnheader"
                      className={cn(HEAD_CLASSES, "text-right")}
                    >
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody role="rowgroup" className="block">
                  {visible.map((job) => {
                    const selected = job.id === selectedJob?.id;
                    const route = `${job.pickupAddress} → ${job.dropoffAddress}`;
                    const at = primaryTimestamp(job);

                    return (
                      <TableRow
                        // The cuid, never `shortId` — six trailing characters
                        // of a cuid are not unique by construction, and a
                        // duplicate React key silently merges two rows.
                        key={job.id}
                        role="row"
                        // Mouse convenience only — the keyboard path is the
                        // button in the Job cell, which does the same.
                        onClick={() => setSelectedId(job.id)}
                        data-state={selected ? "selected" : undefined}
                        className={cn(
                          "grid cursor-pointer items-center gap-3 border-b border-muted text-sm",
                          COLUMNS,
                        )}
                      >
                        <TableCell role="cell" className={CELL_CLASSES}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(job.id)}
                            aria-current={selected ? "true" : undefined}
                            // The full cuid as a `title`: the visible code is a
                            // readable stand-in, not the identifier.
                            title={job.id}
                            className="block w-full min-w-0 truncate rounded-sm text-left font-price font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            {job.shortId}
                          </button>
                        </TableCell>

                        <TableCell
                          role="cell"
                          className={cn(CELL_CLASSES, "truncate")}
                          // Tbilisi street addresses routinely outrun the
                          // track, and a truncated route is unreadable without
                          // the whole string somewhere.
                          title={route}
                        >
                          {route}
                        </TableCell>

                        <TableCell
                          role="cell"
                          className={cn(CELL_CLASSES, "truncate font-price")}
                        >
                          {formatDistanceKm(job.distanceKm)}
                        </TableCell>

                        <TableCell
                          role="cell"
                          className={cn(
                            CELL_CLASSES,
                            "truncate font-price text-muted-foreground",
                          )}
                          title={formatJobTimestamp(at)}
                        >
                          {formatJobTime(at, nowIso)}
                        </TableCell>

                        <TableCell
                          role="cell"
                          className={cn(
                            CELL_CLASSES,
                            "truncate font-price font-semibold",
                          )}
                        >
                          {formatGel(job.fare)}
                        </TableCell>

                        <TableCell
                          role="cell"
                          className={cn(CELL_CLASSES, "flex justify-end")}
                        >
                          <HubStatusBadge status={job.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Two different nothings, and the copy says which: the account
                  has jobs but none in this state, versus it has none at all
                  (handled below, where there is no header row to sit under). */}
              {visible.length === 0 ? (
                <HubEmptyState
                  // `tab === "All"` cannot reach here — All matches every row
                  // and the branch above already established there are rows —
                  // but "No all jobs." is not a sentence, so it is spelled out
                  // rather than left to a template that would produce one.
                  message={
                    tab === "All"
                      ? "No jobs to show."
                      : `No ${tab.toLowerCase()} jobs.`
                  }
                >
                  <p className="mt-1.5 text-[13px]">
                    <span className="font-price">{counts.all}</span> jobs in
                    this account&rsquo;s history — switch to All to see them.
                  </p>
                </HubEmptyState>
              ) : null}
            </>
          ) : (
            <HubEmptyState message="No jobs yet.">
              <p className="mt-1.5 text-[13px]">
                Completed, scheduled and cancelled jobs all land here, with
                their route, timeline and fare breakdown.
              </p>
            </HubEmptyState>
          )}
        </HubCard>
      }
    />
  );
}
