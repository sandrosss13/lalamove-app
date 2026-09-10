"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { useSignOut } from "@/components/auth/use-sign-out";
import type {
  HubNavItem,
  HubNavItemId,
} from "@/components/driver-hub/driver-hub-nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The phone's navigation: a hamburger in the top bar, and the full-screen menu
 * behind it.
 *
 * ## Why this lists more than the design's three links
 *
 * The handoff's menu shows My orders, Wallet and My account, because the
 * prototype has no left rail to account for. This app does:
 * `driver-hub-sidebar.tsx` is a hard `w-[248px] flex-none` and the shell hides
 * it below `lg` (see `driver-hub-shell.tsx`), so on a phone this menu is the
 * *only* route to Today, the Load Board, Performance, Vehicles, Drivers and
 * Employees. Shipping the three literal links would leave a driver on a phone
 * unable to reach six of the eight screens they can reach on a laptop. The list
 * is therefore the same persona-filtered `hubNavForAccount()` output the rail
 * draws, in the same order, with My account appended where the design puts it.
 *
 * Rebuilding the rail itself into a drawer is explicitly out of scope; this is
 * the cheap correct thing instead.
 *
 * ## Accessibility comes from the primitive, not from us
 *
 * `Sheet` is this project's copy of the shadcn sheet, which is Radix's
 * **Dialog** underneath. Modal (the default) is what the menu wants and what
 * the design draws — a full-screen overlay — so it is left modal, and that one
 * decision is what supplies the focus trap, the `Escape` handler, the outside
 * press, `aria-modal`, `aria-expanded`/`aria-controls` on the hamburger, and
 * focus returning to the hamburger on close. Every one of those is a
 * requirement of this task, and every one of them is a thing a hand-rolled
 * overlay gets subtly wrong.
 *
 * ## What modal does *not* buy here: the body-scroll lock
 *
 * This list used to end "…and the scroll lock behind the panel". It does not.
 * `@radix-ui/react-dialog` mounts `RemoveScroll` in exactly one place —
 * `DialogOverlayImpl`, reachable only through `<Dialog.Overlay>` — and
 * `sheet.tsx`'s `SheetContent` deliberately paints a plain `<div>` scrim
 * instead of `SheetPrimitive.Overlay` (read that file's doc comment: Radix
 * renders `Overlay` as literal `null` under `modal={false}`, which the load
 * board's non-modal sheet needs). No `RemoveScroll` therefore ever mounts under
 * this menu, and the page behind it can still be scrolled. Confirmed in the
 * package source and in Chromium.
 *
 * That is **known and accepted**, not an oversight:
 *
 * - Below `sm` — the phone this menu is drawn for — the panel is
 *   `data-[side=right]:w-full`, so nothing behind it is visible and a stray
 *   scroll moves nothing the user can see. The band where it is actually
 *   noticeable is `sm`–`lg`, where the primitive's `max-w-sm` takes over and
 *   the page shows beside the scrim.
 * - The one gesture that would surprise someone — flinging the menu's own list
 *   and having the page take over at the end of it — is closed off locally by
 *   `overscroll-contain` on the `<nav>` below. What is left is a deliberate
 *   drag on the scrim.
 * - The real fix is `RemoveScroll`, and it belongs in `sheet.tsx`, which
 *   exports `SheetOverlay` for precisely this future modal consumer. Hand
 *   rolling `body { overflow: hidden }` here would not be the same thing: it
 *   does not compensate for the scrollbar width (so the whole hub would jump
 *   sideways every time the menu opened), does not handle iOS touch scrolling,
 *   and has no nesting discipline against any other lock that happens to be
 *   mounted. `sheet.tsx` is a shared primitive with a non-modal consumer whose
 *   behaviour must not regress, so that is a change to make there, deliberately,
 *   and not a side effect of a menu.
 */

/** Where the design's "My account" goes. */
const ACCOUNT_HREF = "/dashboard/account";

export type DriverHubMobileMenuProps = {
  /** Already persona-filtered by the shell — the same list the rail draws. */
  navItems: readonly HubNavItem[];
  /** The entry the current pathname resolves to, if any. */
  activeId: HubNavItemId | undefined;
  /** Whether `/dashboard/account` is the screen currently open. */
  onAccount: boolean;
  /** The driver's or company's name, for the footer. */
  displayName: string;
  /** The design's `accountKind` line: "Independent", "Company driver", … */
  accountKindLabel: string;
  /** Whether the menu is the one panel the header currently has open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DriverHubMobileMenu({
  navItems,
  activeId,
  onAccount,
  displayName,
  accountKindLabel,
  open,
  onOpenChange,
}: DriverHubMobileMenuProps) {
  const { signOut, signingOut } = useSignOut();

  // Every link closes the menu on the way out. Without this the panel survives
  // the client-side navigation it started and covers the screen it asked for —
  // the App Router keeps the whole shell mounted across a route change, so
  // nothing unmounts this on its own.
  const close = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        type="button"
        aria-label="Menu"
        // 44×44, the design's own figure and the WCAG 2.2 target-size floor.
        className="grid size-11 flex-none place-items-center rounded-[10px] transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:hidden"
      >
        <MenuGlyph />
      </SheetTrigger>

      {/* Portalled to `document.body`, outside `DriverHubShell`'s attributed
          root, so it repeats `data-admin-surface` or every token in it resolves
          to the marketing palette. Same precedent as `loads-detail-sheet.tsx`.

          Full-bleed on a phone rather than the primitive's three-quarter-width
          drawer: the design's menu replaces the screen, and at 390px a `w-3/4`
          panel leaves a 98px strip of dead page beside a 16px-inset list. The
          override has to be written as `data-[side=right]:w-full` and not
          `w-full` — the primitive's own width is a `data-[side=right]:`
          variant, which outranks an unqualified utility on specificity no
          matter what order `cn()` puts them in, and a plain `w-full` here is
          silently ignored. From `sm` the primitive's `max-w-sm` takes over
          again and it reads as a 384px drawer, which is the right shape on a
          tablet-width viewport that still has no rail.

          `lg:hidden` on both the panel and its scrim, and **kept** now that
          `driver-hub-topnav.tsx` closes this menu on the `lg` crossing.

          The close is the real fix — hiding a modal Radix Dialog does nothing
          about the `pointer-events: none` it has put on `<body>`, which is the
          bug that made the whole hub unclickable after a resize. But these two
          classes are not redundant with it, because closing is not instant:
          Radix's `Presence` keeps the panel mounted through its exit animation.
          Measured in Chromium with the classes stripped at runtime, the
          full-height 384px panel stays `display: flex` and fades from opacity 1
          to 0 across ~205ms *after* the viewport has already passed 1024px,
          sliding out over a desktop layout it has no business being on top of.
          `lg:hidden` removes that frame-one flash and every frame after it, so
          it stays as the paint-level half of the pair. Both are needed: without
          the close the page locks up, and without these the close is visible. */}
      <SheetContent
        data-admin-surface=""
        side="right"
        overlayClassName="lg:hidden"
        className="flex flex-col gap-0 p-0 data-[side=right]:w-full lg:hidden"
        // Radix warns when a dialog carries no description. A navigation menu
        // has no summarising sentence worth inventing, so the warning is
        // answered by opting out rather than by writing prose no one needs.
        aria-describedby={undefined}
        showCloseButton={false}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          {/* The dialog's accessible name says what the dialog *is*. The
              wordmark beside it is the design's visible content and is a poor
              name for a menu, so the two are separate: an `sr-only` title, and
              an `aria-hidden`-free but unnamed brand line. */}
          <SheetTitle className="sr-only">Driver menu</SheetTitle>
          <span className="text-[15px] font-bold tracking-[-0.01em]">
            Lalamove Clone
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close menu"
            onClick={close}
            className="size-11 rounded-[10px]"
          >
            {/* The primitive's own ✕ is suppressed above and replaced here for
                one reason: `showCloseButton` renders a 28px `icon-sm` button,
                and this header's controls are 44px. */}
            <XGlyph />
          </Button>
        </div>

        {/* `overscroll-contain` because nothing else stops the chain: this
            sheet mounts no `RemoveScroll` (see this file's doc comment), so
            without it a fling that reaches the end of the menu's own list hands
            the momentum to the page behind the panel. This closes the common
            gesture; the residual scroll-through is documented above. */}
        <nav
          aria-label="Driver menu"
          className="flex flex-col gap-0.5 overflow-y-auto overscroll-contain p-2 pb-4"
        >
          {navItems.map((item) => {
            const active = item.id === activeId;

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={close}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-[10px] px-3 py-3.5 text-[16px] active:bg-accent",
                  active ? "bg-muted font-semibold" : "font-medium",
                )}
              >
                {item.label}
              </Link>
            );
          })}

          {/* Appended rather than folded into `HUB_NAV`: the account screen is
              not a hub *screen* — it has no rail entry, no page title and no
              subhead, and it is reached from the header on every breakpoint. */}
          <Link
            href={ACCOUNT_HREF}
            onClick={close}
            aria-current={onAccount ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-[10px] px-3 py-3.5 text-[16px] active:bg-accent",
              onAccount ? "bg-muted font-semibold" : "font-medium",
            )}
          >
            My account
          </Link>
        </nav>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border px-3 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium">{displayName}</p>
            <p className="truncate font-price text-[11px] text-muted-foreground">
              {accountKindLabel}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void signOut();
            }}
            disabled={signingOut}
            className="h-9 flex-none"
          >
            <LogOut aria-hidden="true" data-icon="inline-start" />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The hamburger, drawn rather than imported, for the reason `XGlyph` below is.
 *
 * `lucide-react`'s `Menu` is three strokes too, but it rules them at 5/12/19
 * against the design's 4/7 · 4/12 · 4/17 — a wider, differently-spaced set —
 * and at lucide's stroke width of 2 against the design's 1.9. Both differences
 * show at the 20px this trigger draws it, and the second of them would put the
 * hamburger a notch heavier than the ✕ it swaps places with.
 */
function MenuGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      // The design's 20px, stated rather than inherited: this trigger is a bare
      // `SheetTrigger` and not a `Button`, so nothing sizes an svg for it.
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

/**
 * The close glyph, drawn rather than imported.
 *
 * `lucide-react`'s `X` is the same two strokes, but the design specifies a 1.9
 * stroke width against lucide's 2, and this is one of the header's two 20px
 * icons — the hamburger above is the other — where that difference is visible
 * next to the 1.8-weight bell. Kept file-local: it is a detail of this panel,
 * not a shared icon.
 */
function XGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      // An explicit `size-5` rather than the `Button` base style's `size-4`
      // default, which only applies to an svg carrying no size class of its
      // own — this opts out of it deliberately.
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}
