"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import {
  DriverHubHeader,
  DriverHubPageHead,
} from "@/components/driver-hub/driver-hub-header";
import { DriverHubSidebar } from "@/components/driver-hub/driver-hub-sidebar";
import {
  hubNavForAccount,
  hubNavItemForPath,
} from "@/components/driver-hub/driver-hub-nav";
import type { HubAccount } from "@/lib/dashboard/hub/account";
import type { HubHeaderData } from "@/lib/dashboard/hub/header";

/**
 * The driver hub's frame: a full-bleed sticky top bar, a 248px rail beneath it,
 * and the page body every screen renders into.
 *
 * The order of those three is the design's and is load-bearing. The bar is the
 * page's **first child**, so it spans the viewport and its wordmark starts at
 * the window's own left edge; the rail and the page body are a flex row *below*
 * it. Built the other way round — rail first, bar inside the column beside it —
 * the bar begins 248px in and its left edge is the rail's border rather than
 * the screen, which is the single largest departure the hub had from the
 * handoff.
 *
 * Desktop-first, but no longer desktop-only. Below `lg` the rail is dropped
 * from the layout and its links move into the top bar's menu, and the body's
 * gutters halve — enough that the hub does not overflow the 390px width the
 * header handoff designs for. The screens' own tables still have their own
 * narrow-width work to do; this is the shell, not a responsive pass over all
 * six of them.
 *
 * Mirrors `src/components/admin/admin-shell.tsx` — a server layout resolves the
 * signed-in account once and hands it to one client shell, which owns the
 * chrome and derives the active nav entry from `usePathname()`. Nothing here
 * fetches: the account is already plain serialisable data by the time it
 * crosses this boundary.
 *
 * `data-admin-surface` on the root is load-bearing three times over (see the
 * `body:has([data-admin-surface])` block in `globals.css`): it pins this
 * surface to the light scheme the `src/components/ui` primitives are toned
 * for, resolves the `accent`/`muted` token collision between the shadcn and
 * landing palettes, and hides the global site header — which would otherwise
 * stack a second navbar above this one. `font-body` opts the subtree into IBM
 * Plex Sans, which is a variable rather than a `body` default in this project.
 *
 * Radix **portalled** content (SelectContent, DialogContent, PopoverContent,
 * DropdownMenuContent) renders outside this subtree and therefore outside the
 * attribute, so every such element must repeat `data-admin-surface=""` on
 * itself — see `src/components/fleet-onboarding/steps/step-4-drivers-assignment.tsx`
 * for the precedent.
 */

/* -------------------------------------------------------------------------- */
/* Header overrides                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The pieces of the sticky header a screen may override from below it.
 *
 * One context carrying both overrides rather than two nested providers: they
 * describe the same bar, they are set by the same kind of mount-time effect,
 * and a second provider around the same children would buy nothing but another
 * layer to read past. Named `HubHeaderContextValue` (it was
 * `HubSubtitleContextValue`) now that it carries more than the subtitle —
 * `useHubSubtitle`'s exported name and behaviour are unchanged, so no caller
 * moved.
 */
type HubHeaderContextValue = {
  /** `null` restores the active nav item's static title. */
  setTitle: (title: string | null) => void;
  /** `null` restores the active nav item's static subtitle. */
  setSubtitle: (subtitle: string | null) => void;
  /** `null` hides the vehicle pill — the default for every screen but Loads. */
  setVehiclePill: (pill: React.ReactNode | null) => void;
};

const HubHeaderContext = React.createContext<HubHeaderContextValue | null>(
  null,
);

/**
 * Lets a screen replace the header's **page title**.
 *
 * `driver-hub-nav.ts` carries one title per registered nav entry, and
 * `hubNavItemForPath` resolves a path to the longest matching entry — which is
 * exactly right for the six top-level screens and exactly wrong for the first
 * nested one. `/dashboard/jobs/[id]` prefix-matches the Jobs entry and would
 * inherit its title, so a driver opening a single delivery's job sheet would be
 * told they are looking at "Job history".
 *
 * The alternative was a seventh `HUB_NAV` entry, and it is worse: every entry
 * in that list is a **sidebar link**, so registering the job sheet there would
 * put a rail item pointing at a route that needs an order id to exist. The nav
 * list is the hub's information architecture; a detail view is not part of it.
 * So the screen retitles the bar from below, exactly as five of the six screens
 * already replace the subhead from below.
 *
 * ```tsx
 * // inside a "use client" screen rendered under <DriverHubShell>
 * useHubTitle("Job sheet");
 * ```
 *
 * Same mechanics, and the same reasoning, as `useHubSubtitle` below: registered
 * in an effect rather than during render, `null` to keep the nav entry's static
 * title, and cleared on unmount so navigating from the job sheet back to the job
 * list cannot leave "Job sheet" up over a table of every job.
 */
export function useHubTitle(title: string | null): void {
  const context = React.useContext(HubHeaderContext);

  if (context === null) {
    throw new Error(
      "useHubTitle must be called inside <DriverHubShell> — it retitles the " +
        "hub header, which only exists under src/app/dashboard/(hub).",
    );
  }

  const { setTitle } = context;

  React.useEffect(() => {
    setTitle(title);

    return () => {
      setTitle(null);
    };
  }, [setTitle, title]);
}

/**
 * Lets a screen replace the header's subhead with one derived from its data.
 *
 * Five of the six subheads are runtime values — Performance's chosen range and
 * the counts on Jobs, Vehicles, Drivers and Employees — while
 * `driver-hub-nav.ts` can only carry a static literal, which is what renders
 * before a screen's data resolves. A screen therefore *calls this hook* with
 * its own string rather than reaching into the header:
 *
 * ```tsx
 * // inside a "use client" screen rendered under <DriverHubShell>
 * useHubSubtitle(`${jobs.length} jobs in the last 30 days`);
 * ```
 *
 * Pass `null` while the value is still unknown and the static fallback stays
 * up. The override is registered in an effect, never during render — writing to
 * a parent's state mid-render is the classic "cannot update a component while
 * rendering a different component" warning — and it is cleared on unmount, so
 * navigating to a screen that sets no subtitle cannot inherit the previous
 * one's. React runs an unmounting subtree's cleanups before the entering
 * subtree's effects within the same commit, so the clear can never land after
 * the next screen's set.
 *
 * Only callable inside the shell; a screen outside it has no header to retitle.
 */
export function useHubSubtitle(subtitle: string | null): void {
  const context = React.useContext(HubHeaderContext);

  if (context === null) {
    throw new Error(
      "useHubSubtitle must be called inside <DriverHubShell> — it retitles " +
        "the hub header, which only exists under src/app/dashboard/(hub).",
    );
  }

  const { setSubtitle } = context;

  React.useEffect(() => {
    setSubtitle(subtitle);

    return () => {
      setSubtitle(null);
    };
  }, [setSubtitle, subtitle]);
}

/**
 * Lets a screen render extra content in the header's right-hand row, between
 * the title/spacer and the account chip — today only the load board's
 * vehicle-capacity pill (design §1 of
 * `specs/driver-load-board/tasks/task-09-board-shell.md`).
 *
 * The same registration pattern, and the same reasoning, as `useHubSubtitle`
 * above: set in an effect rather than during render, cleared on unmount, so
 * navigating away from Loads cannot leave a stale pill up on the next screen.
 *
 * **Pass a memoised node, or `null`.** The effect's dependency is the node
 * itself, and JSX constructed inline during render is a fresh object every
 * time — an un-memoised pill would re-register on every render of the calling
 * screen, which is a wasted state write per keystroke in the filter panel. The
 * one caller (`loads-screen.tsx`) wraps its pill in `React.useMemo`.
 */
export function useHubVehiclePill(pill: React.ReactNode | null): void {
  const context = React.useContext(HubHeaderContext);

  if (context === null) {
    throw new Error(
      "useHubVehiclePill must be called inside <DriverHubShell> — it fills a " +
        "slot in the hub header, which only exists under src/app/dashboard/(hub).",
    );
  }

  const { setVehiclePill } = context;

  React.useEffect(() => {
    setVehiclePill(pill);

    return () => {
      setVehiclePill(null);
    };
  }, [setVehiclePill, pill]);
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export type DriverHubShellProps = {
  /** Resolved once by `(hub)/layout.tsx` via `resolveHubAccount()`. */
  account: HubAccount;
  /**
   * Everything the top bar renders — the active-job pill and the (sampled)
   * notification surface — resolved once by `(hub)/layout.tsx` via
   * `getHubHeader()`.
   *
   * Threaded through the shell rather than fetched by the header, for the same
   * reason `account` is: `getHubHeader()` is `server-only` and this is a
   * `"use client"` boundary. Nothing under here fetches; the object arriving
   * from the layout is already plain serialisable data.
   */
  header: HubHeaderData;
  children: React.ReactNode;
};

/**
 * What the header shows on a path that matches no nav entry. Unreachable from
 * inside the `(hub)` route group — every child of this shell is one of the
 * six registered screens — but a title is cheaper than a crash if a future
 * route lands here before it registers itself in `HUB_NAV`.
 */
const FALLBACK_TITLE = "Driver Hub";

export function DriverHubShell({
  account,
  header,
  children,
}: DriverHubShellProps) {
  const pathname = usePathname();
  const [titleOverride, setTitleOverride] = React.useState<string | null>(null);
  const [subtitleOverride, setSubtitleOverride] = React.useState<string | null>(
    null,
  );
  const [vehiclePillOverride, setVehiclePillOverride] =
    React.useState<React.ReactNode | null>(null);

  // `useState`'s setters are referentially stable, so the context value only
  // has to be memoised against itself — it never changes, and every screen's
  // registration effect therefore runs once rather than on each shell
  // re-render.
  const headerContext = React.useMemo<HubHeaderContextValue>(
    () => ({
      setTitle: setTitleOverride,
      setSubtitle: setSubtitleOverride,
      setVehiclePill: setVehiclePillOverride,
    }),
    [],
  );

  // Nav filtering is cosmetic — hiding a link does nothing about a hand-typed
  // URL, so every screen withheld from a persona re-derives its own rule
  // server-side. Drivers and Employees are the only two left that are:
  // `drivers/page.tsx` and `employees/page.tsx` each guard on
  // `kind !== "BUSINESS"`. Nothing is withheld from a roster driver any more —
  // the board dropped its redirect when an employed driver gained the open
  // market, and the Wallet that used to be hidden from them has been folded
  // into Performance, which every persona sees.
  const items = hubNavForAccount(account);
  const activeItem = hubNavItemForPath(pathname);

  return (
    <div
      data-admin-surface
      // Marks the hub specifically, where `data-admin-surface` also covers the
      // back office, the admin sign-in card and the onboarding wizard. Two
      // tokens from this screen's handoff hang off it in `globals.css` so they
      // reach the hub without repainting those three.
      data-hub-surface
      // The page surface is the design's grey (`BG`), not white: the artboard
      // paints the body `oklch(96.7% 0.003 264.542)` and gives the header, the
      // rail and every card `#fff` on top of it. Written as the literal rather
      // than a token because `--background` is what those three white surfaces
      // resolve to — re-pinning it would turn them grey too.
      //
      // In dark mode that relationship inverts, so the literal cannot simply
      // carry over: a near-white page behind dark cards is the single loudest
      // thing that would break on this surface. `dark:bg-background` is the
      // counterpart rather than a second literal, because the token already
      // holds exactly the value wanted. `globals.css` gives the hub
      // `--background: oklch(0.145 0 0)` in dark (via `html.dark
      // body:has([data-admin-surface])`) against a `--card` of `oklch(0.205 0
      // 0)` — so the page sits one step *below* the header, the rail and the
      // cards, which is the same "chrome floats on the ground" reading the
      // light artboard gets from grey-behind-white, expressed the only way a
      // dark theme can express it.
      className="flex min-h-screen flex-col bg-[oklch(96.7%_0.003_264.542)] font-body text-foreground dark:bg-background"
    >
      <DriverHubHeader
        account={account}
        header={header}
        navItems={items}
        activeId={activeItem?.id}
      />

      <div className="flex min-w-0 flex-1">
        {/* The rail is a hard `w-[248px] flex-none` and there is no phone design
            for it, so below `lg` it is removed from the layout entirely and its
            links are reached through the top bar's menu instead (see
            `driver-hub-mobile-menu.tsx`, which renders the same
            `hubNavForAccount()` list). `hidden lg:contents` rather than classes
            on the rail itself: `display: contents` leaves the `<aside>` a direct
            flex child of this row at desktop, so the sticky offset it pins
            itself with is measured against this row and not a wrapper.
            Rebuilding the rail as a drawer is a separate piece of work. */}
        <div className="hidden lg:contents">
          <DriverHubSidebar
            items={items}
            activeId={activeItem?.id}
            persona={account.persona}
          />
        </div>

        {/* Page body: 28px 32px 56px on desktop, one content column, sections
            stacked with a 20px gap — so a screen returns its sections as
            siblings and never restates the page's own spacing. The page head
            is the column's first sibling and takes its 20px bottom margin from
            that same gap. The insets halve below `lg`: at 390px a 32px gutter
            each side leaves 326px of content, and the screens' own tables and
            cards are the first thing to overflow when it does. */}
        <main className="min-w-0 flex-1 px-4 pt-5 pb-10 lg:px-8 lg:pt-7 lg:pb-14">
          {/* THE HUB-WIDE CONTENT CAP. One number for every screen in here,
              deliberately — there is no per-screen override and adding one
              would be a mechanism with a single possible value.

              1800px, up from the 1180px this shipped with. 1180 is a
              *readable-prose* measure: it is the right cap for the landing
              page, the auth cards and the two onboarding wizards, which are
              columns of text and form fields and which all keep it. It is the
              wrong cap for everything under this shell, because every screen
              in the hub is a *data* screen — the load board, the job history,
              the vehicle and driver rosters, the performance tables. On those,
              width is not decoration: it is what lets a driver compare rows
              without dragging a horizontal scrollbar.

              What the old number cost, concretely: on a 1920px window the page
              body has 1920 − 248 (the rail) − 64 (this element's `lg:px-8`
              gutters) = 1608px to give. Capping at 1180 threw 428px of that
              away and left it blank to the right of a load board that was
              itself scrolling sideways — empty screen beside clipped columns,
              which is the complaint this replaces.

              Capped rather than dropped. `max-w-none` would stretch the load
              board's thirteen columns across the full width of a 3440px
              ultrawide and put a load's price a head-turn from its pick-up
              address; past roughly 1800px a table stops gaining from the extra
              room and starts losing to eye travel. So the gutter left on a
              very wide monitor is a decision, not a leftover.

              Note for anyone re-tuning this: it does NOT follow that a table
              now fits at every width for free. `loads-table.tsx` documents the
              arithmetic and pays for it — all thirteen of its columns need more
              than a 1280px or 1440px laptop can give inside a 248px rail, so
              below a 1760px window it drops three of them, and it keeps its
              `overflow-x-auto` as a backstop below 1270px. Anything added to
              this element's padding, or to the rail's width, comes straight off
              that board's container: the conversion it reasons with is
              `container = viewport − 248 − 64 − 2`. */}
          <div className="flex min-w-0 max-w-[1800px] flex-col gap-5">
            <DriverHubPageHead
              title={titleOverride ?? activeItem?.title ?? FALLBACK_TITLE}
              subtitle={subtitleOverride ?? activeItem?.subtitle ?? ""}
              vehiclePill={vehiclePillOverride}
            />

            <HubHeaderContext.Provider value={headerContext}>
              {children}
            </HubHeaderContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}
