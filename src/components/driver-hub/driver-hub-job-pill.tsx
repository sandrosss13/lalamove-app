"use client";

import Link from "next/link";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { HubHeaderJob } from "@/lib/dashboard/hub/header";
import type { HubPersona } from "@/lib/dashboard/hub/account";
import { cn } from "@/lib/utils";

/**
 * The header's active-job surface: the desktop pill with its dropdown, and the
 * full-width bar the design puts under the bar on a phone.
 *
 * **Everything here is real.** The jobs, the count, the route strings and the
 * ETA all come out of `getHubHeader()`'s `Order` query, so nothing on this
 * surface carries a `<SampleNote />` — only the notification bell next to it
 * does. Do not add one here "for symmetry": the badge means "this number is
 * invented", and inventing it about a dispatcher's live jobs would be the one
 * lie this whole honesty convention exists to prevent.
 *
 * The design's two shapes (`UI:UX/Registered Driver account (New)/Driver
 * dashboard header alignment/Driver Header.dc.html`, `renderVals()`) are
 * branched on `HubHeaderData.persona` and on nothing else — never on
 * `kind`/`companyId`, which `resolveHubAccount()` already collapsed into the
 * persona for exactly this reason.
 */

/** The brand orange. It has no `--color-*` token, so it is spelled out — the
 *  same call `hub-primitives.tsx` and `driver-hub-sidebar.tsx` already make. */
const ACCENT_BG = "bg-[oklch(64%_0.19_48)]";

/**
 * Where a job row and the dropdown's footer link point.
 *
 * `/dashboard/jobs/[id]` — the job sheet — now exists, so a job IS addressable
 * by URL, and a *driver's* dropdown rows link to their own sheets. These two
 * constants are what the footer link always uses, and what a fleet's rows use
 * as well: the footer is the "see all of them" affordance and a set has no
 * sheet, while a fleet's rows name jobs the owner is not the driver of and so
 * cannot open. See the row's own comment for that second rule.
 *
 * This comment previously said no such route existed and that linking to one
 * would 404 from the header on every click — true when written, and the reason
 * each persona was given the nearest list instead: a fleet gets the screen it
 * dispatches from, a single driver gets Today, whose current-job card is that
 * one job in full. Both remain the right destinations for a *footer*; what
 * changed is that they are now a choice rather than the only option.
 */
const FLEET_JOBS_HREF = "/dashboard/jobs";
const SINGLE_DRIVER_JOB_HREF = "/dashboard/today";

/** The design's footer link copy, one per persona shape. */
const FLEET_LINK_LABEL = "View all jobs in progress";
const SINGLE_DRIVER_LINK_LABEL = "Open this job";

export type DriverHubJobPillProps = {
  /** Echoed from `HubHeaderData.persona`; `"BUSINESS"` is the fleet shape. */
  persona: HubPersona;
  /** Uncapped total — the number the fleet's pill prints. */
  jobsInProgressCount: number;
  /** Already capped by the loader: three rows for a fleet, one otherwise. */
  jobs: readonly HubHeaderJob[];
  /** Whether the dropdown is the one panel the header currently has open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The pill's label, and the dropdown's own heading — the design prints the same
 * string in both places.
 *
 * A fleet is counted; a single driver is named. The singular is handled rather
 * than transcribed from the design's `${n} jobs in progress`, because a
 * one-van company is an ordinary account and "1 jobs in progress" in the
 * product's most-visible chrome is the kind of thing a user screenshots.
 */
function jobPillLabel(
  persona: HubPersona,
  jobsInProgressCount: number,
  jobs: readonly HubHeaderJob[],
): string {
  if (persona === "BUSINESS") {
    return jobsInProgressCount === 1
      ? "1 job in progress"
      : `${jobsInProgressCount} jobs in progress`;
  }

  // `jobs[0]` exists wherever this renders — the caller drops the whole surface
  // on an empty list — but the index access is still guarded, because a
  // `undefined` here would print "Job in progress · undefined" rather than
  // fail, and a silent wrong string is worse than the reference being absent.
  const shortId = jobs[0]?.shortId;

  return shortId ? `Job in progress · ${shortId}` : "Job in progress";
}

/** One row of the dropdown, and the mobile bar, share this destination rule. */
function jobsHref(persona: HubPersona): string {
  return persona === "BUSINESS" ? FLEET_JOBS_HREF : SINGLE_DRIVER_JOB_HREF;
}

/**
 * The desktop pill: an accent dot, the label, and a dropdown listing the jobs.
 *
 * A Radix `Popover` rather than hand-rolled state and listeners, per the shell's
 * standing preference for `src/components/ui/` primitives. It is not decoration:
 * the primitive is what gives the trigger its `aria-expanded`/`aria-controls`
 * pair, dismissal on `Escape` and on an outside press, focus return to the
 * trigger on close, and the `inert` treatment of the rest of the page — all of
 * which a hand-rolled panel gets wrong quietly.
 *
 * `open`/`onOpenChange` are lifted to `DriverHubTopNav` rather than left
 * internal, because the design's prototype closes the bell when this opens and
 * vice versa (`toggleJobs` sets `bellOpen: false`). Two independent Popovers
 * *nearly* achieve that through outside-press dismissal, but "nearly" here means
 * a keyboard user can hold both panels open at once.
 */
export function DriverHubJobPill({
  persona,
  jobsInProgressCount,
  jobs,
  open,
  onOpenChange,
}: DriverHubJobPillProps) {
  // The design's `showActiveJob`: no live jobs means no pill at all, rather
  // than a pill that opens onto an empty list.
  if (jobs.length === 0) {
    return null;
  }

  const label = jobPillLabel(persona, jobsInProgressCount, jobs);
  const href = jobsHref(persona);
  const linkLabel =
    persona === "BUSINESS" ? FLEET_LINK_LABEL : SINGLE_DRIVER_LINK_LABEL;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        type="button"
        className="inline-flex h-8 max-w-[240px] items-center gap-[7px] rounded-full border border-border py-1 pr-[11px] pl-[9px] text-[12px] font-semibold whitespace-nowrap transition-colors hover:border-[oklch(64%_0.19_48)] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className={cn("size-[7px] flex-none rounded-full", ACCENT_BG)}
        />
        <span className="truncate">{label}</span>
      </PopoverTrigger>

      {/* `data-admin-surface` is required, not decorative: Radix portals this
          content to `document.body`, outside `DriverHubShell`'s attributed
          root, and without it `bg-popover`, `border-border` and `bg-accent`
          resolve to the marketing palette instead of the hub's. Nothing errors
          — the colours are simply wrong. Same precedent as
          `loads-detail-sheet.tsx`. */}
      <PopoverContent
        data-admin-surface=""
        align="end"
        sideOffset={8}
        className="w-[330px] gap-0 overflow-hidden rounded-xl border border-border p-0"
      >
        <p className="border-b border-border px-3.5 py-[11px] text-[12px] font-semibold">
          {label}
        </p>
        <div className="flex flex-col">
          {jobs.map((job) => (
            <Link
              key={job.id}
              // A row names one job, so for a driver it goes to that job's
              // sheet — the route the header has been waiting for.
              //
              // **Not for a fleet.** `hubOrderScope` scopes a BUSINESS
              // account's rows by `companyId`, so they are jobs its employees
              // are driving, or are still unassigned. `getHubJobSheet`
              // requires `driverId === userId`, so every one of those rows
              // would land the owner on the generic "Order not found." — the
              // same page a probed id gets, which is correct behaviour for a
              // stranger's order and useless feedback for your own fleet's.
              // A company-scoped sheet is a different screen; until it
              // exists, the list is the honest destination.
              href={
                persona === "BUSINESS" ? href : `/dashboard/jobs/${job.id}`
              }
              // The panel does not survive the navigation it starts: without
              // this the popover stays mounted and open over the screen the
              // driver just asked for.
              onClick={() => {
                onOpenChange(false);
              }}
              className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-[11px] hover:bg-accent"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                {/* Truncated rather than wrapped: these are full street
                    addresses, not the design's mock district pair — see
                    `HubHeaderJob.route` for why the schema cannot produce
                    "Vake → Saburtalo". */}
                <span className="truncate text-[13px] font-medium">
                  {job.route}
                </span>
                {/* `who` is `null` for anyone but a fleet — a driver looking at
                    their own job does not need to be told whose it is — and an
                    absent line renders as no line rather than an empty one. */}
                {job.who === null ? null : (
                  <span className="truncate text-[11px] text-muted-foreground">
                    {job.who}
                  </span>
                )}
              </span>
              {job.eta === null ? null : (
                <span className="flex-none font-price text-[11px] whitespace-nowrap text-muted-foreground">
                  {job.eta}
                </span>
              )}
            </Link>
          ))}
          <Link
            href={href}
            onClick={() => {
              onOpenChange(false);
            }}
            className="px-3.5 py-[11px] text-[12px] font-semibold hover:bg-accent"
          >
            {linkLabel}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type DriverHubJobBarProps = Omit<
  DriverHubJobPillProps,
  "open" | "onOpenChange"
>;

/**
 * The phone's active-job element: a full-width bar under the bar, and a plain
 * link rather than a dropdown.
 *
 * That is the design's own call and it is the right one for the width — a 330px
 * panel on a 390px screen is a modal in all but name, and the destination it
 * would offer is the single link this bar already is. It therefore needs none
 * of the popover's state, which is also why the header can mount exactly one
 * jobs Popover across both breakpoints instead of a hidden duplicate whose
 * portalled content would still render.
 */
export function DriverHubJobBar({
  persona,
  jobsInProgressCount,
  jobs,
}: DriverHubJobBarProps) {
  if (jobs.length === 0) {
    return null;
  }

  return (
    <Link
      href={jobsHref(persona)}
      className="flex min-h-11 items-center gap-2 border-b border-border px-4 text-[13px] font-semibold active:bg-accent lg:hidden"
    >
      <span
        aria-hidden="true"
        className={cn("size-[7px] flex-none rounded-full", ACCENT_BG)}
      />
      <span className="truncate">
        {jobPillLabel(persona, jobsInProgressCount, jobs)}
      </span>
    </Link>
  );
}
