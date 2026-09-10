"use client";

import Link from "next/link";

import type {
  HubNavItem,
  HubNavItemId,
} from "@/components/driver-hub/driver-hub-nav";
import { SampleNote } from "@/components/driver-hub/hub-primitives";
import type { HubPersona } from "@/lib/dashboard/hub/account";
import { SAMPLE_WEEKLY_INCENTIVE } from "@/lib/dashboard/hub/sample";
import { cn } from "@/lib/utils";

/** The brand orange. It has no `--color-*` token, so it is spelled out — the
 *  same call `hub-primitives.tsx` and `hub-status.ts` already make. */
const ACCENT_BG = "bg-[oklch(64%_0.19_48)]";

export type DriverHubSidebarProps = {
  /** Already filtered for the persona by the shell. */
  items: readonly HubNavItem[];
  /** The entry the current pathname resolves to, if any. */
  activeId: HubNavItemId | undefined;
  /**
   * Which of the three account shapes is signed in, resolved once by
   * `resolveHubAccount()` and passed down by the shell.
   *
   * The rail reads it for exactly one decision — whether the weekly-incentive
   * card belongs to this account at all. Required rather than optional and
   * defaulted, so a future render site that forgets it fails at `tsc` instead
   * of silently showing an independent driver's bonus bar to a fleet owner.
   */
  persona: HubPersona;
  /**
   * Optional right-aligned count badges, keyed by nav id — the design's accent
   * pill beside "Employees".
   *
   * Nothing passes one today and that is deliberate: the only count the design
   * shows is "1 invite pending", which has no schema behind it, and a nav pill
   * has nowhere to hang the `<SampleNote />` the honesty rule would require. A
   * screen with a *real* count (an unread dispatch, say) wires it in here.
   */
  counts?: Partial<Record<HubNavItemId, number>>;
};

/**
 * The hub's left rail: the nav, and — for an independent driver — the
 * weekly-incentive card.
 *
 * No brand block at the top, because the rail no longer starts at the top of
 * the page. The wordmark lives in the top bar that spans the viewport above
 * this column, so a second one here would state the product's name twice within
 * a few dozen pixels of itself.
 *
 * The links are Next `<Link>`s rather than buttons with click handlers, so
 * every screen stays deep-linkable, middle-click and ⌘-click open a new tab,
 * and the browser's own "visited"/status-bar affordances work. The prototype
 * uses buttons only because it is a single-file state machine with no routing.
 */
export function DriverHubSidebar({
  items,
  activeId,
  persona,
  counts = {},
}: DriverHubSidebarProps) {
  return (
    <aside
      // Sticky rather than `fixed`, so the rail scrolls with a short page and
      // pins on a long one without the main column needing a compensating left
      // margin.
      //
      // 57px, twice, and both are the same number for the same reason: the rail
      // begins *below* the hub's top bar rather than beside it, so it pins to
      // that bar's bottom edge (`lg:h-14` = 56px, plus its 1px bottom rule) and
      // is a viewport tall minus the same. The two must move together and must
      // track `driver-hub-topnav.tsx`'s height class — an offset that drifts
      // from the bar above leaves a strip of scrolling page content visible in
      // the gap, and a height that drifts makes the rail's own overflow point
      // land off the bottom of the window.
      className="sticky top-[57px] flex h-[calc(100vh-57px)] w-[248px] flex-none flex-col gap-6 border-r border-border bg-background px-4 py-5"
    >
      <nav aria-label="Driver hub" className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = item.id === activeId;
          const count = counts[item.id];

          return (
            <Link
              key={item.id}
              href={item.href}
              // `aria-current` is what tells assistive tech which screen is
              // open; the weight and background change is the sighted half of
              // the same signal.
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-[9px] text-sm",
                active
                  ? "bg-muted font-semibold text-foreground"
                  : "bg-transparent font-normal text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span>{item.label}</span>
              {count === undefined ? null : (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-semibold text-white",
                    ACCENT_BG,
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* The incentive card is an independent driver's fact and nobody else's:
          a roster driver is paid by their employer, so a per-job bonus is not
          theirs to earn, and a fleet owner is not the person completing the
          jobs the bar counts. Hidden rather than adapted — the numbers behind
          it are sampled, and this spec does not make sampled data real. */}
      {persona === "INDEPENDENT" ? <WeeklyIncentiveCard /> : null}
    </aside>
  );
}

/**
 * The rail's bottom card: progress towards a weekly job target.
 *
 * Entirely sampled — there is no incentive or bonus model in the schema — so it
 * carries the honesty badge rather than passing itself off as this driver's
 * real progress. Rendered for `INDEPENDENT` only; see the call site above.
 *
 * A file-local component rather than an inline block so the sampled import and
 * the percentage arithmetic live with the one thing that uses them, instead of
 * running on every render of a rail that is not going to show them.
 */
function WeeklyIncentiveCard() {
  const { jobsDone, jobsTarget, note } = SAMPLE_WEEKLY_INCENTIVE;

  // Clamped so a future target of 0 (or an overshoot) cannot paint a fill
  // wider than its track.
  const incentivePercent = Math.round(
    Math.min(1, Math.max(0, jobsTarget > 0 ? jobsDone / jobsTarget : 0)) * 100,
  );

  return (
    // `mt-auto` pins the card to the bottom of the rail's flex column. When it
    // is absent nothing else claims the free space and the rail simply ends
    // after the nav — the design has nothing else down there.
    <section
      aria-label="Weekly incentive"
      className="mt-auto rounded-xl border border-border p-3.5"
    >
      <p className="mb-2 text-[11px] tracking-[0.08em] uppercase text-muted-foreground">
        Weekly incentive
      </p>
      <p className="font-price text-[20px] font-semibold">
        {jobsDone}
        <span className="text-sm text-muted-foreground">/{jobsTarget}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Jobs towards this week's bonus"
        aria-valuenow={incentivePercent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2.5 mb-2 h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div
          className={cn("h-full rounded-full", ACCENT_BG)}
          style={{ width: `${incentivePercent}%` }}
        />
      </div>
      <p className="text-xs leading-[1.4] text-muted-foreground">{note}</p>
      <SampleNote
        note="Needs an incentive/bonus model — the schema records no weekly target or bonus."
        className="mt-2.5"
      />
    </section>
  );
}
