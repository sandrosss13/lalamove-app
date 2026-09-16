"use client";

import type { ReactNode } from "react";

import type {
  HubNavItem,
  HubNavItemId,
} from "@/components/driver-hub/driver-hub-nav";
import { DriverHubTopNav } from "@/components/driver-hub/driver-hub-topnav";
import type { HubAccount } from "@/lib/dashboard/hub/account";
import type { HubHeaderData } from "@/lib/dashboard/hub/header";

/**
 * The driver hub's chrome: the site-shaped **top bar** that spans the viewport,
 * and the plain **page head** each screen draws at the top of its own content.
 *
 * ## Why one bar, and not two
 *
 * The dashboard handoff (`UI:UX/Registered Driver account (New)/Driver
 * dashboard header alignment/Driver Dashboard v2.dc.html`) draws exactly one
 * bordered bar. The page title lives below it as an unbordered block *inside*
 * the page body's own padding — no rule under it, no fill behind it, not
 * pinned. An earlier reading of the sibling `Driver Header.dc.html` artboard put
 * the title in a second bar; the full-dashboard artboard is the newer and
 * authoritative one, and its shape is the better one anyway.
 *
 * The line it draws is lifetime, not decoration:
 *
 * - **The top bar is the session.** Where you are in the app, whether you are
 *   taking work, what is running right now, who you are, and how you leave.
 *   Identical on all six screens, so nothing in it can be overridden from
 *   below. The availability toggle belongs here for that reason and not because
 *   there was room: being online is a fact about the driver, not about the
 *   screen they happen to be reading, and it should not appear to change
 *   meaning as they move between the board and Job history.
 * - **The page head is the screen**, and it is content rather than chrome: it
 *   changes on every route, five screens derive their subhead from their own
 *   data through `useHubSubtitle()`, and a title that scrolls away with the rows
 *   it names costs nothing. Boxing it charged a second horizontal rule and a
 *   second sticky offset for the privilege of keeping a string on screen.
 *
 * ## Stickiness
 *
 * The top bar is sticky at every width — it holds the only navigation a phone
 * has — and it is the page's first child, so it spans the full viewport with the
 * rail beginning *under* it rather than beside it. Its `lg:h-14` is a fixed
 * class rather than an intrinsic height for one reason: the rail pins itself
 * below the bar with a `top-` offset, and an offset that drifts from the height
 * above it leaves a translucent seam. `driver-hub-sidebar.tsx` derives its 57px
 * from that 56 plus the bar's 1px rule, and says so.
 *
 * ## What is real and what is not
 *
 * Everything in the top bar is real except the notification bell, whose count
 * and rows come from `HubHeaderData.sampled` and are badged with a
 * `<SampleNote />` inside the panel — there is no `Notification` model in the
 * schema. The active-job pill is entirely real, ETA included, and must never be
 * badged. See `src/lib/dashboard/hub/header.ts`.
 *
 * ## No persona control, of either kind
 *
 * The prototype puts a Business/Individual **segmented control** in its rail.
 * That is a prototype affordance — it exists so one HTML file can demo both
 * shapes of the product. In the real app the account kind is derived from the
 * session by `resolveHubAccount()` and is the same fact the Drivers/Employees
 * pages guard on server-side, so a client-side switcher would be a control that
 * either lies (the pages still redirect) or grants screens the session does not
 * entitle the user to. Do not re-add the switcher.
 *
 * The static persona chip that used to stand in for it is gone too, for a
 * duller reason: the dashboard artboard shows persona nowhere in its chrome. It
 * stated something the driver could not act on, and the rail's own filtered link
 * list already tells them which shape of the product they are in.
 */
export type DriverHubHeaderProps = {
  account: HubAccount;
  /** Resolved once per request by `getHubHeader()` in the hub layout. */
  header: HubHeaderData;
  /** Already persona-filtered by the shell — the same list the rail draws. */
  navItems: readonly HubNavItem[];
  /** The nav entry the current pathname resolves to, if any. */
  activeId: HubNavItemId | undefined;
};

export function DriverHubHeader({
  account,
  header,
  navItems,
  activeId,
}: DriverHubHeaderProps) {
  return (
    // One sticky box around the top bar and the phone's job strip, so the two
    // travel together and the rail below has a single number to match.
    // `bg-background` belongs here rather than only on the bar inside it: the
    // job strip is a bordered link with no fill of its own, and page content
    // would otherwise scroll through it.
    <div className="sticky top-0 z-30 bg-background">
      <DriverHubTopNav
        account={account}
        header={header}
        navItems={navItems}
        activeId={activeId}
      />
    </div>
  );
}

export type DriverHubPageHeadProps = {
  /** The active nav entry's 20px page title. */
  title: string;
  /**
   * The 13px subhead: a screen's own derived string when it registered one via
   * `useHubSubtitle`, otherwise the nav entry's static fallback. Empty renders
   * nothing rather than an empty line.
   */
  subtitle: string;
  /**
   * A screen-supplied node placed opposite the title — today only the Load
   * Board's vehicle-capacity pill.
   *
   * Registered from below via `useHubVehiclePill()` rather than passed down
   * from a page, because the screens are client components mounted inside the
   * shell's own subtree. `null`/absent (every screen but Loads) renders nothing
   * at all — not an empty box.
   */
  vehiclePill?: ReactNode;
};

/**
 * The page head: the title, its subhead, and the one screen-owned control that
 * sits beside them.
 *
 * Rendered by the shell as the first child of the page body's content column,
 * so it inherits that column's 20px gap rather than restating the design's
 * `margin-bottom: 20px`, and sits inside the body's own `28px 32px 56px`
 * padding exactly as `showPageHead` does in the artboard.
 */
export function DriverHubPageHead({
  title,
  subtitle,
  vehiclePill,
}: DriverHubPageHeadProps) {
  return (
    // The artboard has no load-board screen, so it is silent on where the
    // vehicle pill goes rather than contradicting the slot — it draws the page
    // head as a title block and nothing else. The slot is a working control on
    // the board — the screen the rail labels "Dashboard" — so it is kept and
    // placed opposite the title, which is the one position that neither pushes
    // the head taller nor competes with it.
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-semibold tracking-[-0.015em] lg:text-[20px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-[12px] text-muted-foreground lg:text-[13px]">
            {subtitle}
          </p>
        ) : null}
      </div>

      {vehiclePill}
    </div>
  );
}
