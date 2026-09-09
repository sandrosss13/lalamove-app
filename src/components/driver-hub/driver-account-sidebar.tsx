"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { useSignOut } from "@/components/auth/use-sign-out";
import {
  DEFAULT_DRIVER_ACCOUNT_SECTION,
  DRIVER_ACCOUNT_SECTION_PARAM,
  type DriverAccountSection,
  type DriverAccountSectionId,
} from "@/components/driver-hub/driver-account-sections";
import { cn } from "@/lib/utils";

/**
 * The account screen's left rail: the section nav from the design, plus the way
 * out pinned to the bottom of it.
 *
 * Modelled on `src/components/account-sidebar.tsx` — the client's equivalent —
 * and deliberately not an import of it. Three things differ, and each of them
 * is load-bearing rather than cosmetic:
 *
 * - **Its rows are sections, not routes.** The client rail links to `/account`
 *   and `/orders`; this one links to `?section=` states of a single route (see
 *   `driver-account-sections.ts` for why), so `usePathname()` cannot decide
 *   which row is current and the active section arrives as a prop instead.
 * - **Its rows are filtered by persona.** A roster driver has no payout
 *   account, so that row is absent for them. The client rail has no such axis.
 * - **It is painted in the hub's tokens, not the landing palette.** Inside
 *   `[data-admin-surface]` (see `driver-hub-shell.tsx`) `--color-accent`
 *   resolves to the shadcn neutral rather than the brand orange, so the client
 *   rail's `text-accent` active state would render as near-white on white. The
 *   active row therefore uses the hub sidebar's own idiom — `bg-muted` plus a
 *   weight change — which is what every other rail in this shell already does.
 *
 * What *is* reused is the part that matters most: `useSignOut`, unchanged. It
 * owns the destination and the in-flight flag, so this button cannot drift from
 * the site header's, the landing pill's, or the client rail's.
 *
 * A client component for that one reason — signing out is a browser-side Better
 * Auth call. The rail's links are plain `<Link>`s and need nothing from the
 * client.
 */

/**
 * How far down the viewport the rail pins itself once the page scrolls, at `lg`
 * and above — the combined height of the hub's two-tier sticky header.
 *
 * **Measured, not computed.** The previous value here was a hand-worked `112px`
 * (`h-14` + a guessed 56px title bar) and it was 26.5px short. Rendered in
 * Chromium at 1024, 1280 and 1440 against `DriverHubShell` with this rail
 * mounted, the two tiers are:
 *
 * - top bar — `56px`, i.e. `driver-hub-topnav.tsx`'s `lg:h-14`, exactly.
 * - page-title bar — `82.5px`: `lg:py-[22px]` top and bottom (44), a 1px
 *   `border-b`, and **37.5px of content**.
 *
 * That 37.5px is the part a hand calculation gets wrong, and not for the reason
 * you would guess. It is not set by the `lg:text-[20px]` `<h1>`, which resolves
 * to a 30px line box; it is set by the taller of the right-hand cluster's
 * controls — `HubOnlineToggle`, at 37.5px. So the bar does not shrink on this
 * screen just because `/dashboard/account` has no subhead (it has no `HUB_NAV`
 * entry, so `driver-hub-header.tsx` renders the fallback title and an empty
 * subtitle): the availability pill holds the height up on its own.
 *
 * `140px` rather than the measured `138.5px` is a deliberate 1.5px
 * over-measure. The two errors are not symmetrical — over-measuring leaves a
 * hairline gap under the header, under-measuring slides the rail's "Account"
 * label under a `z-20` bar — so the rounding goes up, and lands on a whole
 * even pixel while it is there.
 *
 * Re-measure if the title bar's right-hand cluster grows, or if
 * `/dashboard/account` ever gains a `HUB_NAV` entry with a subhead: a subtitle
 * line adds roughly 21px to the bar and this number would then be short again.
 *
 * **Known, and out of scope here:** the `lg:sticky` below currently never
 * engages at all. This `<aside>` is a flex item with the default
 * `align-self: stretch`, so it is sized to its flex parent's full height — the
 * measurement showed the rail and its parent both at 4048px — which leaves a
 * sticky box exactly zero slack to move within its containing block. The rail
 * scrolls away with the page today whatever this offset says. Fixing that means
 * `self-start`, which would also drop the `lg:mt-auto` that pins Log out to the
 * bottom of the rail, and that is a layout decision for the account screen's
 * owner rather than a side effect of correcting a number.
 */
const STICKY_TOP_CLASS = "lg:top-[140px]";

const SECTION_LABEL_CLASSES =
  "px-3 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase";

export type DriverAccountSidebarProps = {
  /** The rows this account may see, already filtered by persona. */
  sections: readonly DriverAccountSection[];
  /** The row to mark current, resolved server-side from `?section=`. */
  activeSection: DriverAccountSectionId;
};

/**
 * The href for a section: the default one is the bare route, so
 * `/dashboard/account` and `/dashboard/account?section=profile` do not become
 * two URLs for one screen (and so the rail's first row matches the link the
 * header will eventually point at).
 */
function sectionHref(id: DriverAccountSectionId): string {
  return id === DEFAULT_DRIVER_ACCOUNT_SECTION
    ? "/dashboard/account"
    : `/dashboard/account?${DRIVER_ACCOUNT_SECTION_PARAM}=${id}`;
}

export function DriverAccountSidebar({
  sections,
  activeSection,
}: DriverAccountSidebarProps) {
  const { signOut, signingOut } = useSignOut();

  return (
    <aside className={cn("lg:sticky lg:w-56 lg:shrink-0", STICKY_TOP_CLASS)}>
      <div className="flex h-full flex-col">
        <p className={SECTION_LABEL_CLASSES}>Account</p>

        <nav
          aria-label="Account settings"
          className="mt-3 flex flex-col gap-0.5"
        >
          {sections.map((section) => {
            const active = section.id === activeSection;

            return (
              <Link
                key={section.id}
                href={sectionHref(section.id)}
                // `aria-current` is what tells assistive tech which panel is
                // open; the weight and background change is the sighted half
                // of the same signal. Same pairing as `driver-hub-sidebar.tsx`.
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-[9px] text-sm",
                  active
                    ? "bg-muted font-semibold text-foreground"
                    : "bg-transparent font-normal text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>

        {/* Not a section: signing out is an action, so it is a button rather
            than a sixth row that looks like a destination. `mt-auto` only bites
            once the rail has a height to push against — on a narrow viewport it
            is a plain block that follows the nav. */}
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="mt-8 inline-flex items-center gap-2 self-start rounded-lg px-3 py-[9px] text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 lg:mt-auto"
        >
          <LogOut aria-hidden="true" className="size-4" />
          {signingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </aside>
  );
}
