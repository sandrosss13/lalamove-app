"use client";

import { LogOut } from "lucide-react";

import { useSignOut } from "@/components/auth/use-sign-out";
import { HubOnlineToggle } from "@/components/driver-hub/hub-online-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HubAccount, HubAccountKind } from "@/lib/dashboard/hub/account";

/**
 * The chip's copy. A lookup rather than a `toLowerCase()` so the two words are
 * written out where a reviewer can read them, not derived from an enum.
 */
const ACCOUNT_KIND_LABELS: Record<HubAccountKind, string> = {
  BUSINESS: "Business",
  INDIVIDUAL: "Individual",
};

export type DriverHubHeaderProps = {
  account: HubAccount;
  /** The active nav entry's 20px page title. */
  title: string;
  /**
   * The 13px subhead: a screen's own derived string when it registered one via
   * `useHubSubtitle`, otherwise the nav entry's static fallback. Empty renders
   * nothing rather than an empty line.
   */
  subtitle: string;
  /**
   * A screen-supplied node dropped into the right-hand cluster, ahead of the
   * account chip — today only the Load Board's vehicle-capacity pill.
   *
   * Registered from below via `useHubVehiclePill()` rather than passed down
   * from a page, because the screens are client components mounted inside this
   * header's own subtree. `null`/absent (every screen but Loads) renders
   * nothing at all — not an empty box.
   */
  vehiclePill?: React.ReactNode;
};

/**
 * The hub's sticky top bar: page title and subhead on the left, then the
 * screen's own header slot, the account chip, the availability pill, the
 * avatar block and sign out on the right.
 *
 * The prototype puts a Business/Individual **segmented control** here. That is
 * a prototype affordance — it exists so one HTML file can demo both shapes of
 * the product. In the real app the account kind is derived from the session by
 * `resolveHubAccount()` and is the same fact the Drivers/Employees pages guard
 * on server-side, so a client-side switcher would be a control that either
 * lies (the pages still redirect) or grants screens the session does not
 * entitle the user to. Hence the static chip below. Do not re-add the switcher.
 *
 * ## What the header-alignment handoff added, and what it deliberately did not
 *
 * `UI:UX/Registered Driver account (New)/Driver dashboard header alignment/`
 * reshapes this bar towards the client site header's vocabulary. Three of its
 * elements are **not** built here, each for a reason that is a fact about this
 * codebase rather than a preference:
 *
 * - **No notifications bell.** There is no notification system anywhere in this
 *   repo — no model in `prisma/schema.prisma`, nothing under `src/lib` or
 *   `src/app/api`. A bell needs a table, a read/unread model, write points at
 *   every order-lifecycle event and a delivery mechanism; it is a feature with
 *   a data layer, not a header component, and it is deferred to its own spec
 *   alongside the Phase 2 email/SMS work. A bell that never lights is worse
 *   than no bell, so none is rendered and no placeholder count either.
 * - **No "My account" link.** `/account` is client-only and
 *   `src/app/account/page.tsx` redirects any non-CLIENT role straight back to
 *   `/dashboard`, so the link would be a loop. A driver-side account settings
 *   screen does not exist yet; adding one is its own task.
 * - **No active-job indicator.** The data behind it (`getHubToday()` in
 *   `src/lib/dashboard/hub/today.ts`) is resolved per-screen, and this header
 *   is a client component whose shell's contract is that nothing in it
 *   fetches. Surfacing it globally means `(hub)/layout.tsx` resolving it and
 *   threading it through the shell — a change to files outside the task that
 *   introduced this comment.
 *
 * What the handoff *did* land: the nav relabelling in `driver-hub-nav.ts`
 * ("Wallet" → `/dashboard/earnings`, "My orders" → `/dashboard/jobs`, never the
 * client `/wallet` and `/orders` routes) and the `vehiclePill` slot below.
 */
export function DriverHubHeader({
  account,
  title,
  subtitle,
  vehiclePill,
}: DriverHubHeaderProps) {
  const { signOut, signingOut } = useSignOut();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-6 border-b border-border bg-background px-8 py-[22px]">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold tracking-[-0.015em]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-[18px]">
        {/* The screen's own slot, ahead of everything the shell owns: the
            design places the Load Board's vehicle pill between the flex spacer
            and the identity block, not inside it. */}
        {vehiclePill}

        <Badge
          variant="outline"
          className="h-auto rounded-full px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.02em] text-muted-foreground"
        >
          {ACCOUNT_KIND_LABELS[account.kind]}
        </Badge>

        {/* A company session has no availability to flip — `isOnline` is
            `null` for it, and the endpoint 403s a non-DRIVER outright — so the
            pill is absent rather than rendered in a permanently dead state. */}
        {account.isOnline !== null ? (
          <HubOnlineToggle
            isOnline={account.isOnline}
            canToggleOnline={account.canToggleOnline}
          />
        ) : null}

        <div className="flex items-center gap-2.5 border-l border-border pl-[18px]">
          <div
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-border text-[13px] font-semibold"
          >
            {account.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">
              {account.displayName}
            </p>
            {/* Mono, like every id, plate and figure on this surface. */}
            <p className="truncate font-price text-[11px] text-muted-foreground">
              {account.identifier}
            </p>
          </div>
        </div>

        {/* The hub's only way out, and the reason it has to live here: the
            shell's root carries `data-admin-surface`, and `globals.css` hides
            the global site header (`body:has([data-admin-surface]) > header`)
            for the whole surface. That header is `AuthStatus`, which owns the
            app's other sign out — so without this control a signed-in driver
            or company user browsing the hub has no way to sign out at all.

            Ghost rather than outline: the availability pill next to it is the
            header's one real decision, and a bordered button here would read
            as a second one. `useSignOut()` owns the Better Auth call and the
            navigation that follows it, so nothing is routed from here. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            void signOut();
          }}
          disabled={signingOut}
          className="text-[13px] text-muted-foreground hover:text-foreground"
        >
          <LogOut aria-hidden="true" data-icon="inline-start" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </header>
  );
}
