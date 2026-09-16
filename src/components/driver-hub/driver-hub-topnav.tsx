"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSignOut } from "@/components/auth/use-sign-out";
import type {
  HubNavItem,
  HubNavItemId,
} from "@/components/driver-hub/driver-hub-nav";
import {
  DriverHubJobBar,
  DriverHubJobPill,
} from "@/components/driver-hub/driver-hub-job-pill";
import { DriverHubMobileMenu } from "@/components/driver-hub/driver-hub-mobile-menu";
import { DriverHubNotifications } from "@/components/driver-hub/driver-hub-notifications";
import { HubOnlineToggle } from "@/components/driver-hub/hub-online-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";
import type { HubHeaderData } from "@/lib/dashboard/hub/header";
import { cn } from "@/lib/utils";

/**
 * The hub's top bar — the client site header's vocabulary, applied to the
 * driver (`UI:UX/Registered Driver account (New)/Driver dashboard header
 * alignment/Driver Header.dc.html`).
 *
 * Wordmark and inline nav on the left; the active-job pill, the notification
 * bell, the theme toggle, who is signed in, My account and Sign out on the
 * right. Below `lg` the same bar collapses to the design's phone shape:
 * wordmark, a 44px bell, a 44px theme toggle, a hamburger, and the active job
 * as a full-width strip underneath.
 *
 * The theme toggle is the one control here the handoff does not draw. The hub
 * hides the global site header that carries the app's other one
 * (`body:has([data-admin-surface]) > header { display: none }` in
 * `globals.css`), so without a toggle in this bar the whole surface is a
 * one-way door: a driver who lands on `/dashboard` can never change the theme
 * back without leaving the hub. It is styled to the bell's vocabulary rather
 * than introduced as a new shape — see its mount point below.
 *
 * ## One bar, not two trees
 *
 * The desktop and phone layouts are the *same* row with per-breakpoint
 * visibility, rather than two separately-mounted trees picked by CSS (the
 * approach `loads-screen.tsx` takes for the board). The difference matters
 * here: the bell owns a portalled Popover, and a hidden second copy of it would
 * still render its panel into `document.body` the moment the shared open state
 * flipped. Mounting each interactive control exactly once removes that class of
 * bug rather than guarding against it. The active job is the one element that
 * genuinely differs — a dropdown on desktop, a plain link on a phone — and the
 * phone's variant carries no panel, so the pair is safe.
 *
 * ## Only one panel open at a time
 *
 * The prototype's `toggleJobs` closes the bell and `toggleBell` closes the jobs
 * list. Two independent Popovers *nearly* reproduce that through outside-press
 * dismissal, but a keyboard user can open both. So the open panel is a single
 * piece of state here and each surface is controlled — which also lets the
 * hamburger close whichever dropdown was open before the menu covers it.
 */

/** Where the design's wordmark points, and where My account goes. */
const HOME_HREF = "/dashboard";
const ACCOUNT_HREF = "/dashboard/account";

/**
 * Tailwind's `lg` breakpoint, as a media query — the width at which this header
 * swaps between its phone and desktop shapes.
 *
 * `1024px` is Tailwind v4's `--breakpoint-lg`, and this string **must track the
 * `lg:` classes in this file and in `driver-hub-mobile-menu.tsx`**: the
 * hamburger and the menu panel are `lg:hidden`, and the jobs pill is mounted
 * inside a `hidden lg:contents` wrapper. The effect below closes whichever
 * panel the viewport has just hidden, so a breakpoint that moved in the classes
 * but not here would leave those panels open behind a `display: none` trigger
 * again. There is no way to read a Tailwind breakpoint from JS in v4 — the
 * theme lives in CSS — so this is the one place the number is written down for
 * script, and it is named rather than inlined for exactly that reason.
 */
const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

/**
 * The two entries the design puts in the top bar's inline nav, in its order —
 * "My orders" then "Wallet", which is *not* `HUB_NAV`'s order.
 *
 * Ids rather than transcribed labels and hrefs: `driver-hub-nav.ts` owns both,
 * it has already been through one relabelling for this same handoff (Earnings →
 * "Wallet", pointing at `/dashboard/earnings` and never the client's `/wallet`),
 * and a second copy of those strings here is the copy that would be missed by
 * the next one. Resolving through the account's *filtered* nav also means a
 * ROSTER driver loses the Wallet link from this bar for free, exactly as they
 * already lose it from the rail — an employed driver's fares are their
 * employer's money, and the screen is withheld rather than relabelled.
 */
const TOP_NAV_IDS: readonly HubNavItemId[] = ["jobs", "earnings"];

/**
 * The chip's copy, one label per persona — moved here with the identity block
 * it belongs to, and still read by the page-title header's account chip.
 *
 * A lookup rather than something derived from the enum, so the three strings
 * are written out where a reviewer can read them, and so the two individual
 * shapes are visibly distinct. `HubAccountKind` cannot carry this: an
 * independent owner-driver and a driver on a company's roster are both
 * `kind: "INDIVIDUAL"`, and the chip that called both of them "Individual" was
 * the one place in the hub that stated the conflation out loud.
 *
 * "Company driver" rather than "Roster": `ROSTER` is this codebase's word for
 * the shape, not the driver's word for their own job.
 */
export const ACCOUNT_PERSONA_LABELS: Record<HubPersona, string> = {
  INDEPENDENT: "Independent",
  ROSTER: "Company driver",
  BUSINESS: "Business",
};

/** Which of the header's three mutually-exclusive panels is open. */
type OpenPanel = "jobs" | "notifications" | "menu" | null;

export type DriverHubTopNavProps = {
  account: HubAccount;
  /** Resolved once per request by `getHubHeader()` in the hub layout. */
  header: HubHeaderData;
  /** Already persona-filtered by the shell — the same list the rail draws. */
  navItems: readonly HubNavItem[];
  /** The entry the current pathname resolves to, if any. */
  activeId: HubNavItemId | undefined;
};

export function DriverHubTopNav({
  account,
  header,
  navItems,
  activeId,
}: DriverHubTopNavProps) {
  const pathname = usePathname();
  const { signOut, signingOut } = useSignOut();
  const [openPanel, setOpenPanel] = React.useState<OpenPanel>(null);

  // `/dashboard/account` is not a `HUB_NAV` entry — it has no rail link, page
  // title or subhead — so its active state is resolved here rather than by
  // `hubNavItemForPath()`.
  //
  // The account screen's own sections are **query-string states of this one
  // route**, not sub-paths: `?section=payout` and friends, resolved server-side
  // (see `driver-account-sections.ts` for why one route rather than five). So
  // the exact match is what marks the link current today, and the prefix match
  // matches nothing that currently exists. It is kept as forward-looking
  // defensive code — a later `/dashboard/account/<something>` route would
  // otherwise silently drop `aria-current` from this link — and it costs one
  // string comparison.
  const onAccount =
    pathname === ACCOUNT_HREF || pathname.startsWith(`${ACCOUNT_HREF}/`);

  // ## Closing a panel when the breakpoint that owns it disappears
  //
  // Two of the three panels only exist on one side of `lg`, and CSS only ever
  // *hides* them — hiding is not closing, and the difference is a bug on each
  // side of the boundary.
  //
  // The menu is the expensive case. It is a **modal** Radix Dialog, so
  // `DialogContentModal` passes `disableOutsidePointerEvents: context.open` and
  // `react-dismissable-layer` sets `document.body.style.pointerEvents = "none"`
  // for as long as that layer is mounted. Open the menu at 390px, cross to
  // 1024px (a window resize, a tablet rotation) and the panel and its scrim go
  // `display: none` while the body-level lock stays: the entire hub becomes
  // unclickable with nothing on screen to explain why. Verified in Chromium
  // against this component before the fix — after the resize `body.style
  // .pointerEvents` was still `"none"` and `elementFromPoint()` over the header's
  // "My account" link returned the blocking layer rather than the link. `Escape`
  // still dismisses it, so it is recoverable, but only by a user who guesses.
  //
  // The jobs Popover is the mild case, going the other way: it is non-modal so
  // there is no body lock, but shrinking below `lg` leaves its 330px panel
  // floating over a 390px header, anchored to a trigger that is now inside a
  // `display: none` wrapper.
  //
  // One effect for both, because it is one cause. `notifications` is
  // deliberately *not* closed: the bell is mounted at every width, so its panel
  // is still anchored to a visible trigger on the other side of the boundary and
  // has no reason to lose the user's place.
  React.useEffect(() => {
    // `matchMedia` does not exist on the server, and is absent from jsdom
    // without a polyfill. An effect body never runs during SSR, so this cannot
    // throw during hydration as written — the feature test is here so it still
    // cannot if this ever runs anywhere but a browser.
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const query = window.matchMedia(DESKTOP_MEDIA_QUERY);

    // Direction is not tested: `menu` can only be opened below `lg` and `jobs`
    // only from `lg`, so whichever of the two is open is by construction the one
    // the crossing just hid. No initial sync pass is needed either — `openPanel`
    // starts `null` and only a user gesture opens a panel, so there is nothing
    // to close before the first `change` fires.
    const handleBreakpointChange = () => {
      setOpenPanel((panel) =>
        panel === "menu" || panel === "jobs" ? null : panel,
      );
    };

    query.addEventListener("change", handleBreakpointChange);

    return () => {
      query.removeEventListener("change", handleBreakpointChange);
    };
  }, []);

  // One setter shape for all three panels: opening any of them closes the other
  // two, which is the prototype's behaviour and the reason the state is a
  // single union rather than three booleans that can all be true.
  const panelHandler = (panel: Exclude<OpenPanel, null>) => (open: boolean) => {
    setOpenPanel(open ? panel : null);
  };

  const topNavItems = TOP_NAV_IDS.flatMap((id) => {
    const item = navItems.find((candidate) => candidate.id === id);

    // `flatMap` over a filter+map so the absent case is expressed once: a
    // ROSTER driver has no Wallet entry in `navItems` at all, and that is a
    // link that must not appear rather than one that renders disabled.
    return item ? [item] : [];
  });

  return (
    <>
      {/* `py-3` is the design's 12px on both sides of the bar, at both
          breakpoints — on a phone it is what makes the row 68px around its 44px
          controls (the design's own figure), and at `lg` it is already spent
          inside the explicit 56px, which is that same 12px around a 32px bell.
          The height is stated there and inferred here because the desktop bar
          must not grow with its contents; the phone bar is sized *by* its
          44px targets. */}
      <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 lg:h-14 lg:gap-5 lg:px-6">
        <Link
          href={HOME_HREF}
          className="text-[16px] font-bold tracking-[-0.015em] whitespace-nowrap"
        >
          Lalamove Clone
        </Link>

        <nav
          aria-label="Driver"
          className="hidden items-center gap-4 text-sm lg:flex"
        >
          {topNavItems.map((item) => {
            const active = item.id === activeId;

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "font-medium whitespace-nowrap hover:text-foreground",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-1 lg:gap-3">
          {/* First in the right-hand cluster, ahead of the job pill, per the
              design.

              A company session has no availability to flip — `isOnline` is
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

          {/* `hidden lg:contents` rather than a wrapper box, so the pill stays a
              direct child of this flex row at desktop and inherits its gap
              instead of nesting a second one. */}
          <div className="hidden lg:contents">
            <DriverHubJobPill
              persona={header.persona}
              jobsInProgressCount={header.jobsInProgressCount}
              jobs={header.jobsInProgress}
              open={openPanel === "jobs"}
              onOpenChange={panelHandler("jobs")}
            />
          </div>

          {/* Sampled, and the only sampled thing in this bar — the panel says
              so with a `<SampleNote />`. See the component's own comment. */}
          <DriverHubNotifications
            count={header.sampled.notificationCount}
            notifications={header.sampled.notifications}
            open={openPanel === "notifications"}
            onOpenChange={panelHandler("notifications")}
          />

          {/* Mounted **once**, visible at both breakpoints, per this file's
              "one bar, not two trees" rule above. It has no panel of its own,
              so it could safely have been duplicated — but the rule exists so
              that no one has to check, and a second copy would be a second
              place to keep the styling in step.

              Placed immediately after the bell because the two are the same
              kind of thing: unlabelled icon buttons that act on the chrome
              rather than on the driver's data. Everything to the right of them
              is identity (name, My account, Sign out, or the hamburger that
              stands in for all three on a phone), and splitting that group
              would be the one arrangement the design does argue against.

              ## Why these classes

              `ThemeToggle`'s default look is a 36px bordered circle drawn for
              the global site header. The hub's icon-button vocabulary is the
              bell four lines up, so the toggle is restyled to it exactly
              rather than approximately: a borderless 10px-radius square,
              44×44 below `lg` (the design's own phone figure, and the WCAG 2.2
              "Target Size (Minimum)" floor) and 32×32 above it, where a
              pointer rather than a thumb is aiming. `cn()` merges through
              tailwind-merge, so `size-11` displaces the default `h-9 w-9`,
              `rounded-[10px]` the `rounded-full`, and `border-0` the `border`.

              `cursor-pointer` for the reason the Sign out button below states:
              Tailwind v4's preflight leaves `<button>` on the UA's `cursor:
              default`, and every other control in this row either asks for the
              pointer or is an anchor that gets it free.

              The hover is left as the toggle's own `hover:bg-secondary` rather
              than restated as the bell's `hover:bg-muted`. On this surface the
              two are the same colour in both themes — `globals.css` gives
              `--secondary` and `--muted` identical values in `:root` and in
              `html.dark` — so matching the bell visually costs nothing, and
              `secondary` is the name that cannot be captured by the landing
              palette's `--color-accent`/`--color-muted` fallback chain if this
              component is ever lifted somewhere that does not resolve
              `--admin-muted`. Only the hover foreground is overridden, because
              the toggle's default `secondary-foreground` is a shade off the
              bell's `foreground`. */}
          <ThemeToggle className="size-11 cursor-pointer rounded-[10px] border-0 hover:text-foreground lg:size-8 lg:rounded-lg" />

          <div className="hidden min-w-0 items-center gap-3 lg:flex">
            {/* The design's 1px rule between the bell and the identity. Pure
                decoration, so it is hidden from assistive tech rather than
                announced as a separator that separates nothing semantic. */}
            <span
              aria-hidden="true"
              className="h-[22px] w-px flex-none bg-border"
            />

            {/* The design's identity is this one unweighted 14px line — no
                avatar, no initials, no second line. `truncate` is the one
                addition: it carries the design's `white-space: nowrap` and, on
                a company name long enough to reach the bar's edge, clips it
                rather than pushing Sign out off the row. */}
            <span className="truncate text-sm">{account.displayName}</span>

            <Link
              href={ACCOUNT_HREF}
              aria-current={onAccount ? "page" : undefined}
              className={cn(
                "text-sm font-medium whitespace-nowrap hover:text-foreground",
                onAccount ? "text-foreground" : "text-muted-foreground",
              )}
            >
              My account
            </Link>

            {/* The hub's only way out, and the reason it has to live in the
                shell: the shell's root carries `data-admin-surface`, and
                `globals.css` hides the global site header
                (`body:has([data-admin-surface]) > header`) for the whole
                surface. That header is `AuthStatus`, which owns the app's other
                sign out — so without this control a signed-in driver or company
                user browsing the hub has no way to sign out at all.

                Outline, per the design, where the old header used ghost. The
                availability pill now sits four elements to the left in this
                same row, so the two borders do share a bar — but they read as
                different things: the pill is a filled, rounded state you flip
                all day, this is a square-cornered outline you press once. The
                design draws them exactly that way.
                `useSignOut()` owns the Better Auth call and the navigation that
                follows it, so nothing is routed from here.

                `size="sm"` is the only size that carries the design's 6px
                radius — its `min(var(--radius-md), 12px)` resolves to
                Tailwind's 6px `md`, where every other size rounds to the base
                8px `lg` — and it already sets the design's 10px sides. It
                undershoots on the two axes left: it is a 28px pill at 0.8rem,
                against 14px text in a 32px box. So those two are restated
                here, and the variant is kept for the radius.

                `cursor-pointer` because Tailwind v4's preflight leaves
                `<button>` on the UA's `cursor: default`; the anchors beside it
                take the pointer from the UA stylesheet, so this is the one
                control in the bar that has to ask for it. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void signOut();
              }}
              disabled={signingOut}
              className="h-8 flex-none cursor-pointer text-sm"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>

          <DriverHubMobileMenu
            navItems={navItems}
            activeId={activeId}
            onAccount={onAccount}
            displayName={account.displayName}
            accountKindLabel={ACCOUNT_PERSONA_LABELS[account.persona]}
            open={openPanel === "menu"}
            onOpenChange={panelHandler("menu")}
          />
        </div>
      </div>

      {/* The phone's active-job strip, under the bar exactly as the design
          draws it. Hidden from `lg`, where the pill above carries the same
          jobs with a dropdown behind them. */}
      <DriverHubJobBar
        persona={header.persona}
        jobsInProgressCount={header.jobsInProgressCount}
        jobs={header.jobsInProgress}
      />
    </>
  );
}
