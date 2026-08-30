"use client";

import Link from "next/link";

import type {
  HubNavItem,
  HubNavItemId,
} from "@/components/driver-hub/driver-hub-nav";
import { SampleNote } from "@/components/driver-hub/hub-primitives";
import { SAMPLE_WEEKLY_INCENTIVE } from "@/lib/dashboard/hub/sample";
import { cn } from "@/lib/utils";

/** The brand orange. It has no `--color-*` token, so it is spelled out — the
 *  same call `hub-primitives.tsx` and `hub-status.ts` already make. */
const ACCENT_BG = "bg-[oklch(64%_0.19_48)]";

export type DriverHubSidebarProps = {
  /** Already filtered for the account kind by the shell. */
  items: readonly HubNavItem[];
  /** The entry the current pathname resolves to, if any. */
  activeId: HubNavItemId | undefined;
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
 * The hub's left rail: brand row, the nav, and the weekly-incentive card.
 *
 * The links are Next `<Link>`s rather than buttons with click handlers, so
 * every screen stays deep-linkable, middle-click and ⌘-click open a new tab,
 * and the browser's own "visited"/status-bar affordances work. The prototype
 * uses buttons only because it is a single-file state machine with no routing.
 */
export function DriverHubSidebar({
  items,
  activeId,
  counts = {},
}: DriverHubSidebarProps) {
  const { jobsDone, jobsTarget, note } = SAMPLE_WEEKLY_INCENTIVE;

  // Clamped so a future target of 0 (or an overshoot) cannot paint a fill
  // wider than its track.
  const incentivePercent = Math.round(
    Math.min(1, Math.max(0, jobsTarget > 0 ? jobsDone / jobsTarget : 0)) * 100,
  );

  return (
    <aside
      // Sticky at full viewport height rather than `fixed`, so the rail scrolls
      // with a short page and pins on a long one without the main column
      // needing a compensating left margin.
      className="sticky top-0 flex h-screen w-[248px] flex-none flex-col gap-7 border-r border-border bg-background px-4 py-6"
    >
      <div className="flex items-center gap-2.5 px-2">
        <div
          aria-hidden="true"
          className={cn("size-[26px] rounded-[7px]", ACCENT_BG)}
        />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">
          Driver Hub · Georgia
        </span>
      </div>

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
                    "min-w-5 rounded-full px-1.5 py-px text-center font-price text-[11px] font-semibold text-white",
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

      {/* Weekly incentive. Entirely sampled — there is no incentive or bonus
          model in the schema — so it carries the honesty badge rather than
          passing itself off as this driver's real progress. */}
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
    </aside>
  );
}
