"use client";

import { Bell } from "lucide-react";

import { SampleNote } from "@/components/driver-hub/hub-primitives";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { HubHeaderNotification } from "@/lib/dashboard/hub/header";
import { cn } from "@/lib/utils";

/**
 * The header's notification bell and the panel behind it.
 *
 * **Every number and row on this surface is invented, and the panel says so.**
 * There is no `Notification` model in `prisma/schema.prisma` — no row per event,
 * no per-user read state, nothing writing one at any point in the order
 * lifecycle — so the count over the bell and the two lines under it come from
 * `SAMPLE_HEADER_NOTIFICATIONS` by way of `HubHeaderData.sampled`. The
 * `<SampleNote />` in the panel is therefore not optional decoration: it is the
 * whole reason this component is allowed to exist before the model does. If you
 * are here to wire the bell to real data, delete the note in the same commit
 * that deletes the `sampled` nesting level, and not before.
 *
 * The badge is *not* also marked on the bar itself. A 15px dashed pill hung off
 * a 32px icon button is illegible at that size and would push the header's
 * right-hand cluster around; the panel is one click away and is where the rows
 * the count refers to actually live, so that is where the claim is qualified.
 * The accessible name of the trigger carries the qualification for anyone who
 * never opens the panel — see `bellLabel` below.
 */

/** The brand orange. It has no `--color-*` token, so it is spelled out. */
const ACCENT_BG = "bg-[oklch(64%_0.19_48)]";

/**
 * What would make this real, shown on the note as a tooltip and read out by
 * assistive tech. Phrased as the schema change rather than as an apology,
 * matching every other `SampleNote` on this surface.
 */
const SAMPLE_NOTE =
  "Needs a Notification model — the schema records no notifications, so this count and these rows are invented.";

export type DriverHubNotificationsProps = {
  /** `HubHeaderData.sampled.notificationCount`. Fictional; see above. */
  count: number;
  /** `HubHeaderData.sampled.notifications`, newest first. Fictional. */
  notifications: readonly HubHeaderNotification[];
  /** Whether this is the one panel the header currently has open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The trigger's accessible name.
 *
 * It states the count, because the badge that carries it visually is
 * `aria-hidden` — an icon button whose only label was "Notifications" would
 * leave a screen-reader user unable to tell a quiet bell from a loud one. It
 * also states that the count is sampled, for the same reason the panel does:
 * this is the one piece of the bell a user can perceive without opening it, so
 * it is the one piece that has to carry the qualification on its own.
 */
function bellLabel(count: number): string {
  if (count === 0) {
    return "Notifications — none (sample data)";
  }

  return `Notifications — ${count} unread (sample data)`;
}

export function DriverHubNotifications({
  count,
  notifications,
  open,
  onOpenChange,
}: DriverHubNotificationsProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        type="button"
        aria-label={bellLabel(count)}
        // 44×44 below `lg` and 32×32 above it: the design gives the phone
        // header a 44px target (its own figure, and the WCAG 2.2 "Target Size
        // (Minimum)" floor) and the desktop bar a 32px one, where a pointer
        // rather than a thumb is doing the aiming.
        className="relative grid size-11 flex-none place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:size-8 lg:rounded-lg"
      >
        <Bell aria-hidden="true" className="size-[19px] lg:size-[17px]" />
        {count === 0 ? null : (
          // Decorative: the count is already in the trigger's accessible name
          // above, and announcing it twice is how an icon button ends up read
          // as "Notifications 2 unread sample data, 2".
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1.5 right-1.5 min-w-[15px] rounded-full px-[3px] text-center font-price text-[10px] leading-[15px] font-semibold text-white lg:top-px lg:right-px",
              ACCENT_BG,
            )}
          >
            {count}
          </span>
        )}
      </PopoverTrigger>

      {/* Portalled to `document.body`, so it repeats `data-admin-surface` — see
          the identical note in `driver-hub-job-pill.tsx`. */}
      <PopoverContent
        data-admin-surface=""
        align="end"
        sideOffset={8}
        className="w-[290px] gap-0 overflow-hidden rounded-xl border border-border p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-[11px]">
          <p className="text-[12px] font-semibold">Notifications</p>
          {/* The honesty marker, and the reason this component may ship at all.
              Beside the title rather than under the rows so it is read before
              the fiction it qualifies, in both the visual and the DOM order. */}
          <SampleNote note={SAMPLE_NOTE} />
        </div>

        <div className="flex flex-col">
          {notifications.length === 0 ? (
            <p className="px-3.5 py-4 text-[12px] text-muted-foreground">
              Nothing to catch up on.
            </p>
          ) : (
            notifications.map((notification) => (
              // A `<div>`, not a link: there is nothing to open. Every row is a
              // fabricated event with no `Order`, payout or screen behind it,
              // so an anchor here would be a control that either goes nowhere
              // or lies about where it goes. Rows become links in the change
              // that makes them real.
              <div
                key={notification.id}
                className="flex flex-col gap-0.5 border-b border-border px-3.5 py-[11px] last:border-b-0"
              >
                <span className="text-[13px] font-medium">
                  {notification.title}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {notification.timeLabel}
                </span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
