"use client";

import type { ReactNode } from "react";

import type {
  HubNavItem,
  HubNavItemId,
} from "@/components/driver-hub/driver-hub-nav";
import {
  ACCOUNT_PERSONA_LABELS,
  DriverHubTopNav,
} from "@/components/driver-hub/driver-hub-topnav";
import { HubOnlineToggle } from "@/components/driver-hub/hub-online-toggle";
import { Badge } from "@/components/ui/badge";
import type { HubAccount } from "@/lib/dashboard/hub/account";
import type { HubHeaderData } from "@/lib/dashboard/hub/header";

/**
 * The driver hub's chrome above the page body: the site-shaped **top bar**, and
 * under it the **page-title bar** every hub screen has always had.
 *
 * ## How the two compose, and why there are two
 *
 * The header-alignment handoff (`UI:UX/Registered Driver account (New)/Driver
 * dashboard header alignment/Driver Header.dc.html`) *adds* a bar; it does not
 * replace one. Its own frame makes the point: the wordmark/nav/bell bar sits
 * above screen content that keeps its own `{{ screenTitle }}` and
 * `{{ screenSub }}` — two bars, one for the product and one for the page. So
 * the split here is by ownership rather than by design fiat:
 *
 * - **The top bar is the product.** Where you are in the app, what is running
 *   right now, who you are, and how you leave. Identical on all eight screens,
 *   so nothing in it can be overridden from below.
 * - **The page-title bar is the screen.** Its title and subhead — including the
 *   six subheads a screen derives from its own data through `useHubSubtitle()`
 *   — plus the working state that belongs to the screen you are on: the Load
 *   Board's `vehiclePill` slot, the persona chip and the availability toggle.
 *
 * Sign out and the driver's name moved *up* into the top bar with the rest of
 * the identity, because that is where the design puts them and because they are
 * facts about the session rather than about the page.
 *
 * ## Stickiness
 *
 * The top bar is sticky at every width — it holds the only navigation a phone
 * has. The page-title bar is sticky only from `lg`, offset by the top bar's own
 * `h-14`, which is why that height is a fixed class rather than intrinsic: a
 * `top-` offset has to be a number, and a number that drifts from the bar above
 * it leaves a translucent seam. Below `lg` the title bar scrolls away instead,
 * because pinning a 60px bar, a 44px job strip and a two-line title block on a
 * 390×844 screen would spend a fifth of the viewport on chrome before a screen
 * draws anything.
 *
 * ## What is real and what is not
 *
 * Everything in the top bar is real except the notification bell, whose count
 * and rows come from `HubHeaderData.sampled` and are badged with a
 * `<SampleNote />` inside the panel — there is no `Notification` model in the
 * schema. The active-job pill is entirely real, ETA included, and must never be
 * badged. See `src/lib/dashboard/hub/header.ts`.
 *
 * The prototype also puts a Business/Individual **segmented control** in this
 * bar. That is a prototype affordance — it exists so one HTML file can demo
 * both shapes of the product. In the real app the account kind is derived from
 * the session by `resolveHubAccount()` and is the same fact the
 * Drivers/Employees pages guard on server-side, so a client-side switcher would
 * be a control that either lies (the pages still redirect) or grants screens
 * the session does not entitle the user to. Hence the static chip below. Do not
 * re-add the switcher.
 */
export type DriverHubHeaderProps = {
  account: HubAccount;
  /** Resolved once per request by `getHubHeader()` in the hub layout. */
  header: HubHeaderData;
  /** Already persona-filtered by the shell — the same list the rail draws. */
  navItems: readonly HubNavItem[];
  /** The nav entry the current pathname resolves to, if any. */
  activeId: HubNavItemId | undefined;
  /** The active nav entry's 20px page title. */
  title: string;
  /**
   * The 13px subhead: a screen's own derived string when it registered one via
   * `useHubSubtitle`, otherwise the nav entry's static fallback. Empty renders
   * nothing rather than an empty line.
   */
  subtitle: string;
  /**
   * A screen-supplied node dropped into the page-title bar's right-hand
   * cluster, ahead of the account chip — today only the Load Board's
   * vehicle-capacity pill.
   *
   * Registered from below via `useHubVehiclePill()` rather than passed down
   * from a page, because the screens are client components mounted inside this
   * header's own subtree. `null`/absent (every screen but Loads) renders
   * nothing at all — not an empty box.
   */
  vehiclePill?: ReactNode;
};

export function DriverHubHeader({
  account,
  header,
  navItems,
  activeId,
  title,
  subtitle,
  vehiclePill,
}: DriverHubHeaderProps) {
  return (
    <>
      {/* One sticky box around the top bar and the phone's job strip, so the
          two travel together and the offset below has a single number to
          match. `bg-background` belongs here rather than only on the bar
          inside it: the job strip is a bordered link with no fill of its own,
          and page content would otherwise scroll through it. */}
      <div className="sticky top-0 z-30 bg-background">
        <DriverHubTopNav
          account={account}
          header={header}
          navItems={navItems}
          activeId={activeId}
        />
      </div>

      <header className="z-20 flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-4 lg:sticky lg:top-14 lg:gap-6 lg:px-8 lg:py-[22px]">
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

        {/* Wraps rather than overflows at 390px: the three controls below are a
            screen's working state, and a driver checking whether they are
            online should not have to scroll a bar sideways to find out. */}
        <div className="flex flex-wrap items-center justify-end gap-2 lg:flex-nowrap lg:gap-[18px]">
          {/* The screen's own slot, ahead of everything the shell owns: the
              design places the Load Board's vehicle pill between the flex
              spacer and the identity block, not inside it. */}
          {vehiclePill}

          <Badge
            variant="outline"
            className="h-auto rounded-full px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.02em] text-muted-foreground"
          >
            {ACCOUNT_PERSONA_LABELS[account.persona]}
          </Badge>

          {/* A company session has no availability to flip — `isOnline` is
              `null` for it, and the endpoint 403s a non-DRIVER outright — so
              the pill is absent rather than rendered in a permanently dead
              state.

              This stays a `!== null` test and must not become a persona test:
              it is what narrows `boolean | null` down to the `boolean`
              `HubOnlineToggle` requires, so swapping it for `persona !==
              "BUSINESS"` would be a type error dressed up as a refactor. */}
          {account.isOnline !== null ? (
            <HubOnlineToggle
              isOnline={account.isOnline}
              canToggleOnline={account.canToggleOnline}
            />
          ) : null}
        </div>
      </header>
    </>
  );
}
